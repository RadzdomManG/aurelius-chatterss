// recover-ai-jobs — un-sticks AI jobs that crashed mid-processing.
// Re-invokes processAIJob for them; idempotency guards inside the processor
// (already-processed message UUID, last-message-was-AI) prevent double-sends.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { processAIJob } from "../../shared/ai-processor.ts";

const STUCK_MS = 2 * 60 * 1000; // processing locked > 2 min is considered crashed
const PENDING_STALE_MS = 60 * 1000; // pending never started > 1 min

export default async function (req) {
  const base44 = createClientFromRequest(req);
  try { await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
  const stuck = await base44.asServiceRole.entities.AIJob.filter(
    { status: "processing" },
    "-locked_at",
    100
  );
  const toRecover = stuck.filter((j) => j.locked_at && new Date(j.locked_at) < new Date(cutoff));

  let recovered = 0;
  let failed = 0;
  for (const job of toRecover) {
    try {
      await base44.asServiceRole.entities.AIJob.update(job.id, { locked_at: null, locked_by: null });
      await processAIJob(base44, job.conversation_id, job.id, job.trigger_message_uuid);
      recovered++;
    } catch (err) {
      failed++;
      console.error("[recover] stuck job", job.id, err.message);
    }
  }

  const pending = await base44.asServiceRole.entities.AIJob.filter(
    { status: "pending" },
    "created_date",
    50
  );
  const pendingStale = pending.filter((j) => new Date(j.created_date) < new Date(Date.now() - PENDING_STALE_MS));
  let pendingRecovered = 0;
  for (const job of pendingStale) {
    try {
      await processAIJob(base44, job.conversation_id, job.id, job.trigger_message_uuid);
      pendingRecovered++;
    } catch (err) {
      console.error("[recover] pending job", job.id, err.message);
    }
  }

  await base44.asServiceRole.entities.ActivityLog.create({
    event_type: "runner.recovery",
    status: failed > 0 ? "warning" : "success",
    message: `Recovery run: ${recovered} stuck + ${pendingRecovered} pending reprocessed, ${failed} failed`,
    metadata: { recovered, pendingRecovered, failed, stuckFound: toRecover.length },
  });

  return Response.json({ success: true, recovered, pendingRecovered, failed, stuckFound: toRecover.length });
}