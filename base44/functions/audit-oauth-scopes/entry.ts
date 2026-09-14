// audit-oauth-scopes — scheduled check that every connected FanvueConnection
// has the required OAuth scopes (read:insights, read:media). Flags missing
// scopes so the operator can reconnect before a sync or analytics pull breaks.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

const REQUIRED_SCOPES = ["read:insights", "read:media"];

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let checked = 0;
  let flagged = 0;
  const issues: any[] = [];

  try {
    const connections = await base44.asServiceRole.entities.FanvueConnection.filter({ status: "connected" }, "-created_date", 100);
    for (const conn of connections) {
      checked++;
      const granted = Array.isArray(conn.granted_scopes) ? conn.granted_scopes : [];
      const missing = REQUIRED_SCOPES.filter((s) => !granted.includes(s));
      if (missing.length > 0) {
        flagged++;
        issues.push({ creatorProfileId: conn.creator_profile_id, missing });
        try {
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: conn.creator_profile_id,
            event_type: "oauth.scope_audit",
            status: "warning",
            message: `Missing Fanvue OAuth scopes: ${missing.join(", ")}. Reconnect to restore analytics + vault sync.`,
            metadata: { missing, granted },
          });
        } catch (e) {}
      }
    }
  } catch (e) {}

  await base44.asServiceRole.entities.ActivityLog.create({
    event_type: "oauth.scope_audit_complete",
    status: flagged > 0 ? "warning" : "success",
    message: `OAuth scope audit: ${checked} connections checked, ${flagged} missing required scopes`,
    metadata: { checked, flagged, issues },
  });

  return Response.json({ success: true, checked, flagged, issues });
}