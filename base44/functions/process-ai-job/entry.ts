import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { processAIJob } from "../../shared/ai-processor.ts";

export default async function(req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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