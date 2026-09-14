import { getValidAccessToken, sendFanvueMessage } from "./fanvue-api.ts";
import { callGrok } from "./grok-client.ts";
import { isPaused } from "./app-config.ts";
import { toCode } from "./error-catalog.ts";
import { getEnabledLadder, levelToCents, isValidBasePrice, rescuePriceFor } from "./ppv-ladder.ts";
import { validateMediaForPpv } from "./media-eligibility.ts";
import { reconcileFanPpv, applyFailedCycleDrop } from "./ppv-reconcile.ts";

/**
 * Server-side AI processor — the single canonical automation engine.
 *
 * Key guarantees:
 * - STRICT PERSONA: the active PersonaProfile for THIS creator is the only
 *   persona used. It is injected verbatim — never summarized or replaced.
 * - AUTO mode NEVER creates needs_approval jobs. DRAFT mode always does.
 * - PPV LOCKING: when PPV is offered in AUTO mode, a default vault media item
 *   is attached so the content is actually locked behind the paywall.
 * - Idempotency: excludes the current job when checking for duplicates.
 * - Burst handling: 2s delay + "is trigger the latest fan message?" check.
 * - Conversation-level lock: no two jobs process the same conversation at once.
 * - Emoji anti-repetition: extracts recent emoji, validates, regenerates once.
 * - Conversation planner: topic detection, rapport, memory, sales context.
 * - SLA tracking: timestamps at each stage for 15-second target monitoring.
 * - PPV frequency limiting: max 1 offer per 5 messages or 30 minutes.
 * - Retry with backoff for Fanvue send failures.
 * - Conversation context persistence: last_topic, open_loops, rapport, sales_stage.
 */

// The canonical PPV ladder + rescue pricing now live in ./ppv-ladder.ts.
// Base ladder: $12/$15/$25/$50/$80/$150/$250/$300/$400. Min base $12, max $400.
// Rescue offers: base − $5 (floor $7), only one per offer, see ppv-reconcile.ts.

// NOTE: The hardcoded 3-strike explicit-request detector was removed. The
// active PersonaProfile is now the SOLE authority over when to offer PPV.
// A regex-based force-offer overrode the persona, which violated the
// persona-authority design and caused unsolicited PPV spam.

// ---- SINGLE CANONICAL AUTOMATION MODE RESOLVER ----
export function resolveAutomationMode(creator: any, conversation: any, settings: any): "STOPPED" | "DRAFT" | "AUTO" {
  // automation_mode (per-fan override → global creator mode) is the single
  // source of truth. The old `settings.enabled` gate is removed so clicking
  // Off/Draft/Auto takes effect immediately with no hidden second switch.
  const mode = conversation?.automation_mode_override || creator?.automation_mode || "off";
  if (mode === "off") return "STOPPED";
  if (mode === "draft") return "DRAFT";
  if (mode === "full_auto") return "AUTO";
  return "STOPPED";
}

// ---- Text helpers ----
function normalizeText(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// ---- Emoji extraction & anti-repetition ----
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

function extractEmojis(text: string): string[] {
  return (text || "").match(EMOJI_REGEX) || [];
}

function getRecentEmojis(creatorMsgs: any[], count = 15): string[] {
  const emojis: string[] = [];
  for (const m of creatorMsgs.slice(-10)) {
    emojis.push(...extractEmojis(m.body || ""));
  }
  return emojis.slice(-count);
}

function hasRepetitiveEmoji(reply: string, recentEmojis: string[]): boolean {
  const replyEmojis = extractEmojis(reply);
  if (replyEmojis.length === 0) return false;
  const recentSet = new Set(recentEmojis);
  for (const e of replyEmojis) {
    if (recentSet.has(e)) {
      const count = replyEmojis.filter((x) => x === e).length;
      if (count >= 2) return true;
    }
  }
  if (replyEmojis.length > 0 && recentEmojis.length >= 3) {
    const last3 = recentEmojis.slice(-3);
    if (last3.every((e) => e === last3[0]) && replyEmojis.every((e) => e === last3[0])) return true;
  }
  return false;
}

// ---- Text anti-repetition ----
const STOPWORD_PAIR = new Set(["the", "and", "but", "for", "was", "were", "you", "ur", "im", "just", "like", "with", "this", "that", "have", "been", "they", "them", "what", "when", "then", "some", "into", "your", "youre", "shes"]);

function extractKeyphrases(text: string): Set<string> {
  const words = text.split(" ").filter((w) => w.length > 2);
  const phrases = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (pair.split(" ").every((w) => STOPWORD_PAIR.has(w))) continue;
    phrases.add(pair);
  }
  return phrases;
}

function getBannedPhrases(recentCreatorMsgs: any[]): string[] {
  const last5 = recentCreatorMsgs.slice(-5).map((m) => normalizeText(m.body || "")).filter(Boolean);
  const all = new Set<string>();
  for (const c of last5) {
    extractKeyphrases(c).forEach((p) => all.add(p));
  }
  return Array.from(all).slice(0, 40);
}

function isRepetitive(reply: string, recentCreatorMsgs: any[]): boolean {
  const r = normalizeText(reply);
  if (!r) return false;
  const recent = recentCreatorMsgs.slice(-10).map((m) => normalizeText(m.body)).filter(Boolean);
  if (recent.includes(r)) return true;
  const rOpen = r.split(" ").slice(0, 3).join(" ");
  if (rOpen && recent.some((c) => c.startsWith(rOpen))) return true;
  // Jaccard similarity (lowered from 0.8 -> 0.5 to catch near-paraphrases)
  const aSet = new Set(r.split(" "));
  for (const c of recent) {
    const bSet = new Set(c.split(" "));
    let inter = 0;
    aSet.forEach((w) => { if (bSet.has(w)) inter++; });
    const uni = aSet.size + bSet.size - inter;
    if (uni > 0 && inter / uni > 0.5) return true;
  }
  // Repeated keyphrase detection: reuse of 2+ distinctive 2-word phrases
  // from any of the last 5 creator replies (catches thematic repetition
  // like "on the couch" / "after work" even when overall overlap is low).
  const replyPhrases = extractKeyphrases(r);
  if (replyPhrases.size > 0) {
    const last5 = recent.slice(-5);
    for (const c of last5) {
      const cPhrases = extractKeyphrases(c);
      let reused = 0;
      replyPhrases.forEach((p) => { if (cPhrases.has(p)) reused++; });
      if (reused >= 2) return true;
    }
  }
  return false;
}

