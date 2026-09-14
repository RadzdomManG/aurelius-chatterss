// platform-invite-member — platform-admin only.
// Sends a Base44 invite email to the given address, provisions the user,
// resolves their user_id, and links them to the target organization as an
// operator OrganizationMember. Idempotent: if a member record already exists
// for that user+org, it returns success without re-inviting.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    // --- Platform admin gate ---
    const myMemberships = await base44.asServiceRole.entities.OrganizationMember.filter(
      { user_id: user.id },
      "-created_date",
      10
    );
    const isPlatformAdmin = (myMemberships || []).some((m: any) => m.platform_admin === true);
    if (!isPlatformAdmin && user.role !== "admin") {
      return Response.json({ error: "Forbidden — platform admin access required" }, { status: 403 });
    }

    const email = (body.email || "").toString().trim().toLowerCase();
    const organizationId = (body.organizationId || "").toString().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "A valid email is required" }, { status: 400 });
    }
    if (!organizationId) {
      return Response.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Confirm the org exists.
    const org = await base44.asServiceRole.entities.Organization.get(organizationId).catch(() => null);
    if (!org) return Response.json({ error: "Organization not found" }, { status: 404 });

    // --- Resolve an existing user with this email (already registered) ---
    const existing = await base44.asServiceRole.entities.User.filter({ email }, "-created_date", 5);
    let userId: string | null = existing && existing[0] ? existing[0].id : null;

    // --- Idempotency: already a member of this org? ---
    if (userId) {
      const existingMembers = await base44.asServiceRole.entities.OrganizationMember.filter(
        { organization_id: organizationId },
        "-created_date",
        100
      );
      const already = (existingMembers || []).find((m: any) => m.user_id === userId);
      if (already) {
        return Response.json({ success: true, alreadyMember: true, memberId: already.id, userId });
      }
    }

    // --- Send the invite email (provisions a pending User if none exists) ---
    // inviteUser throws if the user already has an account — that's fine; we
    // still want to link them as a member below.
    if (!userId) {
      try {
        await base44.users.inviteUser(email, "user");
      } catch (e: any) {
        // If the invite failed because the user already exists, resolve them now.
        // Otherwise surface the error (invalid email, rate limited, etc).
        const msg = (e.message || "").toLowerCase();
        const recheck = await base44.asServiceRole.entities.User.filter({ email }, "-created_date", 5);
        if (recheck && recheck[0]) {
          userId = recheck[0].id;
        } else if (/already|exist|registered/i.test(msg)) {
          return Response.json({ error: "User exists but could not be resolved" }, { status: 500 });
        } else {
          return Response.json({ error: "Invite failed: " + (e.message || "Unknown error") }, { status: 500 });
        }
      }
    }

    if (!userId) {
      // The invite provisioned a pending user; resolve their id by email.
      const afterInvite = await base44.asServiceRole.entities.User.filter({ email }, "-created_date", 5);
      if (afterInvite && afterInvite[0]) userId = afterInvite[0].id;
    }

    if (!userId) {
      return Response.json({ error: "Could not resolve invited user id" }, { status: 500 });
    }

    // --- Create the OrganizationMember link as an operator ---
    const member = await base44.asServiceRole.entities.OrganizationMember.create({
      organization_id: organizationId,
      user_id: userId,
      role: "operator",
      platform_admin: false,
    });

    // --- Log the action ---
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        organization_id: organizationId,
        event_type: "platform.member_invited",
        status: "success",
        message: `Operator ${email} invited to organization ${org.name || organizationId}`,
        metadata: { organization_id: organizationId, user_id: userId, member_id: member.id, invited_by: user.id },
      });
    } catch (e) {}

    return Response.json({ success: true, memberId: member.id, userId, email });
  } catch (error: any) {
    return Response.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}