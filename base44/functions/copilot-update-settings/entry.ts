// copilot-update-settings — agent tool that updates automation settings for the
// active creator. Accepts a settings patch object and applies only whitelisted
// fields (PPV, rate limits, active hours, rescue, warmup, re-engagement, etc.)
// so the agent can never overwrite sensitive fields like organization_id.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

const ALLOWED_FIELDS = new Set([
  "ppv_allowed",
  "max_replies_per_hour",
  "min_confidence",
  "ppv_warmup_messages",
  "ppv_min_messages_between_offers",
  "ppv_min_minutes_between_offers",
  "ppv_reoffer_days",
  "ppv_source",
  "ppv_preview_enabled",
  "vault_allowed_folder_names",
  "vault_media_per_offer",
  "rescue_enabled",
  "rescue_discount_cents",
  "rescue_min_delay_minutes",
  "rescue_max_delay_minutes",
  "reengagement_enabled",
  "reengagement_days_threshold",
  "active_hours_enabled",
  "active_hours_start",
  "active_hours_end",
  "runner_interval_seconds",
  "max_ppv_cents",
  "default_ppv_cents",
  "circuit_breaker_threshold",
]);

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, settings: patch } = body;
    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
    if (!patch || typeof patch !== "object") return Response.json({ error: "settings object is required" }, { status: 400 });

    // Filter to allowed fields only — never let the agent touch organization_id, etc.
    const cleanPatch: any = {};
    for (const [key, value] of Object.entries(patch)) {
      if (ALLOWED_FIELDS.has(key)) cleanPatch[key] = value;
    }
    if (Object.keys(cleanPatch).length === 0) {
      return Response.json({
        error: "No valid settings fields to update",
        allowedFields: Array.from(ALLOWED_FIELDS),
      }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.AutomationSettings.filter(
      { creator_profile_id: creatorProfileId }, "-created_date", 1
    );
    let settingsId: string;
    if (existing[0]) {
      await base44.asServiceRole.entities.AutomationSettings.update(existing[0].id, cleanPatch);
      settingsId = existing[0].id;
    } else {
      const created = await base44.asServiceRole.entities.AutomationSettings.create({
        creator_profile_id: creatorProfileId,
        ...cleanPatch,
      });
      settingsId = created.id;
    }

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.update_settings",
      status: "success",
      message: `Copilot updated automation settings: ${Object.keys(cleanPatch).join(", ")}`,
      metadata: { updatedFields: Object.keys(cleanPatch), values: cleanPatch },
    });

    return Response.json({
      success: true,
      updatedFields: Object.keys(cleanPatch),
      settingsId,
      settings: cleanPatch,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}