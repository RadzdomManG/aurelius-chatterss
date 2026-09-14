// platform-set-plan — admin-only function to manually assign/upgrade a
// customer's plan tier (free/pro/agency) or suspend/reactivate their access.
// All payment is handled off-platform by the platform owner — no Stripe,
// no automated billing. This function just stamps the plan on the org.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

const VALID_TIERS = new Set(["free", "pro", "agency"]);
const VALID_STATUSES = new Set(["active", "suspended", "trial"]);

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    // --- Platform admin gate ---
    const members = await base44.asServiceRole.entities.OrganizationMember.filter(
      { user_id: user.id },
      "-created_date",
      10
    );
    const isPlatformAdmin = (members || []).some((m: any) => m.platform_admin === true);
    if (!isPlatformAdmin && user.role !== "admin") {
      return Response.json({ error: "Forbidden — platform admin access required" }, { status: 403 });
    }

    const { organizationId, planTier, planStatus, mrrCents, trialEndsAt } = body;
    if (!organizationId) return Response.json({ error: "organizationId is required" }, { status: 400 });

    const update: any = {};
    if (planTier !== undefined) {
      if (!VALID_TIERS.has(planTier)) {
        return Response.json({ error: "Invalid planTier — must be free, pro, or agency" }, { status: 400 });
      }
      update.plan_tier = planTier;
    }
    if (planStatus !== undefined) {
      if (!VALID_STATUSES.has(planStatus)) {
        return Response.json({ error: "Invalid planStatus — must be active, suspended, or trial" }, { status: 400 });
      }
      update.plan_status = planStatus;
      if (planStatus === "suspended") {
        update.suspended_at = new Date().toISOString();
      } else if (planStatus === "active") {
        update.suspended_at = null;
      }
    }
    if (mrrCents !== undefined) {
      if (typeof mrrCents !== "number" || mrrCents < 0) {
        return Response.json({ error: "mrrCents must be a non-negative integer" }, { status: 400 });
      }
      update.mrr_cents = mrrCents;
    }
    if (trialEndsAt !== undefined) {
      update.trial_ends_at = trialEndsAt || null;
    }

    if (Object.keys(update).length === 0) {
      return Response.json({ error: "No fields to update" }, { status: 400 });
    }

    await base44.asServiceRole.entities.Organization.update(organizationId, update);

    // --- Log the change ---
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        organization_id: organizationId,
        event_type: "platform.plan_changed",
        status: "info",
        message: `Plan updated by platform admin: ${Object.entries(update).map(([k, v]) => `${k}=${v}`).join(", ")}`,
        metadata: { organizationId, updatedBy: user.id, ...update },
      });
    } catch (e) {}

    // --- If suspending, also pause all of the org's creators' automation ---
    if (planStatus === "suspended") {
      try {
        const orgCreators = await base44.asServiceRole.entities.CreatorProfile.filter(
          { organization_id: organizationId },
          "-created_date",
          50
        );
        for (const c of (orgCreators || [])) {
          await base44.asServiceRole.entities.CreatorProfile.update(c.id, { automation_mode: "off", status: "paused" });
        }
      } catch (e) {}
    }

    // --- If reactivating, restore creator status to active (automation stays off — owner re-enables) ---
    if (planStatus === "active") {
      try {
        const orgCreators = await base44.asServiceRole.entities.CreatorProfile.filter(
          { organization_id: organizationId, status: "paused" },
          "-created_date",
          50
        );
        for (const c of (orgCreators || [])) {
          await base44.asServiceRole.entities.CreatorProfile.update(c.id, { status: "active" });
        }
      } catch (e) {}
    }

    return Response.json({
      success: true,
      organizationId,
      updated: update,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}