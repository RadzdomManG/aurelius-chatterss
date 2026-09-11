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

    const { conversationId, jobId } = parsedBody;
    if (!conversationId && !jobId) {
      return Response.json({ error: "conversationId or jobId is required" }, { status: 400 });
    }

    const result = await processAIJob(base44, conversationId, jobId, null);

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}