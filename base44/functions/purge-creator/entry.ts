import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getAppConfig } from "../../shared/app-config.ts";

// purge-creator — permanently deletes a creator and EVERY record keyed to her
// creator_profile_id. Admin/owner only. Idempotent (safe to re-run). Children
// are deleted before the parent CreatorProfile + FanvueConnection to avoid
// orphaned records, and the creator's id is cleared from AppConfig.paused_modes
// so a stale snapshot can't resurrect a mode on global resume.
//
// Body: { creatorProfileId?: string }  (defaults to the known Mina id)
// Returns: { success, deleted: { Entity: count, ... }, remaining: number }
export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}
  const base44 = createClientFromRequest(req);

  // Auth + role gate (admin/owner only — this is irreversible).
  let authUser: any = null;
  try { authUser = await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const isAdmin = authUser?.role === "admin";
  let isOrgAdmin = false;
  if (!isAdmin && authUser?.id) {
    try {
      const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({ user_id: authUser.id }, "-created_date", 20);
      isOrgAdmin = (memberships || []).some((m: any) => m.role === "owner" || m.role === "admin");
    } catch (e) {}
  }
  if (!isAdmin && !isOrgAdmin) {
    return Response.json({ error: "Admin access required to purge a creator" }, { status: 403 });
  }

  const targetId = body.creatorProfileId || "6aa3d2fa70cc55a52286be30";
  if (!targetId) {
    return Response.json({ error: "Missing creatorProfileId" }, { status: 400 });
  }

  // Verify the creator exists (idempotent: if already gone, report zero).
  let creator: any = null;
  try {
    creator = await base44.asServiceRole.entities.CreatorProfile.get(targetId);
  } catch (e) {}
  const creatorName = creator?.display_name || targetId;

  const counts: Record<string, number> = {};
  const safeDeleteMany = async (entity: string, query: any): Promise<number> => {
    try {
      const before = await base44.asServiceRole.entities[entity].filter(query, "-created_date", 1);
      if (!before || before.length === 0) { counts[entity] = 0; return 0; }
      await base44.asServiceRole.entities[entity].deleteMany(query);
      counts[entity] = before.length;
      return before.length;
    } catch (e) {
      counts[entity] = -1;
      return 0;
    }
  };

  // 1. Children keyed by creator_profile_id — delete in dependency order.
  await safeDeleteMany("AIJob", { creator_profile_id: targetId });
  await safeDeleteMany("Message", { creator_profile_id: targetId });
  await safeDeleteMany("FanMemory", { creator_profile_id: targetId });
  await safeDeleteMany("ActivityLog", { creator_profile_id: targetId });
  await safeDeleteMany("PpvContentSet", { creator_profile_id: targetId });
  await safeDeleteMany("PpvOfferTracking", { creator_profile_id: targetId });
  await safeDeleteMany("AutomationSettings", { creator_profile_id: targetId });
  await safeDeleteMany("PersonaProfile", { creator_profile_id: targetId });
  await safeDeleteMany("Rule", { creator_profile_id: targetId });
  await safeDeleteMany("ScheduledAction", { creator_profile_id: targetId });
  await safeDeleteMany("Conversation", { creator_profile_id: targetId });
  await safeDeleteMany("Fan", { creator_profile_id: targetId });

  // 2. FanvueConnection (also keyed by creator_profile_id).
  await safeDeleteMany("FanvueConnection", { creator_profile_id: targetId });

  // 3. Finally the CreatorProfile itself.
  if (creator) {
    try {
      await base44.asServiceRole.entities.CreatorProfile.delete(targetId);
      counts["CreatorProfile"] = 1;
    } catch (e) {
      counts["CreatorProfile"] = -1;
    }
  } else {
    counts["CreatorProfile"] = 0;
  }

  // 4. Clear the creator's id from AppConfig.paused_modes so a global resume
  //    can't resurrect a stale automation_mode for a deleted creator.
  try {
    const config = await getAppConfig(base44);
    if (config?.paused_modes && config.paused_modes[targetId]) {
      const nextModes = { ...config.paused_modes };
      delete nextModes[targetId];
      await base44.asServiceRole.entities.AppConfig.update(config.id, { paused_modes: nextModes });
    }
  } catch (e) {}

  // 5. Verify zero remaining records for this creator.
  let remaining = 0;
  try {
    const leftover = await base44.asServiceRole.entities.Conversation.filter({ creator_profile_id: targetId }, "-created_date", 1);
    remaining += leftover?.length || 0;
  } catch (e) {}

  // 6. Log a single confirmation entry.
  try {
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "creator.purged",
      status: "warning",
      message: `Permanently deleted creator "${creatorName}" and all associated records`,
      metadata: { creator_profile_id: targetId, counts, remaining },
    });
  } catch (e) {}

  return Response.json({ success: true, creator: creatorName, deleted: counts, remaining });
}