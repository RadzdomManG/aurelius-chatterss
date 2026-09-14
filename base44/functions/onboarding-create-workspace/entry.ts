// onboarding-create-workspace — fires on user signup (via app_user_auth workflow).
// Idempotent: if the user already owns an organization, returns it without
// creating a duplicate. Creates the org, makes the user the owner, seeds
// default AutomationSettings for their first creator (once connected), and
// returns the new workspace so the frontend can redirect to the onboarding wizard.
//
// Called from the workflow with { user_id, email, auth_method }.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const { user_id, email, auth_method } = body;

    if (!user_id) return Response.json({ error: "user_id is required" }, { status: 400 });

    // --- Idempotency: check if the user already owns an org ---
    const existingMembers = await base44.asServiceRole.entities.OrganizationMember.filter(
      { user_id: user_id, role: "owner" },
      "-created_date",
      5
    );
    if (existingMembers && existingMembers.length > 0) {
      const orgIds = existingMembers.map((m: any) => m.organization_id);
      const orgs = await base44.asServiceRole.entities.Organization.filter(
        { id: { $in: orgIds } },
        "-created_date",
        5
      );
      if (orgs && orgs[0]) {
        return Response.json({
          success: true,
          already_existed: true,
          organization: orgs[0],
          message: "Workspace already provisioned",
        });
      }
    }

    // --- Create the Organization ---
    // Derive a friendly org name from the email (before the @).
    const orgName = email ? email.split("@")[0] + "'s Workspace" : "New Workspace";
    const org = await base44.asServiceRole.entities.Organization.create({
      name: orgName,
      plan_tier: "free",
      plan_status: "active",
      mrr_cents: 0,
      trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7-day trial
    });

    // --- Make the user the owner ---
    await base44.asServiceRole.entities.OrganizationMember.create({
      organization_id: org.id,
      user_id: user_id,
      role: "owner",
      platform_admin: false,
    });

    // --- Stamp the user's organization_id on their profile data ---
    // The frontend reads this to scope all creator-scoped entities.
    try {
      await base44.asServiceRole.auth.updateUser(user_id, {
        organization_id: org.id,
      });
    } catch (e) {
      // updateMe/updateUser may not support custom data on all setups —
      // the org link is also stored on OrganizationMember, so this is best-effort.
    }

    // --- Create a UsageRecord for the current month ---
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      await base44.asServiceRole.entities.UsageRecord.create({
        organization_id: org.id,
        month: monthKey,
        ai_jobs_processed: 0,
        messages_sent: 0,
        creators_connected: 0,
        ppv_offers_sent: 0,
        reset_at: now.toISOString(),
      });
    } catch (e) {
      // UsageRecord may already exist (edge case) — ignore.
    }

    // --- Log the provisioning ---
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        organization_id: org.id,
        event_type: "platform.onboarding",
        status: "success",
        message: `Workspace provisioned for ${email || user_id} (auth: ${auth_method || "unknown"})`,
        metadata: { org_id: org.id, user_id, email, auth_method },
      });
    } catch (e) {}

    return Response.json({
      success: true,
      already_existed: false,
      organization: org,
      message: "Workspace provisioned successfully",
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}