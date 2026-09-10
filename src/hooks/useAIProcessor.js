import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Client-side notification hook — listens for new fan messages via realtime
 * and shows a toast. Server-side AI processing (webhook → ai-processor) handles
 * draft generation and auto-sending. This hook does NOT generate drafts
 * to avoid duplicating server work.
 */
export function useAIProcessor() {
  const [activeJobs, setActiveJobs] = React.useState(0);

  React.useEffect(() => {
    let unsub;

    const handleMessage = async (event) => {
      if (event.type !== "create") return;
      const msg = event.data;
      if (msg.sender_type !== "fan") return;

      // Show notification for new fan message
      try {
        const convos = await base44.entities.Conversation.filter({ id: msg.conversation_id }, "-created_date", 1);
        const conversation = convos[0];
        if (!conversation) return;

        const fans = await base44.entities.Fan.filter({ id: conversation.fan_id }, "-created_date", 1);
        const fan = fans[0];
        const fanName = fan?.display_name || "A fan";

        toast.info(`New message from ${fanName}`, {
          description: msg.body?.slice(0, 80) || "[media]",
        });
      } catch (err) {
        // ignore notification errors
      }
    };

    // Also subscribe to AIJob updates to notify on auto-sent replies
    const handleAIJob = (event) => {
      if (event.type !== "update" && event.type !== "create") return;
      const job = event.data;
      if (job.status === "completed" && event.type === "update") {
        setActiveJobs((n) => Math.max(0, n - 1));
        toast.success("AI auto-replied", {
          description: job.reply_text?.slice(0, 80) || "",
        });
      } else if (job.status === "needs_approval") {
        setActiveJobs((n) => Math.max(0, n - 1));
        toast.info("AI draft ready for review", {
          description: `${Math.round((job.confidence || 0) * 100)}% confidence`,
        });
      } else if (job.status === "processing") {
        setActiveJobs((n) => n + 1);
      }
    };

    try {
      unsub = base44.entities.Message.subscribe(handleMessage);
      base44.entities.AIJob.subscribe(handleAIJob);
    } catch (err) {
      console.error("Notification subscription failed:", err);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return { activeJobs };
}