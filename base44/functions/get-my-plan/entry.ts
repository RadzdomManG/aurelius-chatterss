// get-my-plan — returns the current user's organization, plan tier, plan
// status, usage for the current month, and plan limits. Used by the frontend
// to gate features (e.g. "you're on the Free plan — upgrade to connect more
// creators") and show the billing/usage page.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getOrgForUser, getMonthlyUsage, getPlanLimits, PLAN_TIERS, currentMonthKey } from "../../shared/plan-limits.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const orgInfo = await getOrgForUser(base44, user.id);
    if (!orgInfo) {
      // Pre-SaaS user or workspace not yet provisioned.
      return Response.json({
        success: true,
        organization: null,
        plan: PLAN_TIERS.free,
        usage: null,
        isPlatformAdmin: user.role === "admin",
      });
    }

    const { org, limits } = orgInfo;
    const usage = await getMonthlyUsage(base44, org.id);

    // --- Check platform_admin flag ---
    let isPlatformAdmin = user.role === "admin";
    if (!isPlatformAdmin) {
      try {
        const members = await base44.asServiceRole.entities.OrganizationMember.filter(
          { user_id: user.id },
          "-created_date",
          10
        );
        isPlatformAdmin = (members || []).some((m: any) => m.platform_admin === true);
      } catch (e) {}
    }

    const aiUsed = usage?.ai_jobs_processed || 0;
    const aiLimit = limits.maxAiMessagesPerMonth;
    const aiPct = aiLimit > 0 ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;

    // --- Count current creators ---
    let creatorsConnected = 0;
    try {
      const creators = await base44.asServiceRole.entities.CreatorProfile.filter(
        { organization_id: org.id },
        "-created_date",
        200
      );
      creatorsConnected = (creators || []).length;
    } catch (e) {}

    return Response.json({
      success: true,
      organization: {
        id: org.id,
        name: org.name,
        planTier: org.plan_tier || "free",
        planStatus: org.plan_status || "active",
        mrrCents: org.mrr_cents || 0,
        trialEndsAt: org.trial_ends_at || null,
        createdAt: org.created_date,
      },
      plan: {
        tier: limits.tier,
        label: limits.label,
        maxCreators: limits.maxCreators,
        maxAiMessagesPerMonth: limits.maxAiMessagesPerMonth,
        copilotBulkScheduling: limits.copilotBulkScheduling,
        teamSeats: limits.teamSeats,
      },
      usage: {
        month: currentMonthKey(),
        aiJobsProcessed: aiUsed,
        aiMessagesLimit: aiLimit,
        aiUsagePercent: aiPct,
        messagesSent: usage?.messages_sent || 0,
        ppvOffersSent: usage?.ppv_offers_sent || 0,
        creatorsConnected,
      },
      isPlatformAdmin,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}