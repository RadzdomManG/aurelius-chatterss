import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { waitUntil } from "base44:runtime";
import { processAIJob } from "../../shared/ai-processor-v2.ts";
import { isPaused } from "../../shared/app-config.ts";

// Re-engagement: finds conversations where the fan hasn't messaged in 7+ days
// and the creator is in full_auto mode, then triggers a persona-consistent
// re-engagement message via processAIJob with a re-engagement context flag.
export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  // Global pause: no proactive outreach while the system is paused.
  if (await isPaused(base44)) {
    return Response.json({ success: true, paused: true, skipped: true });
  }

  // automation_mode (per-creator) is the authoritative gate now — the old
  // settings.enabled flag is no longer trusted. List all settings and rely on
  // the reengagement_enabled + creator.automation_mode checks below.
  const settingsList = await base44.asServiceRole.entities.AutomationSettings.list(
    "-created_date",
    50
  );

  let totalReengaged = 0;
  const results = [];

  for (const settings of settingsList) {
    if (!settings.reengagement_enabled) continue;
    const daysThreshold = settings.reengagement_days_threshold || 7;
    const cutoff = new Date(Date.now() - daysThreshold * 86400000).toISOString();

    const conversations = await base44.asServiceRole.entities.Conversation.filter(
      { creator_profile_id: settings.creator_profile_id, status: "active" },
      "-created_date",
      500
    );

    const creators = await base44.asServiceRole.entities.CreatorProfile.filter(
      { id: settings.creator_profile_id },
      "-created_date",
      1
    );
    const creator = creators[0];
    if (!creator || creator.automation_mode !== "full_auto") continue;

    for (const convo of conversations) {
      // Skip if last message is too recent
      if (convo.last_message_at && new Date(convo.last_message_at) > new Date(cutoff)) continue;
      // Skip if last sender was creator (already reached out)
      if (convo.last_sender_type === "creator" || convo.last_sender_type === "ai") continue;

      // Check there are messages in this conversation
      const msgs = await base44.asServiceRole.entities.Message.filter(
        { conversation_id: convo.id },
        "created_date",
        5
      );
      if (msgs.length === 0) continue;

      // Trigger re-engagement via processAIJob
      try {
        waitUntil(processAIJob(base44, convo.id, null, null));
        totalReengaged++;
        results.push({ conversationId: convo.id, status: "triggered" });

        await base44.asServiceRole.entities.ActivityLog.create({
          creator_profile_id: settings.creator_profile_id,
          conversation_id: convo.id,
          event_type: "ai.reengagement",
          status: "info",
          message: `Re-engagement triggered for inactive fan (${daysThreshold}+ days)`,
        });
      } catch (e) {
        results.push({ conversationId: convo.id, status: "error", error: (e as any).message });
      }
    }
  }

  return Response.json({ success: true, totalReengaged, results });
}