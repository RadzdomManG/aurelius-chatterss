// Plan tier definitions and enforcement helpers.
// Shared by the AI processor, Copilot backend functions, and the frontend
// so the limits live in ONE place. The platform owner assigns tiers manually
// (payment handled off-platform); this module only enforces the caps.

export interface PlanLimits {
  tier: string;
  maxCreators: number;       // -1 = unlimited
  maxAiMessagesPerMonth: number; // -1 = unlimited
  copilotBulkScheduling: boolean;
  teamSeats: number;          // -1 = unlimited
  label: string;
}

export const PLAN_TIERS: Record<string, PlanLimits> = {
  free: {
    tier: "free",
    maxCreators: 1,
    maxAiMessagesPerMonth: 500,
    copilotBulkScheduling: false,
    teamSeats: 1,
    label: "Free",
  },
  pro: {
    tier: "pro",
    maxCreators: 3,
    maxAiMessagesPerMonth: 5000,
    copilotBulkScheduling: true,
    teamSeats: 3,
    label: "Pro",
  },
  agency: {
    tier: "agency",
    maxCreators: 10,
    maxAiMessagesPerMonth: 50000,
    copilotBulkScheduling: true,
    teamSeats: 10,
    label: "Agency",
  },
};

export function getPlanLimits(tier: string | undefined | null): PlanLimits {
  return PLAN_TIERS[tier || "free"] || PLAN_TIERS.free;
}

// --- Org resolution ---
// Finds the organization a creator belongs to by walking creator → creator_profile_id
// is NOT on the org directly; the link is via organization_id stamped on each
// creator-scoped entity. We look up the CreatorProfile, then find the
// OrganizationMember record for that org's owner (the first owner member),
// then read the Organization record for its plan_tier/plan_status.
export async function getOrgForCreator(base44: any, creatorProfileId: string): Promise<{ org: any; limits: PlanLimits } | null> {
  try {
    const creators = await base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1);
    const creator = creators[0];
    if (!creator || !creator.organization_id) return null;
    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: creator.organization_id }, "-created_date", 1);
    const org = orgs[0];
    if (!org) return null;
    return { org, limits: getPlanLimits(org.plan_tier) };
  } catch (e) {
    return null;
  }
}

// --- Org resolution by user (for frontend plan checks) ---
export async function getOrgForUser(base44: any, userId: string): Promise<{ org: any; limits: PlanLimits } | null> {
  try {
    const members = await base44.asServiceRole.entities.OrganizationMember.filter({ user_id: userId }, "-created_date", 5);
    if (!members || members.length === 0) return null;
    // Prefer the org where the user is the owner; otherwise first member record.
    const member = members.find((m: any) => m.role === "owner") || members[0];
    const orgs = await base44.asServiceRole.entities.Organization.filter({ id: member.organization_id }, "-created_date", 1);
    const org = orgs[0];
    if (!org) return null;
    return { org, limits: getPlanLimits(org.plan_tier) };
  } catch (e) {
    return null;
  }
}

// --- Current month string ---
export function currentMonthKey(date?: Date): string {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// --- Get or create the UsageRecord for this org this month ---
export async function getMonthlyUsage(base44: any, organizationId: string, month?: string): Promise<any | null> {
  const m = month || currentMonthKey();
  try {
    const existing = await base44.asServiceRole.entities.UsageRecord.filter(
      { organization_id: organizationId, month: m },
      "-created_date",
      1
    );
    if (existing && existing[0]) return existing[0];
    const created = await base44.asServiceRole.entities.UsageRecord.create({
      organization_id: organizationId,
      month: m,
      ai_jobs_processed: 0,
      messages_sent: 0,
      creators_connected: 0,
      ppv_offers_sent: 0,
      reset_at: new Date().toISOString(),
    });
    return created;
  } catch (e) {
    return null;
  }
}

// --- Increment a usage counter atomically (best-effort) ---
export async function incrementUsage(base44: any, organizationId: string, field: string, amount: number = 1): Promise<void> {
  const record = await getMonthlyUsage(base44, organizationId);
  if (!record) return;
  try {
    const current = (record as any)[field] || 0;
    await base44.asServiceRole.entities.UsageRecord.update(record.id, { [field]: current + amount });
  } catch (e) {
    // Non-blocking — usage tracking is best-effort, never stops processing.
  }
}

// --- Check if the org can process another AI message ---
// Returns { allowed: boolean, reason?: string, usage?: any, limits?: PlanLimits }
export async function checkAiMessageLimit(base44: any, creatorProfileId: string): Promise<{
  allowed: boolean;
  reason?: string;
  org?: any;
  limits?: PlanLimits;
  usage?: any;
}> {
  const orgInfo = await getOrgForCreator(base44, creatorProfileId);
  if (!orgInfo) {
    // No org linked — allow (backward compat for pre-SaaS creators).
    return { allowed: true };
  }
  const { org, limits } = orgInfo;

  // Suspended orgs cannot process AI.
  if (org.plan_status === "suspended") {
    return { allowed: false, reason: "ORG_SUSPENDED", org, limits };
  }

  // Unlimited plans skip the metering check.
  if (limits.maxAiMessagesPerMonth < 0) {
    return { allowed: true, org, limits };
  }

  const usage = await getMonthlyUsage(base44, org.id);
  if (!usage) {
    // If we can't read usage, allow (don't block on a metering failure).
    return { allowed: true, org, limits };
  }

  if ((usage.ai_jobs_processed || 0) >= limits.maxAiMessagesPerMonth) {
    return { allowed: false, reason: "PLAN_LIMIT_REACHED", org, limits, usage };
  }

  return { allowed: true, org, limits, usage };
}

// --- Check if the org can connect another creator ---
export async function checkCreatorLimit(base44: any, organizationId: string): Promise<{
  allowed: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}> {
  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId }, "-created_date", 1);
  const org = orgs[0];
  if (!org) return { allowed: true }; // backward compat

  const limits = getPlanLimits(org.plan_tier);
  if (limits.maxCreators < 0) return { allowed: true, limit: -1 };

  const existing = await base44.asServiceRole.entities.CreatorProfile.filter(
    { organization_id: organizationId },
    "-created_date",
    200
  );
  const current = (existing || []).length;
  if (current >= limits.maxCreators) {
    return { allowed: false, reason: "CREATOR_LIMIT_REACHED", current, limit: limits.maxCreators };
  }
  return { allowed: true, current, limit: limits.maxCreators };
}

// --- Check if the org can use Copilot bulk scheduling ---
export async function checkCopilotBulkAccess(base44: any, creatorProfileId: string): Promise<{
  allowed: boolean;
  reason?: string;
  limits?: PlanLimits;
}> {
  const orgInfo = await getOrgForCreator(base44, creatorProfileId);
  if (!orgInfo) return { allowed: true }; // backward compat
  const { limits, org } = orgInfo;
  if (org.plan_status === "suspended") {
    return { allowed: false, reason: "ORG_SUSPENDED", limits };
  }
  if (!limits.copilotBulkScheduling) {
    return { allowed: false, reason: "PLAN_NO_BULK_SCHEDULING", limits };
  }
  return { allowed: true, limits };
}