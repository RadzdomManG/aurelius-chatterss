// platform-admin-data — aggregates all customers for the SaaS Owner Dashboard.
// Returns total customers, customers by plan tier, MRR, active vs suspended,
// platform-wide usage totals, and a customer table with per-org drill-down.
//
// Gated to platform_admin users only.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { PLAN_TIERS } from "../../shared/plan-limits.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    // --- Platform admin gate ---
    // Check OrganizationMember.platform_admin for this user.
    const members = await base44.asServiceRole.entities.OrganizationMember.filter(
      { user_id: user.id },
      "-created_date",
      10
    );
    const isPlatformAdmin = (members || []).some((m: any) => m.platform_admin === true);
    // Also allow base44 built-in admin role (the platform owner's own account).
    if (!isPlatformAdmin && user.role !== "admin") {
      return Response.json({ error: "Forbidden — platform admin access required" }, { status: 403 });
    }

    // --- Load all organizations ---
    const orgs = await base44.asServiceRole.entities.Organization.list("-created_date", 500);

    // --- Load all members (to resolve owner emails + full rosters) ---
    const allMembers = await base44.asServiceRole.entities.OrganizationMember.list("-created_date", 500);
    const membersByOrg: Record<string, any[]> = {};
    for (const m of (allMembers || [])) {
      (membersByOrg[m.organization_id] = membersByOrg[m.organization_id] || []).push(m);
    }

    // --- Resolve emails for every member user_id in one pass ---
    const allUserIds = Array.from(new Set((allMembers || []).map((m: any) => m.user_id).filter(Boolean)));
    const userMap: Record<string, any> = {};
    // User entity is read-only via asServiceRole; fetch in batches of 50.
    for (let i = 0; i < allUserIds.length; i += 50) {
      const batch = allUserIds.slice(i, i + 50);
      for (const uid of batch) {
        try {
          const u = await base44.asServiceRole.entities.User.get(uid);
          if (u) userMap[uid] = u;
        } catch (e) {}
      }
    }

    // --- Load this month's usage records ---
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const usageRecords = await base44.asServiceRole.entities.UsageRecord.filter(
      { month: monthKey },
      "-created_date",
      500
    );
    const usageByOrg: Record<string, any> = {};
    for (const u of (usageRecords || [])) {
      usageByOrg[u.organization_id] = u;
    }

    // --- Load creators per org (count) ---
    const allCreators = await base44.asServiceRole.entities.CreatorProfile.list("-created_date", 500);
    const creatorsByOrg: Record<string, number> = {};
    for (const c of (allCreators || [])) {
      if (c.organization_id) creatorsByOrg[c.organization_id] = (creatorsByOrg[c.organization_id] || 0) + 1;
    }

    // --- Build customer table ---
    const customers = (orgs || []).map((org: any) => {
      const orgMembers = membersByOrg[org.id] || [];
      const ownerMember = orgMembers.find((m: any) => m.role === "owner");
      const usage = usageByOrg[org.id] || {};
      const limits = PLAN_TIERS[org.plan_tier || "free"] || PLAN_TIERS.free;
      const aiUsed = usage.ai_jobs_processed || 0;
      const aiLimit = limits.maxAiMessagesPerMonth;
      const aiPct = aiLimit > 0 ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;
      const members = orgMembers.map((m: any) => {
        const u = userMap[m.user_id];
        return {
          id: m.id,
          userId: m.user_id,
          email: u?.email || null,
          fullName: u?.full_name || null,
          role: m.role,
          platformAdmin: m.platform_admin === true,
        };
      });
      const ownerEmail = members.find((m: any) => m.role === "owner")?.email || null;
      return {
        id: org.id,
        name: org.name,
        planTier: org.plan_tier || "free",
        planStatus: org.plan_status || "active",
        mrrCents: org.mrr_cents || 0,
        suspendedAt: org.suspended_at || null,
        trialEndsAt: org.trial_ends_at || null,
        createdAt: org.created_date,
        ownerId: ownerMember?.user_id || null,
        ownerEmail,
        creatorsConnected: creatorsByOrg[org.id] || 0,
        maxCreators: limits.maxCreators,
        aiJobsThisMonth: aiUsed,
        aiMessagesLimit: aiLimit,
        aiUsagePercent: aiPct,
        messagesSentThisMonth: usage.messages_sent || 0,
        ppvOffersThisMonth: usage.ppv_offers_sent || 0,
        members,
      };
    });

    // --- Aggregate platform-wide stats ---
    const totalCustomers = customers.length;
    const customersByTier: Record<string, number> = { free: 0, pro: 0, agency: 0 };
    for (const c of customers) {
      customersByTier[c.planTier] = (customersByTier[c.planTier] || 0) + 1;
    }
    const totalMrr = customers.reduce((sum, c) => sum + (c.planStatus === "active" ? c.mrrCents : 0), 0);
    const activeCount = customers.filter((c) => c.planStatus === "active").length;
    const suspendedCount = customers.filter((c) => c.planStatus === "suspended").length;
    const trialCount = customers.filter((c) => c.planStatus === "trial").length;
    const totalAiJobs = customers.reduce((sum, c) => sum + c.aiJobsThisMonth, 0);
    const totalMessages = customers.reduce((sum, c) => sum + c.messagesSentThisMonth, 0);
    const totalCreatorsConnected = customers.reduce((sum, c) => sum + c.creatorsConnected, 0);

    // --- Sort: most recently created first, but active before suspended ---
    customers.sort((a, b) => {
      if (a.planStatus !== b.planStatus) {
        const order = { active: 0, trial: 1, suspended: 2 };
        return (order[a.planStatus] ?? 3) - (order[b.planStatus] ?? 3);
      }
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return Response.json({
      success: true,
      month: monthKey,
      stats: {
        totalCustomers,
        customersByTier,
        totalMrrCents: totalMrr,
        totalMrrDollars: totalMrr / 100,
        activeCount,
        suspendedCount,
        trialCount,
        totalAiJobs,
        totalMessages,
        totalCreatorsConnected,
      },
      customers,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}