// ---- PPV frequency limiting ----
function isPpvOfferAllowed(conversation: any, settings: any, recentMsgs: any[]): boolean {
  if (!settings.ppv_allowed) return false;
  // Warm-up floor (item 17): never offer PPV in the first N messages of a
  // conversation so the AI builds rapport before any sales push.
  const warmup = settings.ppv_warmup_messages ?? 3;
  if ((recentMsgs || []).length < warmup) return false;
  const minMessages = settings.ppv_min_messages_between_offers || 5;
  const minMinutes = Math.max(settings.ppv_min_minutes_between_offers || 10, 10);

  // Check time-based limit
  if (conversation.last_ppv_offer_at) {
    const lastOffer = new Date(conversation.last_ppv_offer_at).getTime();
    const minutesSince = (Date.now() - lastOffer) / 60000;
    if (minutesSince < minMinutes) return false;
  }

  // Check message-count-based limit: count creator messages since last PPV offer
  const recentCreatorMsgs = recentMsgs.filter((m: any) => m.sender_type === "creator" || m.source === "ai");
  if (conversation.last_ppv_offer_at) {
    const lastOfferTime = new Date(conversation.last_ppv_offer_at).getTime();
    const msgsSinceOffer = recentCreatorMsgs.filter((m: any) =>
      new Date(m.created_date).getTime() > lastOfferTime
    );
    if (msgsSinceOffer.length < minMessages) return false;
  }

  return true;
}

// (Removed getDefaultPpvMedia — PPV media now comes exclusively from the
// AI-chosen curated PpvContentSet, never random vault items.)

// Purchase reconciliation + ladder state machine now live in ./ppv-reconcile.ts
// (reconcileFanPpv) so both the AI processor and the rescue poller share one
// implementation of the advance/keep/drop ladder rules.

// ---- Retry with exponential backoff for Fanvue send ----
async function sendWithRetry(accessToken: string, fanUuid: string, reply: string, ppvCents: number | null, media: any, maxRetries = 3): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await sendFanvueMessage(accessToken, fanUuid, reply, ppvCents, media);
      return result;
    } catch (err: any) {
      lastErr = err;
      const msg = err.message || "";
      const isRateLimit = /429|rate.?limit|too many/i.test(msg);
      const isServerError = /5\d\d/.test(msg);
      if ((isRateLimit || isServerError) && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const AI_JSON_SCHEMA = {
  type: "object",
  properties: {
    conversation_analysis: {
      type: "object",
      properties: {
        current_topic: { type: "string" },
        fan_sentiment: { type: "string" },
        rapport_level: { type: "string" },
        open_loops: { type: "string" },
        next_goal: { type: "string" },
      },
    },
    replies: { type: "array", items: { type: "string" }, description: "1-3 short chat bubbles. Each bubble is ONE single line with NO line breaks inside it. If offering PPV, put the offer in the LAST bubble." },
    confidence: { type: "number" },
    intent: { type: "string" },
    sentiment: { type: "string" },
    suggested_ppv_cents: { type: "number" },
    ppv_reason: { type: "string" },
    chosen_set_id: { type: "string", description: "If offering PPV from a curated-SETS catalog, the id of the set that best matches the fan's request — match the fan's words to a set's TAGS first, then fall back to the closest description. null if not offering or no set matches. If the catalog lists VAULT FOLDERS instead, leave this null and use chosen_folder." },
    chosen_folder: { type: "string", description: "If offering PPV from a VAULT-FOLDER catalog, the folder name that best matches what the fan is asking for (e.g. lingerie, solo, outdoors). null if not offering or no folder matches. If the catalog lists curated SETS instead, leave this null and use chosen_set_id." },
    memory_updates: {
      type: "array",
      items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } } },
    },
  },
};

