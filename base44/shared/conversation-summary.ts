// Conversation summary — long-term recall for the persona.
//
// The persona only receives the last ~15 messages as live context. For a
// week-long conversation that's not enough to recall topics, promises, or
// fan facts. This module generates and persists a compact AI summary of the
// OLDER messages on the Conversation record, regenerated periodically as the
// conversation grows. The AI processor injects the existing summary into every
// prompt so the persona can reference, recall, and proactively raise topics
// from far back in the history.
//
// Regeneration is throttled: only runs when 20+ new messages have arrived
// since the last summary (or when none exists and the conversation is long
// enough), so most turns pay zero extra LLM cost.

import { callGrok } from "./grok-client.ts";

const SUMMARY_THRESHOLD = 20;      // generate when conversation exceeds this many messages
const SUMMARY_REGEN_DELTA = 20;     // regenerate after this many new messages
const RECENT_WINDOW = 15;           // keep last N messages as live context; summarize the rest

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    topics: { type: "array", items: { type: "string" } },
    fan_facts: { type: "object" },
  },
};

/**
 * Generate (or regenerate) the conversation summary if enough new messages
 * have arrived. Best-effort — never throws. Called after a successful reply
 * send so the current turn is unaffected and the NEXT turn has fresh recall.
 */
export async function ensureConversationSummary(base44: any, conversation: any): Promise<void> {
  if (!conversation?.id) return;
  try {
    const allMsgs = await base44.asServiceRole.entities.Message.filter(
      { conversation_id: conversation.id },
      "-created_date",
      300
    );
    if (!Array.isArray(allMsgs) || allMsgs.length === 0) return;
    allMsgs.sort((a: any, b: any) =>
      new Date(a.created_date).getTime() - new Date(b.created_date).getTime()
    );

    const totalCount = allMsgs.length;
    const summarizedCount = conversation.summary_message_count || 0;

    const needsSummary =
      (!conversation.summary && totalCount > SUMMARY_THRESHOLD) ||
      (!!conversation.summary && totalCount - summarizedCount >= SUMMARY_REGEN_DELTA);

    if (!needsSummary) return;

    // Summarize everything EXCEPT the recent live-context window.
    const toSummarize = allMsgs.slice(0, Math.max(0, totalCount - RECENT_WINDOW));
    if (toSummarize.length < 5) return;

    const historyText = toSummarize
      .map((m: any) => `[${m.sender_type === "fan" ? "Fan" : "Creator"}] ${m.body || "[media]"}`)
      .join("\n");

    const systemPrompt = `You are a conversation summarizer for a Fanvue creator-fan chat. Produce a concise but comprehensive recap that lets the creator's AI persona recall this conversation later.

Extract and organize:
- Key topics discussed (what the fan cares about, talks about repeatedly)
- Personal facts about the fan (name, location, age, work, interests, preferences, relationship status)
- Relationship milestones and rapport level (how close they've become)
- Promises, inside jokes, pet names, or recurring references
- PPV / sales context: what was offered, at what price, whether purchased, any price pushback
- Emotional tone and the fan's sentiment/communication style

Write in third person. Be specific (use names, numbers, dates) but keep it under ~400 words. This summary will be injected into the AI's prompt for long-term continuity.

Respond ONLY with a JSON object: { "summary": "...", "topics": ["..."], "fan_facts": { ... } }`;

    const userPrompt = `CONVERSATION (oldest to newest, excluding the most recent ${RECENT_WINDOW} messages which are in live context):\n${historyText}`;

    const result = await callGrok(systemPrompt, userPrompt, SUMMARY_SCHEMA);
    const summaryText = String(result?.summary || "").trim();
    if (!summaryText) return;

    await base44.asServiceRole.entities.Conversation.update(conversation.id, {
      summary: summaryText,
      summary_generated_at: new Date().toISOString(),
      summary_message_count: totalCount,
    });
  } catch (e: any) {
    console.error("[conversation-summary] generation failed:", e?.message || e);
  }
}