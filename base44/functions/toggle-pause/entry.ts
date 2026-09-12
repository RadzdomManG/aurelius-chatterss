import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getAppConfig } from "../../shared/app-config.ts";

// toggle-pause — the single switch that halts or resumes all automation.
//   action: "pause"  → snapshot every creator's automation_mode, flip all to off,
//                      cancel in-flight pending/processing AI jobs, set paused=true
//   action: "resume" → restore each creator's prior mode from the snapshot, paused=false
//   action: "status" → return { paused, paused_modes }
// Requires an authenticated user (operator/admin).
export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}
  const base44 = createClientFromRequest(req);

  let authUser: any = null;
  try { authUser = await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const action = body.action || "status";

  // Role gate: pausing/resuming the whole system is destructive — admin/owner only.
  // "status" stays open to any authenticated user (read-only).
  if (action === "pause" || action === "resume") {
    const isAdmin = authUser?.role === "admin";
    let isOrgAdmin = false;
    if (!isAdmin && authUser?.id) {
      try {
        const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ user_id: authUser.id }, "-created_date", 20);
        isOrgAdmin = (memberships || []).some((m: any) => m.role === "owner" || m.role === "admin");
      } catch (e) {}
    }
    if (!isAdmin && !isOrgAdmin) {
      await base44.asServiceRole.entities.ActivityLog.create({
        event_type: "system.pause_denied",
        status: "warning",
        message: `Pause/resume denied for non-admin user`,
        metadata: { action, user_id: authUser?.id },
      });
      return Response.json({ error: "Admin access required to pause or resume the system" }, { status: 403 });
    }
  }

  if (action === "status") {
    const config = await getAppConfig(base44);
    return Response.json({ paused: !!config?.paused, paused_modes: config?.paused_modes || {} });
  }

  if (action === "pause") {
    const creators = await base44.asServiceRole.entities.CreatorProfile.list("-created_date", 200);
    const snapshot: Record<string, string> = {};
    for (const c of creators) {
      snapshot[c.id] = c.automation_mode || "off";
    }
    const config = await getAppConfig(base44);
    await base44.asServiceRole.entities.AppConfig.update(config.id, {
      paused: true,
      paused_modes: snapshot,
    });
    // Flip every non-off creator to off so the bot stops immediately.
    let pausedCreators = 0;
    for (const c of creators) {
      if ((c.automation_mode || "off") !== "off") {
        try {
          await base44.asServiceRole.entities.CreatorProfile.update(c.id, { automation_mode: "off" });
          pausedCreators++;
        } catch (e) {}
      }
    }
    // Cancel in-flight jobs so nothing sends while paused.
    const [pending, processing] = await Promise.all([
      base44.asServiceRole.entities.AIJob.filter({ status: "pending" }, "-created_date", 500),
      base44.asServiceRole.entities.AIJob.filter({ status: "processing" }, "-created_date", 500),
    ]);
    let jobsCancelled = 0;
    for (const j of [...pending, ...processing]) {
      try {
        await base44.asServiceRole.entities.AIJob.update(j.id, {
          status: "cancelled",
          last_error: "GLOBAL_PAUSED",
          locked_at: null,
          locked_by: null,
        });
        jobsCancelled++;
      } catch (e) {}
    }
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "system.paused",
      status: "warning",
      message: `Global pause enabled — ${pausedCreators} creator(s) set to off, ${jobsCancelled} in-flight job(s) cancelled`,
      metadata: { creators: creators.length, pausedCreators, jobsCancelled },
    });
    return Response.json({ success: true, paused: true, pausedCreators, jobsCancelled });
  }

  if (action === "resume") {
    const config = await getAppConfig(base44);
    const snapshot = (config?.paused_modes || {}) as Record<string, string>;
    // The snapshot was captured at pause time and can go stale if the operator
    // manually set a creator to draft/full_auto while the system was paused.
    // Read each creator's live mode individually and prefer the MORE active
    // mode so Resume All never downgrades a creator the operator left running.
    let restored = 0;
    let kept = 0;
    for (const [creatorId, mode] of Object.entries(snapshot)) {
      let live = "off";
      try {
        const c = await base44.asServiceRole.entities.CreatorProfile.get(creatorId);
        live = (c?.automation_mode as string) || "off";
      } catch (e) {}
      const final = live === "draft" || live === "full_auto" ? live : mode;
      if (live === "draft" || live === "full_auto") kept++;
      try {
        await base44.asServiceRole.entities.CreatorProfile.update(creatorId, { automation_mode: final });
        restored++;
      } catch (e) {}
    }
    await base44.asServiceRole.entities.AppConfig.update(config.id, { paused: false, paused_modes: {} });
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "system.resumed",
      status: "success",
      message: `Global pause lifted — restored ${restored} creator(s) (${kept} kept live mode)`,
      metadata: { restored, kept },
    });
    return Response.json({ success: true, paused: false, restored, kept });
  }

  return Response.json({ error: "Unknown action" }, { status: 400 });
}