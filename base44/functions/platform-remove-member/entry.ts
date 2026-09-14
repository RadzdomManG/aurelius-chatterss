// platform-remove-member — platform-admin only.
// Unlinks a member from an organization by deleting their OrganizationMember
// record. The org's owner member cannot be removed. The user's app account is
// NOT deleted — they simply lose access to this org's data.
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

    const memberId = (body.memberId || "").toString().trim();
    if (!memberId) return Response.json({ error: "memberId is required" }, { status: 400 });

    const member = await base44.asServiceRole.entities.OrganizationMember.get(memberId).catch(() => null);
    if (!member) return Response.json({ error: "Member not found" }, { status: 404 });

    // --- Never remove the org's owner ---
    if (member.role === "owner") {
      return Response.json({ error: "The organization owner cannot be removed" }, { status: 400 });
    }

    const orgId = member.organization_id;
    const org = await base44.asServiceRole.entities.Organization.get(orgId).catch(() => null);

    await base44.asServiceRole.entities.OrganizationMember.delete(memberId);

    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        organization_id: orgId,
        event_type: "platform.member_removed",
        status: "warning",
        message: `Member ${member.user_id} removed from organization ${org?.name || orgId}`,
        metadata: { organization_id: orgId, member_id: memberId, removed_by: user.id },
      });
    } catch (e) {}

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message || "Unknown error" }, { status: 500 });
  }
}