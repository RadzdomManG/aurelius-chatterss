// recover-ai-jobs — server-side watchdog that runs on a cron workflow.
// NO auth gate (workflow has no user session). Uses asServiceRole for all ops.
//
// Duties:
// 1. Recover stuck "processing" jobs (stale lock > 2 min)
// 2. Recover stale "pending" jobs (> 15 seconds)
// 3. Cancel duplicate jobs (same trigger_message_uuid — keep one, cancel rest)
// 4. Re-evaluate "needs_approval" jobs: if the conversation is AUTO mode,
//    re-run them so they auto-send (fixes the needs_approval-in-auto bug)
// 5. Clean up duplicate messages (same external_uuid — keep oldest)
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { processAIJob, resolveAutomationMode } from "../../shared/ai-processor-v2.ts";
import { isPaused } from "../../shared/app-config.ts";
import { getValidAccessToken } from "../../shared/fanvue-api.ts";
// Uses the canonical ai-processor-v2 (no false supersession cancellation).

const STUCK_MS = 2 * 60 * 1000;
const PENDING_STALE_MS = 15 * 1000;

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  // Global pause: no recovery work while the system is paused — pending jobs
  // stay pending and are processed normally once resumed.
  if (await isPaused(base44)) {
    return Response.json({ success: true, paused: true, skipped: true });
  }

  let recovered = 0, failed = 0, pendingRecovered = 0, duplicatesCancelled = 0, needsApprovalConverted = 0, msgDeduped = 0, backfilled = 0, backfillSkipped = 0;

  // === 1. Cancel duplicate jobs (same trigger_message_uuid) ===
  const allJobs = await base44.asServiceRole.entities.AIJob.list("-created_date", 500);
  const jobsByTrigger: Record<string, any[]> = {};
  for (const j of allJobs) {
    if (!j.trigger_message_uuid) continue;
    const key = j.trigger_message_uuid;
    if (!jobsByTrigger[key]) jobsByTrigger[key] = [];
    jobsByTrigger[key].push(j);
  }
  for (const [trigger, group] of Object.entries(jobsByTrigger)) {
    const active = group.filter((j) => ["processing", "completed", "needs_approval", "pending"].includes(j.status));
    if (active.length <= 1) continue;
    // Keep the one with the earliest created_date, cancel the rest
    active.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    const canonical = active[0];
    for (const j of active.slice(1)) {
      try {
        await base44.asServiceRole.entities.AIJob.update(j.id, {
          status: "cancelled",
          last_error: "DUPLICATE_AUTOMATION_JOB",
        });
        duplicatesCancelled++;
      } catch (e) {}
    }
  }

  // === 1b. Token-expiry watchdog — pre-refresh access tokens nearing expiry ===
  // Avoids mid-conversation 401s by refreshing any connected token that expires
  // within the next 10 minutes. getValidAccessToken no-ops if still valid.
  try {
    const connections = await base44.asServiceRole.entities.FanvueConnection.filter({ status: "connected" }, "-created_date", 50);
    const tenMin = Date.now() + 10 * 60 * 1000;
    for (const conn of connections) {
      const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at).getTime() : 0;
      if (!expiresAt || expiresAt < tenMin) {
        try { await getValidAccessToken(conn, base44); } catch (e) { console.error("[recover] token refresh", conn.id, (e as any).message); }
      }
    }
  } catch (e) {}

  // === 1c. Promote permanently-failed jobs to dead_letter ===
  // Jobs that have failed repeatedly (>= 5 attempts) are moved to a dead-letter
  // status so they stop being retried by the watchdog and surface in the UI
  // for manual investigation / operator-initiated retry.
  let deadLettered = 0;
  try {
    const failedJobs = await base44.asServiceRole.entities.AIJob.filter({ status: "failed" }, "-created_date", 100);
    for (const j of failedJobs) {
      if ((j.attempts || 0) >= 5) {
        try { await base44.asServiceRole.entities.AIJob.update(j.id, { status: "dead_letter" }); deadLettered++; } catch (e) {}
      }
    }
  } catch (e) {}

  // === 2. Recover stuck "processing" jobs ===
  const cutoff = new Date(Date.now() - STUCK_MS).toISOString();
  const stuck = await base44.asServiceRole.entities.AIJob.filter({ status: "processing" }, "-locked_at", 100);
  const stuckToRecover = stuck.filter((j) => j.locked_at && new Date(j.locked_at) < new Date(cutoff));
  for (const job of stuckToRecover) {
    try {
      await base44.asServiceRole.entities.AIJob.update(job.id, { locked_at: null, locked_by: null });
      await processAIJob(base44, job.conversation_id, job.id, job.trigger_message_uuid);
      recovered++;
    } catch (err) {
      failed++;
      console.error("[recover] stuck job", job.id, (err as any).message);
    }
  }

  // === 3. Recover stale "pending" jobs ===
  const pending = await base44.asServiceRole.entities.AIJob.filter({ status: "pending" }, "created_date", 50);
  const pendingStale = pending.filter((j) => new Date(j.created_date) < new Date(Date.now() - PENDING_STALE_MS));
  for (const job of pendingStale) {
    try {
      await processAIJob(base44, job.conversation_id, job.id, job.trigger_message_uuid);
      pendingRecovered++;
    } catch (err) {
      console.error("[recover] pending job", job.id, (err as any).message);
    }
  }

  // === 4. Re-evaluate "needs_approval" jobs in AUTO mode ===
  const needsApproval = await base44.asServiceRole.entities.AIJob.filter({ status: "needs_approval" }, "-created_date", 50);
  for (const job of needsApproval) {
    try {
      const conversation = await base44.asServiceRole.entities.Conversation.get(job.conversation_id);
      if (!conversation) continue;
      const creators = await base44.asServiceRole.entities.CreatorProfile.filter({ id: conversation.creator_profile_id }, "-created_date", 1);
      const settingsList = await base44.asServiceRole.entities.AutomationSettings.filter({ creator_profile_id: conversation.creator_profile_id }, "-created_date", 1);
      const mode = resolveAutomationMode(creators[0], conversation, settingsList[0] || {});
      if (mode === "AUTO") {
        // Re-run in AUTO mode so it auto-sends
        await base44.asServiceRole.entities.AIJob.update(job.id, { status: "pending", locked_at: null });
        await processAIJob(base44, job.conversation_id, job.id, job.trigger_message_uuid);
        needsApprovalConverted++;
      } else if (mode === "STOPPED") {
        // Cancel obsolete jobs in stopped mode
        await base44.asServiceRole.entities.AIJob.update(job.id, { status: "cancelled", last_error: "AUTOMATION_STOPPED" });
        duplicatesCancelled++;
      }
    } catch (err) {
      console.error("[recover] needs_approval re-eval", job.id, (err as any).message);
    }
  }

  // === 5. Clean up duplicate messages (same external_uuid, keep oldest) ===
  const allMsgs = await base44.asServiceRole.entities.Message.list("-created_date", 2000);
  const msgByUuid: Record<string, any[]> = {};
  for (const m of allMsgs) {
    if (!m.external_uuid) continue;
    if (!msgByUuid[m.external_uuid]) msgByUuid[m.external_uuid] = [];
    msgByUuid[m.external_uuid].push(m);
  }
  for (const [uuid, group] of Object.entries(msgByUuid)) {
    if (group.length <= 1) continue;
    group.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    for (const m of group.slice(1)) {
      try {
        await base44.asServiceRole.entities.Message.delete(m.id);
        msgDeduped++;
      } catch (e) {}
    }
  }

  // === 6. Backfill: answer fan messages that arrived while paused ===
  // When the system was paused, ingest stored inbound fan messages but never
  // created an AIJob (it logged message.paused and returned). After resume,
  // those fans never get a reply because there's no job to recover. Find the
  // newest unanswered inbound fan message per running conversation and create
  // + process a job for it so paused-out fans (incl. "unknown owl") get answered.
  try {
    const runningCreators = await base44.asServiceRole.entities.CreatorProfile.list("-created_date", 200);
    const runningCreatorIds = new Set(
      (runningCreators || [])
        .filter((c: any) => c.automation_mode === "draft" || c.automation_mode === "full_auto")
        .map((c: any) => c.id)
    );
    if (runningCreatorIds.size > 0) {
      const sinceMs = Date.now() - 48 * 60 * 60 * 1000;
      // Recent inbound fan messages within the window for running creators.
      const candidateFanMsgs = (allMsgs || [])
        .filter((m: any) =>
          m.sender_type === "fan" &&
          runningCreatorIds.has(m.creator_profile_id) &&
          new Date(m.created_date).getTime() > sinceMs
        );
      // Newest fan message per conversation
      const newestPerConv: Record<string, any> = {};
      for (const m of candidateFanMsgs) {
        const cur = newestPerConv[m.conversation_id];
        if (!cur || new Date(m.created_date) > new Date(cur.created_date)) {
          newestPerConv[m.conversation_id] = m;
        }
      }
      // Active (non-cancelled/failed) jobs indexed by trigger UUID — if one
      // exists for a message, the normal recovery passes already own it.
      const existingJobTriggers = new Set(
        (allJobs || [])
          .filter((j: any) => j.trigger_message_uuid && j.status !== "cancelled" && j.status !== "failed")
          .map((j: any) => j.trigger_message_uuid)
      );
      // Creator/AI replies indexed by conversation — a fan message is
      // "answered" if any creator/ai message is newer than it.
      const answeredByConv: Record<string, any[]> = {};
      for (const m of (allMsgs || [])) {
        if (m.sender_type === "creator" || m.source === "ai") {
          (answeredByConv[m.conversation_id] = answeredByConv[m.conversation_id] || []).push(m);
        }
      }
      for (const [, fanMsg] of Object.entries(newestPerConv)) {
        if (backfilled >= 100) break;
        const triggerUuid = fanMsg.external_uuid || fanMsg.id;
        if (existingJobTriggers.has(triggerUuid)) { backfillSkipped++; continue; }
        const replies = answeredByConv[fanMsg.conversation_id] || [];
        const answered = replies.some((r: any) => new Date(r.created_date) > new Date(fanMsg.created_date));
        if (answered) { backfillSkipped++; continue; }
        try {
          const job = await base44.asServiceRole.entities.AIJob.create({
            creator_profile_id: fanMsg.creator_profile_id,
            conversation_id: fanMsg.conversation_id,
            trigger_message_uuid: triggerUuid,
            status: "pending",
            stage: "ingested",
            job_created_at: new Date().toISOString(),
          });
          await processAIJob(base44, fanMsg.conversation_id, job.id, triggerUuid);
          backfilled++;
        } catch (err) {
          console.error("[recover] backfill", fanMsg.id, (err as any).message);
        }
      }
    }
  } catch (err) {
    console.error("[recover] backfill pass failed:", (err as any).message);
  }

  await base44.asServiceRole.entities.ActivityLog.create({
    event_type: "runner.recovery",
    status: failed > 0 ? "warning" : "success",
    message: `Recovery: ${recovered} stuck, ${pendingRecovered} pending, ${needsApprovalConverted} auto-converted, ${duplicatesCancelled} dupes cancelled, ${msgDeduped} msgs deduped, ${backfilled} backfilled, ${deadLettered} dead-lettered, ${failed} failed`,
    metadata: { recovered, pendingRecovered, needsApprovalConverted, duplicatesCancelled, msgDeduped, backfilled, backfillSkipped, deadLettered, failed, stuckFound: stuckToRecover.length },
  });

  return Response.json({
    success: true,
    recovered,
    pendingRecovered,
    needsApprovalConverted,
    duplicatesCancelled,
    msgDeduped,
    backfilled,
    backfillSkipped,
    deadLettered,
    failed,
    stuckFound: stuckToRecover.length,
  });
}