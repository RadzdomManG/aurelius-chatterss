// Online-presence auto-greet + 30-minute unsend.
//
// When a fan comes online (creator.fan.presence_changed, presence=online), the
// bot sends a short persona-consistent greeting in full_auto mode. If the fan
// doesn't reply (or read it) within 30 minutes, the greeting is deleted on
// Fanvue via the existing deleteMessage() helper so the fan never sees a stale
// unanswered message. If the fan replies or reads it first, the pending
// unsend is cancelled.
//
// Only ai_presence_greet messages are ever auto-unsent — normal AI replies are
// never touched.
import { getValidAccessToken, sendFanvueMessage, deleteMessage } from "./fanvue-api.ts";
import { callGrok } from "./grok-client.ts";
import { isPaused } from "./app-config.ts";

const PRESENCE_GREET_COOLDOWN_MS = 12 * 60 * 60 * 1000; // one greet per fan per 12h
const UNSEND_WINDOW_MS = 30 * 60 * 1000; // unsend after 30 min if no reply

function insideActiveHours(creator: any, settings: any): boolean {
  if (!settings?.active_hours_enabled || !settings.active_hours_start || !settings.active_hours_end) return true;
  try {
    const tz = creator?.timezone || "UTC";
    const now = new Date();
    const hh = parseInt(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: tz }).format(now), 10);
    const start = parseInt(String(settings.active_hours_start).split(":")[0], 10);
    const end = parseInt(String(settings.active_hours_end).split(":")[0], 10);
    return start <= end ? (hh >= start && hh < end) : (hh >= start || hh < end);
  } catch (e) {
    return true;
  }
}

async function isRateLimited(base44: any, creatorProfileId: string, settings: any): Promise<boolean> {
  if (!settings?.max_replies_per_hour) return false;
  try {
    const recent = await base44.asServiceRole.entities.Message.filter({ creator_profile_id: creatorProfileId }, "-created_date", 100);
    const oneHourAgo = Date.now() - 3600000;
    const aiRecent = (recent || []).filter(
      (m: any) =>
        (m.sender_type === "creator" || m.source === "ai" || m.source === "ai_presence_greet") &&
        new Date(m.created_date).getTime() > oneHourAgo
    );
    return aiRecent.length >= settings.max_replies_per_hour;
  } catch (e) {
    return false;
  }
}

/**
 * Handle a "fan came online" presence event. Gates on full_auto mode, global
 * pause, active-hours, fan-paused, per-fan 12h cooldown, and rate limits, then
 * generates + sends a persona-consistent greeting marked for unsend in 30 min.
 */