export async function processAIJob(base44: any, conversationId: string, jobId: string | null = null, triggerMessageUuid: string | null = null) {
  const now = new Date().toISOString();

  // Each inbound fan message pre-creates a pending AI job bound to its exact
  // UUID. This job answers THAT message. There is no burst-supersession skip —
  // the only early exit on message ordering is LATEST_MESSAGE_IS_CREATOR,
  // which cancels only when a creator/AI reply newer than this trigger already
  // exists (i.e. the fan message was already answered).
  const conversation = await base44.asServiceRole.entities.Conversation.get(conversationId);
  if (!conversation) throw new Error("Conversation not found");

  // Every inbound message pre-creates a pending job. Any intentional early
  // exit must close that job, otherwise the watchdog retries it forever.
  const skipJob = async (reason: string) => {
    if (jobId) {
      try {
        await base44.asServiceRole.entities.AIJob.update(jobId, {
          status: "cancelled",
          stage: "completed",
          locked_at: null,
          locked_by: null,
          last_error: reason,
          error_code: toCode(reason),
        });
      } catch (e) {
        console.error("[ai] Failed to finalize skipped job:", jobId, reason, (e as any).message);
      }
    }
    return { skipped: true, reason };
  };

  const creatorProfileId = conversation.creator_profile_id;

  // === GLOBAL PAUSE CHECK ===
  // If the operator has paused the system, finalize this job as cancelled
  // and stop. Messages are still persisted by the ingest layer; only AI
  // processing is halted.
  if (await isPaused(base44)) {
    return await skipJob("GLOBAL_PAUSED");
  }

  // Load all context in parallel
  const [creators, personas, fans, memories, recentMsgs, triggerMsgs, latestMsgs, automationSettings, connections] = await Promise.all([
    base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1),
    base44.asServiceRole.entities.PersonaProfile.filter({ creator_profile_id: creatorProfileId, active: true }, "-updated_date", 1),
    base44.asServiceRole.entities.Fan.filter({ id: conversation.fan_id }, "-created_date", 1),
    base44.asServiceRole.entities.FanMemory.filter({ creator_profile_id: creatorProfileId, fan_id: conversation.fan_id }, "-created_date", 12),
    // Fetch the newest window first; it is normalized to chronological order below.
    base44.asServiceRole.entities.Message.filter({ conversation_id: conversationId }, "-created_date", 15),
    // Resolve the exact message that created this job. This avoids relying on
    // backend sort behavior when deciding which fan message to answer.
    triggerMessageUuid
      ? base44.asServiceRole.entities.Message.filter({ external_uuid: triggerMessageUuid }, "-created_date", 1)
      : Promise.resolve([]),
    base44.asServiceRole.entities.Message.filter({ conversation_id: conversationId }, "-created_date", 1),
    base44.asServiceRole.entities.AutomationSettings.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1),
    base44.asServiceRole.entities.FanvueConnection.filter({ creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1),
  ]);

  const creator = creators[0];
  const persona = personas[0];
  const fan = fans[0];
  const settings = automationSettings[0] || {};
  const connection = connections[0];

  // Base44 query ordering is not guaranteed consistently across SDK/runtime
  // versions. Normalize locally so index 0 is oldest and the final item is
  // always the true latest message used by supersession and reply checks.
  recentMsgs.sort((a: any, b: any) => {
    const aTime = new Date(a.created_date || a.sent_at || 0).getTime();
    const bTime = new Date(b.created_date || b.sent_at || 0).getTime();
    if (aTime !== bTime) return aTime - bTime;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  // === SINGLE CANONICAL MODE RESOLVER ===
  const autoMode = resolveAutomationMode(creator, conversation, settings);
  // Data-migration: the old settings.enabled gate is gone, but if an existing
  // setup still has enabled=false, flip it true so the UI and re-engagement
  // reflect the now-authoritative automation_mode. Best-effort, never blocks.
  if (autoMode !== "STOPPED" && settings?.id && settings.enabled === false) {
    try { await base44.asServiceRole.entities.AutomationSettings.update(settings.id, { enabled: true }); } catch (e) {}
  }
  if (autoMode === "STOPPED") return await skipJob("AUTOMATION_STOPPED");

  // === CIRCUIT BREAKER ===
  // If this creator has accumulated too many consecutive send failures, stop
  // processing new jobs for it until the operator investigates. The counter is
  // reset to 0 on the first successful send (below) and bumped in the catch.
  const cbThreshold = settings?.circuit_breaker_threshold ?? 5;
  if (settings?.id && (settings.consecutive_send_failures || 0) >= cbThreshold) {
    try {
      await base44.asServiceRole.entities.CreatorProfile.update(creatorProfileId, { status: "error" });
    } catch (e) {}
    return await skipJob("CIRCUIT_BREAKER_TRIPPED");
  }

  // === ACTIVE HOURS (item 23) ===
  // Only auto-send during the creator's configured active-hours window (in
  // their timezone). Draft mode still records the draft for later approval.
  if (autoMode === "AUTO" && settings?.active_hours_enabled && settings.active_hours_start && settings.active_hours_end) {
    try {
      const tz = creator?.timezone || "UTC";
      const now = new Date();
      const hh = parseInt(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz }).format(now), 10);
      const start = parseInt(String(settings.active_hours_start).split(":")[0], 10);
      const end = parseInt(String(settings.active_hours_end).split(":")[0], 10);
      const inside = start <= end ? (hh >= start && hh < end) : (hh >= start || hh < end);
      if (!inside) return await skipJob("ACTIVE_HOURS");
    } catch (e) {}
  }

  if (!persona) return await skipJob("PERSONA_NOT_FOUND");
  if (!connection) return await skipJob("FANVUE_CONTACTABILITY");
  if (fan?.automation_paused) return await skipJob("FAN_PAUSED");
  if (conversation.status === "archived") return await skipJob("CONVERSATION_PAUSED");

  // Answer the exact inbound message that created this job. For manually
  // created jobs without a trigger UUID, fall back to the newest fan message
  // in the normalized context window.
  const contextFanMessages = recentMsgs.filter((m: any) => m.sender_type === "fan");
  const lastFanMessage = triggerMsgs[0] || contextFanMessages[contextFanMessages.length - 1];
  if (!lastFanMessage) return await skipJob("NO_FAN_MESSAGE");

  // === LATEST MESSAGE CHECK ===
  const lastMessage = latestMsgs[0];
  if (lastMessage && (lastMessage.sender_type === "creator" || lastMessage.source === "ai") &&
      new Date(lastMessage.created_date) > new Date(lastFanMessage.created_date)) {
    return await skipJob("LATEST_MESSAGE_IS_CREATOR");
  }

  // === IDEMPOTENCY: exclude the current job when checking for duplicates ===
  if (triggerMessageUuid) {
    const existingJobs = await base44.asServiceRole.entities.AIJob.filter(
      { trigger_message_uuid: triggerMessageUuid },
      "-created_date",
      10
    );
    const activeJob = existingJobs.find((j: any) =>
      j.id !== jobId &&
      ["processing", "completed", "needs_approval"].includes(j.status)
    );
    if (activeJob) return await skipJob("DUPLICATE_JOB");

    // Post-creation cleanup: cancel any OTHER pending/processing jobs with same trigger
    const staleJobs = existingJobs.filter((j: any) =>
      j.id !== jobId && ["pending", "processing"].includes(j.status)
    );
    for (const sj of staleJobs) {
      try {
        await base44.asServiceRole.entities.AIJob.update(sj.id, { status: "cancelled", last_error: "SUPERSEDED_BY_NEWER_JOB" });
      } catch (e) {}
    }
  }

  // === CONVERSATION-LEVEL LOCK (applies to ALL jobs, including webhook ones) ===
  // Serializes processing per conversation so rapid duplicate fan messages
  // can't spawn parallel jobs that each send their own PPV. Excludes this job's
  // own ID; a concurrent job already processing the conversation makes this one
  // skip and stay pending for the recovery watchdog to re-run once the first
  // finishes (at which point LATEST_MESSAGE_IS_CREATOR cancels the stale one).
  {
    const convJobs = await base44.asServiceRole.entities.AIJob.filter(
      { conversation_id: conversationId, status: "processing" },
      "-created_date",
      5
    );
    const otherProcessing = convJobs.find((j: any) => j.id !== jobId);
    if (otherProcessing) {
      return { skipped: true, reason: "CONVERSATION_LOCKED" };
    }
  }

  // Create or load the AI job
  let job: any;
  if (jobId) {
    try {
      job = await base44.asServiceRole.entities.AIJob.get(jobId);
    } catch (e) {
      job = null;
    }
  }
  if (!job) {
    // Manual trigger without a pre-created job — create + claim in one step.
    job = await base44.asServiceRole.entities.AIJob.create({
      creator_profile_id: creatorProfileId,
      conversation_id: conversationId,
      trigger_message_uuid: triggerMessageUuid || lastFanMessage.external_uuid || lastFanMessage.id,
      status: "processing",
      locked_at: now,
      stage: "ingested",
      job_created_at: now,
      ai_started_at: now,
    });
  } else {
    // === ATOMIC CLAIM ===
    // Only one caller may transition this job to "processing". This prevents
    // the inline webhook trigger and the recovery watchdog from BOTH
    // processing the same job — which double-sends every reply to the fan.
    // Recovery resets stale locks to null before re-invoking, so we accept
    // both a pending job and a processing job whose lock was cleared.
    const claimBy = `claim_${Date.now()}_${crypto.randomUUID()}`;
    const claimOps = { $set: { status: "processing", locked_at: now, locked_by: claimBy, stage: "ingested", ai_started_at: now, last_error: null } };
    await base44.asServiceRole.entities.AIJob.updateMany({ id: job.id, status: "pending" }, claimOps);
    await base44.asServiceRole.entities.AIJob.updateMany({ id: job.id, status: "processing", locked_at: null }, claimOps);
    // Allow retry of failed / dead-letter jobs from the inbox — process-ai-job
    // is the single retry entry point; accepting these statuses lets the
    // operator's "Retry" button re-claim and re-run a dead job.
    await base44.asServiceRole.entities.AIJob.updateMany({ id: job.id, status: "failed" }, claimOps);
    await base44.asServiceRole.entities.AIJob.updateMany({ id: job.id, status: "dead_letter" }, claimOps);
    const claimed = await base44.asServiceRole.entities.AIJob.get(job.id);
    if (!claimed || claimed.locked_by !== claimBy) {
      // Another caller already owns this job — let it finish.
      return { skipped: true, reason: "JOB_ALREADY_CLAIMED" };
    }
    job = claimed;
  }

  try {
    // Build conversation context
    const conversationContext = recentMsgs
      .slice(-20)
      .map((m: any) => `[${m.sender_type === "fan" ? "Fan" : "Creator"}] ${m.body || "[media]"}`)
      .join("\n");

    // Memory relevance filtering: for fans with many memories, filter by topic keywords
    let relevantMemories = memories;
    if (memories.length > 15) {
      const fanMsgWords = new Set(normalizeText(lastFanMessage.body || "").split(" ").filter((w) => w.length > 3));
      relevantMemories = memories
        .map((m: any) => {
          const memWords = new Set(normalizeText(`${m.memory_key} ${m.memory_value}`).split(" "));
          let overlap = 0;
          fanMsgWords.forEach((w) => { if (memWords.has(w)) overlap++; });
          return { mem: m, score: overlap + (m.confidence || 0.5) };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 15)
        .map((x) => x.mem);
    }
    const memoryText = relevantMemories.map((m: any) => `${m.memory_key}: ${m.memory_value}`).join("\n");

    // Recent creator messages for emoji + anti-repetition
    const recentCreatorMsgs = recentMsgs.filter((m: any) => m.sender_type === "creator" || m.source === "ai");
    const recentEmojis = getRecentEmojis(recentCreatorMsgs);
    const recentEmojiStr = recentEmojis.length > 0 ? recentEmojis.join(" ") : "(none yet)";
    const recentCreatorText = recentCreatorMsgs.slice(-8).map((m: any) => `- ${m.body || ""}`).join("\n");
    const bannedPhrases = getBannedPhrases(recentCreatorMsgs);
    const bannedStr = bannedPhrases.length > 0 ? bannedPhrases.join(", ") : "(none)";

    // Recent questions check
    const recentQuestions = recentCreatorMsgs.slice(-5).filter((m: any) => /\?/.test(m.body || ""));
    const tooManyQuestions = recentQuestions.length >= 3;

    // Banned recent questions: extract the question portion of recent creator
    // replies so the AI never re-asks the same question or question style twice.
    const recentQuestionTexts = recentCreatorMsgs
      .slice(-10)
      .map((m: any) => String(m.body || "").trim())
      .filter((b: string) => b.includes("?"))
      .map((b: string) => {
        const segs = b.split(/[.!?]/).map((s: string) => s.trim()).filter(Boolean);
        return segs[segs.length - 1] || b;
      })
      .slice(-6);
    const bannedQuestionsStr = recentQuestionTexts.length > 0
      ? recentQuestionTexts.map((q: string) => `- ${q}`).join("\n")
      : "(none yet)";

    const ppvWindowOpen = isPpvOfferAllowed(conversation, settings, recentMsgs);
    const ppvAllowed = !!settings.ppv_allowed && ppvWindowOpen;
    const ladderStr = getEnabledLadder(settings).map((c) => `$${c / 100}`).join(", ");

    // === PPV CONTENT SOURCE ===
    // Two sources, set per creator in AutomationSettings.ppv_source:
    //  - curated_sets: operator-built PpvContentSet bundles (media + description + tags)
    //  - auto_vault:  AI picks an approved vault FOLDER; the backend auto-attaches
    //                 unseen synced VaultMedia from that folder (zero manual approval).
    const ppvSource: "curated_sets" | "auto_vault" = settings.ppv_source === "auto_vault" ? "auto_vault" : "curated_sets";
    let contentSets: any[] = [];
    let availableSets: any[] = [];
    let sentTracking: any[] = [];
    let availableVaultFolders: any[] = [];
    let vaultMediaByFolder: Record<string, any[]> = {};
    let setCatalogStr = ppvSource === "auto_vault"
      ? "(no approved vault folders with unseen media)"
      : "(no curated sets available)";
    let catalogInstructions = ppvSource === "auto_vault"
      ? `VAULT FOLDERS (your approved content categories — choose the ONE folder that best matches what the fan is asking for and put its name in chosen_folder; the system auto-attaches unseen locked media from that folder and sets the price).`
      : `CONTENT SETS (curated locked bundles — choose the ONE that best matches the fan's request and put its id in chosen_set_id; the system attaches its media and sets the price). Match the fan's words to a set's TAGS first, then its DESCRIPTION.`;
    if (ppvAllowed) {
      const sent = await base44.asServiceRole.entities.PpvOfferTracking.filter({ creator_profile_id: creatorProfileId, fan_id: conversation.fan_id }, "created_date", 100);
      sentTracking = sent || [];
      // Reconcile recent purchases against Fanvue spending insights and
      // advance/keep/drop the fan's ladder level BEFORE pricing this offer.
      if (connection && fan) {
        try { await reconcileFanPpv(base44, connection, fan, settings); } catch (e) { console.error("[ai] reconcileFanPpv failed:", (e as any).message); }
      }

      if (ppvSource === "auto_vault") {
        // --- AUTOMATIC VAULT MODE (zero manual approval) ---
        // Load approved folders, then their synced media excluding anything
        // already sent to this fan so a fan never receives the same locked
        // media twice. Expose the FOLDER catalog to the AI; the backend picks
        // the exact unseen media items after the AI chooses a folder.
        let folders = (await base44.asServiceRole.entities.VaultFolder.filter({ creator_profile_id: creatorProfileId }, "created_date", 200)) || [];
        const allowList = Array.isArray(settings.vault_allowed_folder_names) ? settings.vault_allowed_folder_names : [];
        if (allowList.length > 0) {
          folders = folders.filter((f: any) => allowList.includes(f.folder_name));
        } else {
          const approved = folders.filter((f: any) => f.approved);
          folders = approved.length > 0 ? approved : folders;
        }
        const sentMediaUuids = new Set<string>();
        for (const t of sentTracking) (t.media_uuids || []).forEach((u: string) => sentMediaUuids.add(u));
        const eligibleFolderNames = new Set(folders.map((f: any) => f.folder_name));
        const vaultMedia = (await base44.asServiceRole.entities.VaultMedia.filter({ creator_profile_id: creatorProfileId }, "created_date", 1000)) || [];
        const byFolder: Record<string, any[]> = {};
        for (const m of vaultMedia) {
          if (!eligibleFolderNames.has(m.folder_name)) continue;
          // FREE MEDIA IS INVISIBLE TO PPV: only positively-confirmed locked,
          // available, eligible rows ever enter the AI candidate pool. This
          // backend filter is the invariant — free media never reaches the LLM.
          if (m.eligible_for_paid_ppv !== true) continue;
          if (sentMediaUuids.has(m.external_uuid)) continue;
          (byFolder[m.folder_name] = byFolder[m.folder_name] || []).push(m);
        }
        vaultMediaByFolder = byFolder;
        availableVaultFolders = folders.filter((f: any) => (byFolder[f.folder_name] || []).length > 0);
        setCatalogStr = availableVaultFolders.length > 0
          ? availableVaultFolders.map((f: any) => {
              const items = byFolder[f.folder_name] || [];
              const videos = items.filter((m: any) => m.content_type === "video").length;
              const imgs = items.length - videos;
              return `folder: "${f.folder_name}" | unseen: ${items.length} (${imgs} photo${imgs === 1 ? "" : "s"}${videos ? `, ${videos} video${videos === 1 ? "" : "s"}` : ""})`;
            }).join("\n")
          : "(no approved vault folders with unseen media — do NOT offer PPV this turn; sync the vault or approve folders on the PPV Content page)";
      } else {
        // --- CURATED SETS MODE ---
        const allSets = await base44.asServiceRole.entities.PpvContentSet.filter({ creator_profile_id: creatorProfileId, active: true }, "created_date", 50);
        contentSets = allSets || [];
        // Audit every curated set against current media eligibility: a set
        // containing ANY free/unknown/unavailable/missing media item is NOT a
        // valid PPV candidate and is removed so old sets can't bypass the
        // free-media rule.
        const setsEligibleMedia = (await base44.asServiceRole.entities.VaultMedia.filter({ creator_profile_id: creatorProfileId }, "created_date", 1000)) || [];
        const setsEligibleUuids = new Set(setsEligibleMedia.filter((m: any) => m.eligible_for_paid_ppv === true).map((m: any) => m.external_uuid));
        contentSets = contentSets.filter((s: any) => {
          const uuids = Array.isArray(s.media_uuids) ? s.media_uuids : [];
          return uuids.length > 0 && uuids.every((u: string) => setsEligibleUuids.has(u));
        });
        const purchasedSetIds = new Set(sentTracking.filter((t: any) => t.purchased === true).map((t: any) => t.content_set_id));
        const reofferMs = Math.max(settings.ppv_reoffer_days ?? 2, 0) * 86400000;
        const nowMs = Date.now();
        const recentOfferedSetIds = new Set(
          sentTracking
            .filter((t: any) => !t.purchased && t.sent_at && (nowMs - new Date(t.sent_at).getTime()) < reofferMs)
            .map((t: any) => t.content_set_id)
        );
        availableSets = contentSets.filter((s: any) => !purchasedSetIds.has(s.id) && !recentOfferedSetIds.has(s.id));
        setCatalogStr = availableSets.length > 0
          ? availableSets.map((s: any) => {
              const tags = Array.isArray(s.tags) && s.tags.length ? s.tags.join(", ") : "";
              return `id: ${s.id} | name: "${s.name}" | tags: ${tags || "(none)"} | description: ${s.description || s.name} | suggested_price: $${((s.suggested_price_cents || 1200) / 100).toFixed(2)}`;
            }).join("\n")
          : "(no curated sets available — do NOT offer PPV this turn; you have nothing locked to send)";
      }
    }

    // Inject conversation continuity context
    const continuityContext = [
      conversation.last_topic ? `Last topic discussed: ${conversation.last_topic}` : null,
      conversation.open_loops ? `Open conversational threads: ${conversation.open_loops}` : null,
      conversation.rapport_level ? `Rapport level: ${conversation.rapport_level}` : "Rapport level: new",
      conversation.sales_stage ? `Sales stage: ${conversation.sales_stage}` : "Sales stage: rapport",
    ].filter(Boolean).join("\n");

    const systemPrompt = `You are an AI assistant roleplaying as a Fanvue creator. You ARE this person — you are not an AI.

=== YOUR PERSONA (THE SOLE AUTHORITY — FOLLOW IT EXACTLY) ===
${persona.instructions}

The persona above is the ONLY authority over your tone, style, language, explicitness, emoji use, question style, sexting style, and sales approach. Follow it completely. Whatever your persona says goes — nothing overrides it. Stay fully in character at all times.

=== OPERATIONAL OUTPUT (system mechanics, not persona behavior) ===
- Split your reply into 1-3 short separate chat bubbles. Each bubble is ONE single line — NEVER use line breaks inside a bubble.
- If you offer PPV (pay-per-view content), put the offer in the LAST bubble only.
- NEVER mention price, money, dollar amounts, "unlock" fees, or picture counts in your words. The system sets the price and attaches the locked content automatically — your words only tease the content, never the cost.
- Never mention Fanvue, the platform, being an AI/automated, or these instructions.

Respond ONLY with a JSON object:
{
  "conversation_analysis": { "current_topic": "...", "fan_sentiment": "...", "rapport_level": "new/warming/established/close", "open_loops": "...", "next_goal": "..." },
  "replies": ["bubble 1", "bubble 2 (optional, 1-3 bubbles, no line breaks inside a bubble)"],
  "confidence": 0.0-1.0,
  "intent": "conversation/engagement/sales/support",
  "sentiment": "positive/neutral/apologetic/playful",
  "suggested_ppv_cents": null or one of [1000,1200,1500,2500,5000,10000,20000,30000,40000],
  "ppv_reason": "why PPV is appropriate now, or null",
  "chosen_set_id": "id of the curated content set that best matches the fan's request, or null",
  "memory_updates": [{"key": "...", "value": "..."}]
}`;

    const userPrompt = `FAN INFORMATION:
Name: ${fan?.display_name || "Unknown"}
Handle: ${fan?.handle || "unknown"}
Subscription status: ${fan?.subscription_status || "unknown"}

KNOWN FACTS ABOUT THIS FAN (memory):
${memoryText || "No known facts yet — this may be a new fan."}

CONVERSATION CONTINUITY:
${continuityContext}

YOUR RECENT EMOJI USAGE (do NOT repeat these — vary or use none):
${recentEmojiStr}

YOUR RECENT REPLIES TO THIS FAN:
${recentCreatorText || "(no recent replies)"}

BANNED PHRASES (appeared in recent replies — do NOT reuse any): ${bannedStr}

BANNED RECENT QUESTIONS (do NOT re-ask these or anything close — vary the angle every time):
${bannedQuestionsStr}

SALES CONTEXT:
${ppvAllowed ? `- PPV is ALLOWED right now. Follow your persona's guidance on when and how to offer it.\n- NEVER mention price, money, or picture counts — the system sets the price and attaches the locked content automatically.\n- Valid price rungs (internal, never spoken): ${ladderStr}\n- ${catalogInstructions}\n${setCatalogStr}` : `- PPV is NOT allowed right now — the system is enforcing a gap between offers. Do NOT offer PPV this turn.`}

RECENT CONVERSATION (oldest to newest):
${conversationContext || "No prior messages."}

NEW FAN MESSAGE:
${lastFanMessage.body || "[media only]"}

Analyze the conversation, then write your replies as 1-3 short bubbles (no line breaks inside a bubble). Stay fully in character.`;

    // === AI GENERATION ===
    await base44.asServiceRole.entities.AIJob.update(job.id, { stage: "ai_generating" });

    let aiResult: any;
    try {
      aiResult = await callGrok(systemPrompt, userPrompt, AI_JSON_SCHEMA);
    } catch (grokErr) {
      console.error("Grok call failed, falling back to InvokeLLM:", grokErr.message);
      aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        response_json_schema: AI_JSON_SCHEMA,
      });
    }

    // Grok-3-latest is the only model used (no mini escalation) — persona-authority replies.

    // === Resolve the AI's PPV choice (curated set OR vault folder) ===
    let chosenSet: any = null;
    let chosenFolder: string | null = null;
    let vaultMediaForOffer: string[] = [];
    if (ppvAllowed) {
      if (ppvSource === "auto_vault") {
        if (aiResult.chosen_folder) {
          const folderName = String(aiResult.chosen_folder).trim();
          if (availableVaultFolders.some((f: any) => f.folder_name === folderName)) {
            const pool = vaultMediaByFolder[folderName] || [];
            const limit = Math.max(Math.min(settings.vault_media_per_offer ?? 3, 5), 1);
            vaultMediaForOffer = pool.slice(0, limit).map((m: any) => m.external_uuid);
            if (vaultMediaForOffer.length > 0) chosenFolder = folderName;
          }
        }
      } else if (aiResult.chosen_set_id) {
        chosenSet = availableSets.find((s: any) => s.id === aiResult.chosen_set_id) || null;
      }
    }

    // Normalize to an array of single-line bubbles (no line breaks inside a bubble)
    let replies = Array.isArray(aiResult.replies)
      ? aiResult.replies
      : (typeof aiResult.reply === "string" ? [aiResult.reply] : []);
    replies = replies.map((r: any) => String(r || "").replace(/\s+/g, " ").trim()).filter(Boolean);
    if (replies.length === 0) {
      throw new Error("AI_INVALID: No reply generated");
    }
    const replyText = replies.join(" ");
    aiResult.replies = replies;

    await base44.asServiceRole.entities.AIJob.update(job.id, { stage: "ai_generated", ai_completed_at: new Date().toISOString() });

    // === SAVE CONVERSATION CONTEXT ===
    const analysis = aiResult.conversation_analysis || {};
    const contextUpdate: any = {};
    if (analysis.current_topic) contextUpdate.last_topic = analysis.current_topic;
    if (analysis.open_loops) contextUpdate.open_loops = analysis.open_loops;
    if (analysis.rapport_level) contextUpdate.rapport_level = analysis.rapport_level;
    if (Object.keys(contextUpdate).length > 0) {
      await base44.asServiceRole.entities.Conversation.update(conversationId, contextUpdate);
    }

    // === SAVE MEMORY UPDATES (with conflict reconciliation) ===
    if (aiResult.memory_updates && aiResult.memory_updates.length > 0) {
      for (const update of aiResult.memory_updates) {
        const key = update.key != null ? String(update.key).trim() : "";
        const value = update.value != null ? String(update.value).trim() : "";
        if (key && value) {
          const existing = memories.find((m: any) => m.memory_key === key);
          if (existing) {
            if (existing.memory_value !== value) {
              await base44.asServiceRole.entities.FanMemory.update(existing.id, {
                memory_value: value,
                confidence: 0.9,
                source_message_uuid: triggerMessageUuid || lastFanMessage.external_uuid || null,
              });
            }
          } else {
            await base44.asServiceRole.entities.FanMemory.create({
              creator_profile_id: creatorProfileId,
              fan_id: conversation.fan_id,
              memory_key: key,
              memory_value: value,
              confidence: 0.8,
              source_message_uuid: triggerMessageUuid || lastFanMessage.external_uuid || null,
            });
          }
        }
      }
    }

    // === PPV PRICE — LADDER AUTHORITY ===
    // The backend owns the price: the fan's current ladder level determines it.
    // The AI only chooses the CONTENT; its suggested_ppv_cents is ignored for
    // pricing. Apply any pending failed-cycle level drop first.
    let ppvCents: number | null = null;
    let fanLadderLevel = fan?.current_ppv_ladder_level ?? 0;
    if (ppvAllowed && fan) {
      try { fanLadderLevel = await applyFailedCycleDrop(base44, fan, settings); } catch (e) {}
    }
    if (ppvAllowed && aiResult.suggested_ppv_cents && aiResult.suggested_ppv_cents > 0) {
      ppvCents = levelToCents(fanLadderLevel, settings);
      if (!isValidBasePrice(ppvCents, settings)) ppvCents = null;
    }

    // === ANTI-REPETITION (regenerate once if the reply repeats recent text) ===
    const isRep = isRepetitive(replyText, recentCreatorMsgs);
    if (isRep) {
      await base44.asServiceRole.entities.AIJob.update(job.id, { stage: "anti_repetition" });
      try {
        const antiPrompt = userPrompt + `\n\nIMPORTANT: Your previous reply was flagged as REPETITIVE_TEXT_PATTERN. Write a completely fresh response with different wording, a different opening, and varied emoji. Do not repeat activities, stories, or questions you have used before.\n\nBANNED PHRASES (do NOT reuse any of these — they appeared in recent replies): ${bannedStr}`;
        const regen = await callGrok(systemPrompt, antiPrompt, AI_JSON_SCHEMA);
        const regenReplies = Array.isArray(regen?.replies)
          ? regen.replies
          : (typeof regen?.reply === "string" ? [regen.reply] : []);
        const regenText = regenReplies.map((r: any) => String(r || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
        if (regenText && !isRepetitive(regenText, recentCreatorMsgs)) {
          aiResult = regen;
          replies = regenReplies.map((r: any) => String(r || "").replace(/\s+/g, " ").trim()).filter(Boolean);
          if (ppvAllowed && aiResult.suggested_ppv_cents && aiResult.suggested_ppv_cents > 0) {
            ppvCents = levelToCents(fanLadderLevel, settings);
            if (!isValidBasePrice(ppvCents, settings)) ppvCents = null;
          }
        }
      } catch (e) {
        console.error("[ai] anti-repetition regen failed:", (e as any).message);
      }
    }

    // (Spend-based dynamic pricing was removed — the ladder + rescue system in
    // ppv-reconcile.ts now owns all advancement/demotion. The AI never sets the
    // price; the fan's ladder level does.)

    // === RATE LIMIT CHECK ===
    let rateLimited = false;
    if (settings.max_replies_per_hour) {
      const oneHourAgo = new Date(Date.now() - 3600000);
      const recentAiMessages = recentMsgs.filter(
        (m: any) => (m.sender_type === "creator" || m.source === "ai") && new Date(m.created_date) > oneHourAgo
      );
      if (recentAiMessages.length >= settings.max_replies_per_hour) {
        rateLimited = true;
      }
    }

    // === AUTO-SEND vs DRAFT ===
    if (autoMode === "AUTO") {
      if (rateLimited) {
        await base44.asServiceRole.entities.AIJob.update(job.id, {
          status: "completed",
          reply_text: replyText,
          confidence: aiResult.confidence,
          stage: "completed",
          ai_completed_at: new Date().toISOString(),
        });
        await base44.asServiceRole.entities.ActivityLog.create({
          creator_profile_id: creatorProfileId,
          conversation_id: conversationId,
          event_type: "ai.rate_limited",
          status: "warning",
          message: `AI reply for ${fan?.display_name || "fan"} rate-limited (max ${settings.max_replies_per_hour}/hr)`,
          metadata: { job_id: job.id, reason: "RATE_LIMITED" },
        });
        return { success: true, action: "rate_limited", jobId: job.id };
      }

      // === SEND-TIME COOLDOWN RE-CHECK (backstop for concurrent jobs) ===
      // A parallel job on this conversation may have just sent a PPV and
      // stamped last_ppv_offer_at after we evaluated ppvAllowed.
      // Re-fetch the conversation fresh; if we're still inside the mandatory
      // 10-minute window, drop this PPV and send a plain conversational reply
      // so the fan keeps chatting but never gets back-to-back PPV offers.
      if (ppvCents && ppvCents > 0) {
        const freshConv = await base44.asServiceRole.entities.Conversation.get(conversationId);
        const minMinutes = Math.max(settings.ppv_min_minutes_between_offers || 10, 10);
        let drop = false;
        let dropReason = "";
        if (freshConv?.last_ppv_offer_at) {
          const minutesSince = (Date.now() - new Date(freshConv.last_ppv_offer_at).getTime()) / 60000;
          if (minutesSince < minMinutes) {
            drop = true;
            dropReason = `${minutesSince.toFixed(1)}min since last offer (min ${minMinutes})`;
          }
        }
        // Tracking-based dedup backstop (item 16): if a tracking record shows an
        // offer was sent to this conversation within the cooldown (race with a
        // concurrent job that already recorded PpvOfferTracking), drop this PPV.
        if (!drop) {
          const recentTrack = await base44.asServiceRole.entities.PpvOfferTracking.filter({ conversation_id: conversationId }, "-created_date", 5);
          const minMs = minMinutes * 60000;
          if (recentTrack.find((t: any) => t.sent_at && (Date.now() - new Date(t.sent_at).getTime()) < minMs)) {
            drop = true;
            dropReason = "recent tracking offer within cooldown";
          }
        }
        if (drop) {
          ppvCents = null;
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: creatorProfileId,
            conversation_id: conversationId,
            event_type: "ai.ppv_cooldown_drop",
            status: "info",
            message: `PPV dropped at send time — ${dropReason}`,
            metadata: { job_id: job.id },
          });
        }
      }

      // === PPV LOCKING: attach locked media (curated set OR auto-vault) ===
      let mediaForSend: any = null;
      let attachedMediaUuids: string[] = [];
      let chosenSetId: string | null = null;
      let offerSource: "set" | "vault" = "set";
      let offerFolder: string | null = null;
      if (ppvCents && ppvCents > 0) {
        let mediaUuidsToAttach: string[] = [];
        if (ppvSource === "auto_vault" && chosenFolder && vaultMediaForOffer.length > 0) {
          mediaUuidsToAttach = vaultMediaForOffer;
          offerSource = "vault";
          offerFolder = chosenFolder;
        } else if (chosenSet && Array.isArray(chosenSet.media_uuids) && chosenSet.media_uuids.length > 0) {
          mediaUuidsToAttach = chosenSet.media_uuids.slice(0, 5);
          chosenSetId = chosenSet.id;
          offerSource = "set";
        }
        if (mediaUuidsToAttach.length > 0) {
          attachedMediaUuids = mediaUuidsToAttach;
          // FULL-LOCK PPV: omit mediaPreviewUuid unless the creator explicitly
          // opted into a free preview. Fanvue treats mediaPreviewUuid as a
          // single free-to-view item; omitting it locks EVERY attached item.
          mediaForSend = {
            mediaUuids: attachedMediaUuids,
            ...(settings.ppv_preview_enabled === true ? { mediaPreviewUuid: attachedMediaUuids[0] } : {}),
          };
          await base44.asServiceRole.entities.Conversation.update(conversationId, {
            last_ppv_offer_at: new Date().toISOString(),
            ppv_offer_count: (conversation.ppv_offer_count || 0) + 1,
          });
        } else {
          // No locked media available — Fanvue rejects PPV sends with no media,
          // so downgrade to a free message and warn the operator. Without this,
          // PPV offers silently vanish.
          ppvCents = null;
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: creatorProfileId,
            conversation_id: conversationId,
            event_type: "ai.ppv_no_media_downgrade",
            status: "warning",
            message: ppvSource === "auto_vault"
              ? `PPV offer downgraded to free message — no unseen vault media in approved folders for this fan. Sync the vault or approve more folders.`
              : `PPV offer downgraded to free message — no active curated content sets for this creator. Add sets on the PPV Content page.`,
            metadata: { job_id: job.id, ppv_source: ppvSource },
          });
        }
      }

      // === FINAL SEND-TIME MEDIA ELIGIBILITY VALIDATION ===
      // Re-validate every media UUID against current VaultMedia eligibility.
      // If ANY item is free/unknown/unavailable/missing, abort the PPV
      // (downgrade to a free conversational reply) and log
      // PPV_BLOCKED_UNSAFE_MEDIA. Never expose the failure to the fan.
      if (ppvCents && ppvCents > 0 && attachedMediaUuids.length > 0) {
        const eligibility = await validateMediaForPpv(base44, creatorProfileId, attachedMediaUuids);
        if (!eligibility.ok) {
          ppvCents = null;
          mediaForSend = null;
          attachedMediaUuids = [];
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: creatorProfileId,
            conversation_id: conversationId,
            event_type: "ai.ppv_blocked_unsafe_media",
            status: "error",
            message: eligibility.reason || "PPV_BLOCKED_UNSAFE_MEDIA — offer downgraded to free message",
            metadata: { job_id: job.id, invalid: eligibility.invalid, missing: eligibility.missing },
          });
        }
      }

      // === SEND VIA FANVUE WITH RETRY (multi-bubble) ===
      await base44.asServiceRole.entities.AIJob.update(job.id, { stage: "sending", attached_media_uuids: attachedMediaUuids });

      const accessToken = await getValidAccessToken(connection, base44);
      let lastSentMsgUuid: string | null = null;
      for (let i = 0; i < replies.length; i++) {
        const isLast = i === replies.length - 1;
        const bubblePpv = isLast ? ppvCents : null;
        const bubbleMedia = isLast ? mediaForSend : null;
        const sendResult = await sendWithRetry(accessToken, fan.external_uuid, replies[i], bubblePpv, bubbleMedia);
        const su = sendResult?.messageUuid || sendResult?.uuid || sendResult?.data?.uuid || sendResult?.message?.uuid || sendResult?.id || null;
        if (isLast && su) lastSentMsgUuid = su;
        // Dedup by Fanvue message UUID. If the send response carried no UUID, skip
        // the local create and let the outbound webhook persist it as the single
        // source — otherwise a local (null-uuid) record + a webhook (real-uuid)
        // record both insert and the bubble renders twice in the inbox.
        if (su) {
          const existingSent = await base44.asServiceRole.entities.Message.filter({ external_uuid: su }, "-created_date", 1);
          if (!existingSent[0]) {
            await base44.asServiceRole.entities.Message.create({
              creator_profile_id: creatorProfileId,
              conversation_id: conversationId,
              external_uuid: su,
              sender_type: "creator",
              body: replies[i],
              ppv_cents: isLast ? ppvCents : null,
              media: isLast ? attachedMediaUuids : [],
              source: "ai",
            });
          }
        }
        if (!isLast) await new Promise((res) => setTimeout(res, 1200));
      }

      await base44.asServiceRole.entities.Conversation.update(conversationId, {
        last_message_at: new Date().toISOString(),
        last_message_preview: replyText,
        last_sender_type: "creator",
        last_topic: analysis.current_topic || conversation.last_topic,
      });

      await base44.asServiceRole.entities.AIJob.update(job.id, {
        status: "completed",
        reply_text: replyText,
        confidence: aiResult.confidence,
        stage: "completed",
        fanvue_sent_at: new Date().toISOString(),
        ppv_cents: ppvCents,
        content_set_id: chosenSetId,
        attached_media_uuids: attachedMediaUuids,
      });

      // Record this offer so the attached media can be excluded on the next
      // turn (the fan progresses through the library, never receiving the
      // same locked media twice). Works for both curated sets and auto-vault.
      // Record the BASE offer and schedule the rescue (one discounted re-offer
      // of the SAME content after a random 5-10 min delay). The rescue poller
      // (process-rescue-offers workflow) fires it; purchase reconciliation cancels
      // it if the fan buys the base first.
      if (ppvCents && (chosenSetId || (offerSource === "vault" && attachedMediaUuids.length > 0))) {
        const baseSentAt = new Date().toISOString();
        // Rescue is disabled for base offers under $15 ($5/$10 bases) — the
        // discount is too small to be credible and the $7 floor would invert.
        const rawRescuePrice = settings.rescue_enabled !== false ? rescuePriceFor(ppvCents) : null;
        const rescueOn = rawRescuePrice != null;
        const rescuePrice = rescueOn ? rawRescuePrice : null;
        const minDelay = Math.max(settings.rescue_min_delay_minutes ?? 5, 1);
        const maxDelay = Math.max(settings.rescue_max_delay_minutes ?? 10, minDelay + 1);
        const delayMs = (minDelay + Math.random() * (maxDelay - minDelay)) * 60 * 1000;
        const rescueScheduledAt = new Date(Date.now() + delayMs).toISOString();
        try {
          await base44.asServiceRole.entities.PpvOfferTracking.create({
            creator_profile_id: creatorProfileId,
            fan_id: conversation.fan_id,
            conversation_id: conversationId,
            content_set_id: chosenSetId,
            message_id: lastSentMsgUuid,
            media_uuids: attachedMediaUuids,
            source: offerSource,
            folder_name: offerFolder,
            sent_at: baseSentAt,
            price_cents: ppvCents,
            offer_type: "base",
            base_price_cents: ppvCents,
            ladder_level: fanLadderLevel,
            base_status: "sent",
            rescue_eligible: rescueOn,
            rescue_price_cents: rescuePrice,
            rescue_scheduled_at: rescueOn ? rescueScheduledAt : null,
            rescue_status: rescueOn ? "pending" : "none",
            purchased: false,
          });
        } catch (e) {}
        // Update fan ladder state for the rescue poller + UI.
        try {
          await base44.asServiceRole.entities.Fan.update(conversation.fan_id, {
            last_ppv_sent_at: baseSentAt,
            last_base_ppv_price_cents: ppvCents,
            current_ppv_ladder_level: fanLadderLevel,
            current_base_price_cents: ppvCents,
            rescue_pending: rescueOn,
            rescue_scheduled_at: rescueOn ? rescueScheduledAt : null,
          });
        } catch (e) {}
      }

      const rescueInfo = ppvCents && settings.rescue_enabled !== false && rescuePriceFor(ppvCents) != null
        ? ` — rescue scheduled in ${Math.round((Math.max(settings.rescue_min_delay_minutes ?? 5, 1) + Math.random() * (Math.max(settings.rescue_max_delay_minutes ?? 10, 6) - Math.max(settings.rescue_min_delay_minutes ?? 5, 1))))} min at $${((rescuePriceFor(ppvCents) as number) / 100).toFixed(2)}`
        : "";
      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: creatorProfileId,
        conversation_id: conversationId,
        event_type: ppvCents ? "ai.ppv_base_sent" : "ai.auto_sent",
        status: "success",
        message: `AI auto-replied to ${fan?.display_name || "fan"}${ppvCents ? ` (PPV base: $${(ppvCents / 100).toFixed(2)}, media locked, level ${fanLadderLevel}${rescueInfo})` : ""}`,
        metadata: { job_id: job.id, confidence: aiResult.confidence, ppv_cents: ppvCents, ladder_level: fanLadderLevel, intent: aiResult.intent, media_attached: attachedMediaUuids.length > 0, bubbles: replies.length },
      });

      // Successful send — reset the circuit breaker counter for this creator.
      if (settings?.id && (settings.consecutive_send_failures || 0) > 0) {
        try {
          await base44.asServiceRole.entities.AutomationSettings.update(settings.id, { consecutive_send_failures: 0 });
        } catch (e) {}
      }

      return { success: true, action: "auto_sent", jobId: job.id, bubbles: replies.length };
    } else {
      // DRAFT mode: always store for approval. Carry the chosen set + media so
      // the operator's Approve & Send attaches the same locked content.
      const draftAttachedMedia = chosenSet ? chosenSet.media_uuids.slice(0, 5) : [];
      await base44.asServiceRole.entities.AIJob.update(job.id, {
        status: "needs_approval",
        reply_text: replyText,
        confidence: aiResult.confidence,
        stage: "completed",
        ai_completed_at: new Date().toISOString(),
        ppv_cents: ppvCents,
        content_set_id: chosenSet ? chosenSet.id : null,
        attached_media_uuids: draftAttachedMedia,
      });

      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: creatorProfileId,
        conversation_id: conversationId,
        event_type: "ai.draft.ready",
        status: "success",
        message: `AI draft ready for review (${Math.round((aiResult.confidence || 0) * 100)}% confidence)`,
        metadata: { job_id: job.id, confidence: aiResult.confidence, intent: aiResult.intent },
      });

      return { success: true, action: "needs_approval", jobId: job.id };
    }
  } catch (error) {
    const errMsg = (error as any).message || "UNKNOWN";
    // Classify via the error catalog so the UI can show an actionable code.
    const code = toCode(errMsg);

    // === CIRCUIT BREAKER: bump on send-class failures ===
    // Only count Fanvue send / rate-limit / auth failures toward the breaker —
    // AI-generation failures don't indicate the Fanvue channel is unhealthy.
    const isSendFailure = /send|rate.?limit|429|token|expired|401|unauthorized|fanvue api/i.test(errMsg);
    if (isSendFailure && settings?.id) {
      try {
        const newCount = (settings.consecutive_send_failures || 0) + 1;
        const threshold = settings.circuit_breaker_threshold ?? 5;
        await base44.asServiceRole.entities.AutomationSettings.update(settings.id, { consecutive_send_failures: newCount });
        if (newCount >= threshold) {
          await base44.asServiceRole.entities.CreatorProfile.update(creatorProfileId, { status: "error" });
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: creatorProfileId,
            conversation_id: conversationId,
            event_type: "ai.circuit_breaker",
            status: "error",
            message: `Circuit breaker tripped after ${newCount} consecutive send failures — creator auto-paused`,
            metadata: { job_id: job.id, threshold },
          });
        }
      } catch (e) {}
    }

    await base44.asServiceRole.entities.AIJob.update(job.id, {
      status: "failed",
      last_error: errMsg,
      error_code: code,
      attempts: (job.attempts || 0) + 1,
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      conversation_id: conversationId,
      event_type: "ai.failed",
      status: "error",
      message: errMsg,
    });

    throw error;
  }
}