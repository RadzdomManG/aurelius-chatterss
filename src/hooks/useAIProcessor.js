import React from "react";
import { base44 } from "@/api/base44Client";
import { generateDraft } from "@/lib/ai-service";
import { toast } from "sonner";

// Client-side AI draft processor: monitors new fan messages via realtime,
// generates AI drafts using InvokeLLM, stores as needs_approval AIJobs.
// Only runs in "draft" automation mode (never auto-sends to Fanvue).
export function useAIProcessor() {
  const [processedIds, setProcessedIds] = React.useState(new Set());
  const [activeJobs, setActiveJobs] = React.useState(0);

  React.useEffect(() => {
    let unsub;

    const handleMessage = async (event) => {
      if (event.type !== "create") return;
      const msg = event.data;
      if (msg.sender_type !== "fan") return;
      if (processedIds.has(msg.id)) return;

      setProcessedIds((prev) => new Set(prev).add(msg.id));

      try {
        // Find the conversation
        const convos = await base44.entities.Conversation.filter({ id: msg.conversation_id }, "-created_date", 1);
        const conversation = convos[0];
        if (!conversation) return;

        // Check automation mode (only process in draft mode, not off)
        const mode = conversation.automation_mode_override || "draft";
        if (mode === "off") return;

        // Check if there's already an AIJob for this message
        const existingJobs = await base44.entities.AIJob.filter(
          { trigger_message_uuid: msg.id },
          "-created_date",
          1
        );
        if (existingJobs.length > 0) return;

        setActiveJobs((n) => n + 1);

        // Load context
        const [creators, personas, fans, memories, recentMsgs] = await Promise.all([
          base44.entities.CreatorProfile.filter({ id: conversation.creator_profile_id }, "-created_date", 1),
          base44.entities.PersonaProfile.filter(
            { creator_profile_id: conversation.creator_profile_id, active: true },
            "-created_date",
            1
          ),
          base44.entities.Fan.filter({ id: conversation.fan_id }, "-created_date", 1),
          base44.entities.FanMemory.filter({ fan_id: conversation.fan_id }, "-created_date", 10),
          base44.entities.Message.filter({ conversation_id: conversation.id }, "created_date", 15),
        ]);

        const persona = personas[0];
        const fan = fans[0];
        const creator = creators[0];

        // Create AIJob
        const job = await base44.entities.AIJob.create({
          creator_profile_id: conversation.creator_profile_id,
          conversation_id: conversation.id,
          trigger_message_uuid: msg.id,
          status: "processing",
        });

        // Log activity
        await base44.entities.ActivityLog.create({
          creator_profile_id: conversation.creator_profile_id,
          conversation_id: conversation.id,
          event_type: "ai.started",
          status: "info",
          message: `Processing fan message from ${fan?.display_name || "unknown"}`,
        });

        // Generate draft via InvokeLLM
        const memoryText = memories.map((m) => `${m.memory_key}: ${m.memory_value}`).join("\n");
        const result = await generateDraft({
          personaInstructions: persona?.instructions,
          fanDisplayName: fan?.display_name,
          fanMemory: memoryText,
          recentMessages: recentMsgs.map((m) => ({ sender: m.sender_type, text: m.body })),
          newMessage: msg.body,
        });

        if (result.error) {
          await base44.entities.AIJob.update(job.id, {
            status: "failed",
            last_error: result.error,
          });
          await base44.entities.ActivityLog.create({
            creator_profile_id: conversation.creator_profile_id,
            conversation_id: conversation.id,
            event_type: "ai.failed",
            status: "error",
            message: result.error,
          });
          return;
        }

        // Store as needs_approval (never auto-send from browser)
        await base44.entities.AIJob.update(job.id, {
          status: "needs_approval",
          reply_text: result.reply,
          confidence: result.confidence,
        });

        // Update conversation unread indicator
        await base44.entities.Conversation.update(conversation.id, {
          last_message_at: new Date().toISOString(),
          last_message_preview: msg.body,
          last_sender_type: "fan",
        });

        // Log success
        await base44.entities.ActivityLog.create({
          creator_profile_id: conversation.creator_profile_id,
          conversation_id: conversation.id,
          event_type: "ai.draft.ready",
          status: "success",
          message: `AI draft ready for review (confidence: ${Math.round((result.confidence || 0) * 100)}%)`,
          metadata: { job_id: job.id, confidence: result.confidence, intent: result.intent },
        });

        // Show notification
        toast.info("AI draft ready for review", {
          description: `${fan?.display_name || "Fan"}: ${msg.body?.slice(0, 50)}...`,
        });
      } catch (err) {
        console.error("AI processing error:", err);
      } finally {
        setActiveJobs((n) => Math.max(0, n - 1));
      }
    };

    try {
      unsub = base44.entities.Message.subscribe(handleMessage);
    } catch (err) {
      console.error("AI processor subscription failed:", err);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [processedIds]);

  return { activeJobs };
}