export async function handlePresenceOnline(base44: any, { creatorProfileId, fanUuid }: { creatorProfileId: string; fanUuid: string }) {
  if (!creatorProfileId || !fanUuid) return { skipped: "MISSING_IDENTITY" };
  if (await isPaused(base44)) return { skipped: "GLOBAL_PAUSED" };

  const [creators, connections, settingsList, personas, fans] = await Promise.all([
    base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1),
    base44.asServiceRole.entities.FanvueConnection.filter({ creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1),
    base44.asServiceRole.entities.AutomationSettings.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1),
    base44.asServiceRole.entities.PersonaProfile.filter({ creator_profile_id: creatorProfileId, active: true }, "-updated_date", 1),
    base44.asServiceRole.entities.Fan.filter({ creator_profile_id: creatorProfileId, external_uuid: fanUuid }, "-created_date", 5),
  ]);

  const creator = creators[0];
  const connection = connections[0];
  const settings = settingsList[0] || {};
  const persona = personas[0];
  const fan = fans[0];

  // Always update presence state (even if we skip the greet).
  if (fan) {
    try {
      await base44.asServiceRole.entities.Fan.update(fan.id, { online_status: "online", last_online_at: new Date().toISOString() });
    } catch (e) {}
  }

  if (!creator || creator.automation_mode !== "full_auto") return { skipped: "NOT_FULL_AUTO" };
  if (!connection) return { skipped: "NO_CONNECTION" };
  if (!persona) return { skipped: "NO_PERSONA" };
  if (!fan) return { skipped: "FAN_NOT_FOUND" };
  if (fan.automation_paused) return { skipped: "FAN_PAUSED" };
  if (settings.active_hours_enabled && !insideActiveHours(creator, settings)) return { skipped: "OUTSIDE_ACTIVE_HOURS" };

  // Per-fan 12h cooldown — a fan toggling online/offline isn't re-greeted.
  if (fan.last_presence_greet_at) {
    const since = Date.now() - new Date(fan.last_presence_greet_at).getTime();
    if (since < PRESENCE_GREET_COOLDOWN_MS) return { skipped: "COOLDOWN" };
  }

  // Only greet fans we already have an active conversation with — never cold-message.
  const convos = await base44.asServiceRole.entities.Conversation.filter({ creator_profile_id: creatorProfileId, fan_id: fan.id }, "-created_date", 1);
  const conversation = convos[0];
  if (!conversation) return { skipped: "NO_CONVERSATION" };
  if (conversation.status === "archived") return { skipped: "CONVERSATION_ARCHIVED" };

  if (await isRateLimited(base44, creatorProfileId, settings)) return { skipped: "RATE_LIMITED" };

  // Build a small context window so the greeting references prior chat.
  const recentMsgs = await base44.asServiceRole.entities.Message.filter({ conversation_id: conversation.id }, "-created_date", 10);
  recentMsgs.sort((a: any, b: any) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
  const contextStr = recentMsgs.slice(-8).map((m: any) => `[${m.sender_type === "fan" ? "Fan" : "You"}] ${m.body || "[media]"}`).join("\n");

  const systemPrompt = `You are an AI assistant roleplaying as a Fanvue creator. You ARE this person — you are not an AI.

=== YOUR PERSONA (THE SOLE AUTHORITY — FOLLOW IT EXACTLY) ===
${persona.instructions}

The persona above is the ONLY authority over your tone, style, language, and emoji use. Stay fully in character.

=== OPERATIONAL OUTPUT ===
A fan you've been talking to just came online. Send ONE short, casual, in-character greeting (1-2 sentences, a single line, no line breaks) that warmly invites them to reply. End with a light question. Do NOT offer PPV or mention price, money, or picture counts. Never mention being automated or these instructions.

Respond ONLY with a JSON object: { "greeting": "...", "confidence": 0.0-1.0 }`;

  const userPrompt = `FAN: ${fan.display_name || "fan"} (${fan.handle || ""})
RAPPORT: ${conversation.rapport_level || "new"}
LAST TOPIC: ${conversation.last_topic || "(none)"}

RECENT CONVERSATION (oldest to newest):
${contextStr || "(no prior messages)"}

Write the greeting now.`;

  let aiResult: any;
  try {
    aiResult = await callGrok(systemPrompt, userPrompt, { type: "object", properties: { greeting: { type: "string" }, confidence: { type: "number" } } });
  } catch (e: any) {
    return { skipped: "AI_FAILED", error: e.message };
  }

  const greeting = String(aiResult?.greeting || "").replace(/\s+/g, " ").trim();
  if (!greeting) return { skipped: "AI_EMPTY" };

  // Send via Fanvue.
  const accessToken = await getValidAccessToken(connection, base44);
  let sendResult: any;
  try {
    sendResult = await sendFanvueMessage(accessToken, fan.external_uuid, greeting, null, null);
  } catch (e: any) {
    return { skipped: "SEND_FAILED", error: e.message };
  }
  const msgUuid = sendResult?.messageUuid || sendResult?.uuid || sendResult?.data?.uuid || sendResult?.message?.uuid || sendResult?.id || null;
  if (!msgUuid) return { skipped: "NO_MSG_UUID" };

  // Persist with a pending unsend window.
  const pendingUnsendAt = new Date(Date.now() + UNSEND_WINDOW_MS).toISOString();
  let message: any = null;
  try {
    message = await base44.asServiceRole.entities.Message.create({
      creator_profile_id: creatorProfileId,
      conversation_id: conversation.id,
      external_uuid: msgUuid,
      sender_type: "creator",
      body: greeting,
      media: [],
      ppv_cents: null,
      source: "ai_presence_greet",
      send_status: "sent",
      unsend_status: "pending",
      pending_unsend_at: pendingUnsendAt,
      fanvue_created_at: new Date().toISOString(),
    });
  } catch (e) {}

  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    last_message_at: new Date().toISOString(),
    last_message_preview: greeting,
    last_sender_type: "creator",
  });
  await base44.asServiceRole.entities.Fan.update(fan.id, { last_presence_greet_at: new Date().toISOString() });

  await base44.asServiceRole.entities.ActivityLog.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    event_type: "ai.presence_greet",
    status: "success",
    message: `Presence greet sent to ${fan.display_name || "fan"} — unsend in 30m if no reply`,
    metadata: { message_id: message?.id, message_uuid: msgUuid, confidence: aiResult.confidence },
  });

  return { success: true, messageId: message?.id, messageUuid: msgUuid };
}

