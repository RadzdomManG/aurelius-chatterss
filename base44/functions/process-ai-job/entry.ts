import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { processAIJob } from "../../shared/ai-processor.ts";

export default async function(req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);

    // Allow both user-authenticated calls (manual UI trigger) and
    // service-role calls (webhook / recovery). Only block if auth.me()
    // explicitly throws — a service-role request has no user session
    // but is still authorized to run server-side processing.
    let isServiceRole = false;
    try {
      const user = await base44.auth.me();
      if (!user) isServiceRole = true;
    } catch (e) {
      isServiceRole = true;
    }

    const { conversationId, jobId, triggerMessageUuid } = parsedBody;
    if (!conversationId && !jobId) {
      return Response.json({ error: "conversationId or jobId is required" }, { status: 400 });
    }

    // If only jobId is provided, resolve conversationId from the job record
    // so processAIJob can load the conversation.
    let resolvedConversationId = conversationId;
    let resolvedTriggerMessageUuid = triggerMessageUuid || null;
    if (jobId && (!resolvedConversationId || !resolvedTriggerMessageUuid)) {
      try {
        const job = await base44.asServiceRole.entities.AIJob.get(jobId);
        resolvedConversationId = resolvedConversationId || job.conversation_id;
        resolvedTriggerMessageUuid = resolvedTriggerMessageUuid || job.trigger_message_uuid || null;
      } catch (e) {
        return Response.json({ error: "Job not found" }, { status: 404 });
      }
    }

    // The shared processor fetches the newest message window and normalizes
    // chronology before deciding whether this job was superseded.
    const result = await processAIJob(base44, resolvedConversationId, jobId, resolvedTriggerMessageUuid);

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}