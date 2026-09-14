// copilot-toggle-automation — agent tool that pauses or resumes the bot.
// Per-creator: saves the current automation_mode to prior_automation_mode on
// pause, restores it on resume. Global (scope:"global"): sets AppConfig.paused.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, action, scope } = body;
    if (!action || !["pause", "resume"].includes(action)) {
      return Response.json({ error: "action must be 'pause' or 'resume'" }, { status: 400 });
    }

    // --- Global pause/resume ---
    if (scope === "global") {
      const configs = await base44.asServiceRole.entities.AppConfig.list("-created_date", 1);
      const paused = action === "pause";
      if (configs[0]) {
        await base44.asServiceRole.entities.AppConfig.update(configs[0].id, { paused });
      } else {
        await base44.asServiceRole.entities.AppConfig.create({ paused });
      }
      await base44.asServiceRole.entities.ActivityLog.create({
        event_type: "copilot.toggle_automation",
        status: "success",
        message: `Copilot ${paused ? "paused" : "resumed"} automation globally`,
        metadata: { scope: "global", action },
      });
      return Response.json({ success: true, scope: "global", action, paused });
    }

    // --- Per-creator pause/resume ---
    if (!creatorProfileId) {
      return Response.json({ error: "creatorProfileId is required (or use scope:'global')" }, { status: 400 });
    }

    let creator: any = null;
    try {
      const creators = await base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1);
      creator = creators[0];
    } catch (e) {}
    if (!creator) return Response.json({ error: "Creator not found" }, { status: 404 });

    if (action === "pause") {
      const currentMode = creator.automation_mode || "off";
      if (currentMode === "off") {
        return Response.json({ success: true, message: "Already paused", automationMode: "off" });
      }
      await base44.asServiceRole.entities.CreatorProfile.update(creatorProfileId, {
        automation_mode: "off",
        prior_automation_mode: currentMode,
        status: "paused",
      });
      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: creatorProfileId,
        event_type: "copilot.toggle_automation",
        status: "success",
        message: `Copilot paused automation (was ${currentMode})`,
        metadata: { action: "pause", previousMode: currentMode },
      });
      return Response.json({ success: true, action: "pause", previousMode: currentMode, automationMode: "off" });
    }

    // resume
    const priorMode = creator.prior_automation_mode || "draft";
    await base44.asServiceRole.entities.CreatorProfile.update(creatorProfileId, {
      automation_mode: priorMode,
      prior_automation_mode: null,
      status: "active",
    });
    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.toggle_automation",
      status: "success",
      message: `Copilot resumed automation (now ${priorMode})`,
      metadata: { action: "resume", restoredMode: priorMode },
    });
    return Response.json({ success: true, action: "resume", automationMode: priorMode });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}