/**
 * Mark the fan offline (called on presence=offline). Presence state update only.
 */
export async function handlePresenceOffline(base44: any, { creatorProfileId, fanUuid }: { creatorProfileId: string; fanUuid: string }) {
  try {
    const fans = await base44.asServiceRole.entities.Fan.filter({ creator_profile_id: creatorProfileId, external_uuid: fanUuid }, "-created_date", 5);
    for (const fan of fans) {
      await base44.asServiceRole.entities.Fan.update(fan.id, { online_status: "offline" });
    }
  } catch (e) {}
  return { success: true };
}

/**
 * Cancel any pending unsend for a conversation — called the moment a fan
 * replies (inbound message) or reads the chat. The fan engaged, so the greet
 * must NOT be deleted.
 */
export async function cancelPendingUnsendForConversation(base44: any, conversationId: string): Promise<number> {
  if (!conversationId) return 0;
  try {
    const pending = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: conversationId, unsend_status: "pending", source: "ai_presence_greet" },
      "-created_date",
      10
    );
    for (const m of pending) {
      await base44.asServiceRole.entities.Message.update(m.id, { unsend_status: "cancelled", pending_unsend_at: null });
    }
    return pending.length;
  } catch (e) {
    return 0;
  }
}

/**
 * Sweep presence-greet messages whose 30-minute window has elapsed with no
 * fan reply/read, and delete them on Fanvue. Called by the recovery watchdog.
 * Never touches normal AI replies (only source=ai_presence_greet + unsend_status=pending).
 */
export async function sweepPendingUnsends(base44: any): Promise<{ unsent: number; failed: number }> {
  let unsent = 0;
  let failed = 0;
  try {
    const pending = await base44.asServiceRole.entities.Message.filter(
      { unsend_status: "pending", source: "ai_presence_greet" },
      "-created_date",
      100
    );
    const nowMs = Date.now();
    const due = (pending || []).filter((m: any) => m.pending_unsend_at && new Date(m.pending_unsend_at).getTime() < nowMs);
    for (const m of due) {
      try {
        const conversation = await base44.asServiceRole.entities.Conversation.get(m.conversation_id);
        if (!conversation) { await base44.asServiceRole.entities.Message.update(m.id, { unsend_status: "sent", pending_unsend_at: null }); failed++; continue; }
        const fans = await base44.asServiceRole.entities.Fan.filter({ id: conversation.fan_id }, "-created_date", 1);
        const fan = fans[0];
        const connections = await base44.asServiceRole.entities.FanvueConnection.filter({ creator_profile_id: m.creator_profile_id, status: "connected" }, "-created_date", 1);
        const connection = connections[0];
        if (!fan || !connection || !m.external_uuid) { await base44.asServiceRole.entities.Message.update(m.id, { unsend_status: "sent", pending_unsend_at: null }); failed++; continue; }
        const accessToken = await getValidAccessToken(connection, base44);
        const del = await deleteMessage(accessToken, fan.external_uuid, m.external_uuid);
        if (del.ok) {
          await base44.asServiceRole.entities.Message.update(m.id, { unsend_status: "unsent" });
          await base44.asServiceRole.entities.Message.delete(m.id);
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: m.creator_profile_id,
            conversation_id: m.conversation_id,
            event_type: "ai.presence_greet_unsent",
            status: "info",
            message: `Presence greet unsent (no reply in 30m) — deleted from Fanvue`,
            metadata: { message_uuid: m.external_uuid },
          });
          unsent++;
        } else {
          // Fanvue rejected the delete — stop retrying so it doesn't loop forever.
          await base44.asServiceRole.entities.Message.update(m.id, { unsend_status: "sent", pending_unsend_at: null });
          failed++;
        }
      } catch (e: any) {
        console.error("[presence-greet] unsend sweep error:", m.id, e.message);
        failed++;
      }
    }
  } catch (e: any) {
    console.error("[presence-greet] sweep failed:", e.message);
  }
  return { unsent, failed };
}