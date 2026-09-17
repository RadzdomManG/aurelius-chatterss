// Sync Fanvue's per-fan lifetime spend into local Fan records.
// /v1/insights/spending lists refunds and chargebacks, not purchases.
// Fan insights supplies the fan's actual total, including reversals.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  const base44 = createClientFromRequest(req);
  try { await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const creatorProfileId = body.creatorProfileId;
  if (!creatorProfileId) {
    return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
  }

  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1
  );
  const connection = connections[0];
  if (!connection) return Response.json({ error: "No connected Fanvue account" }, { status: 404 });

  const granted = connection.granted_scopes || [];
  if (!granted.includes("read:insights") || !granted.includes("read:fan")) {
    return Response.json({
      error: "Missing required scopes (read:insights, read:fan)",
      code: "MISSING_SCOPE",
    }, { status: 403 });
  }

  const accessToken = await getValidAccessToken(connection, base44);
  const fans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId }, "-created_date", 500
  );
  if (!fans?.length) {
    return Response.json({ success: true, fansChecked: 0, fansUpdated: 0, fanErrors: 0 });
  }

  const updates: { id: string; total_spent_cents: number }[] = [];
  let errors = 0;
  for (let i = 0; i < fans.length; i += 100) {
    const batch = fans.slice(i, i + 100).filter((fan: any) => fan.external_uuid);
    if (!batch.length) continue;
    try {
      const response: any = await apiCall("/v1/insights/fans/batch", accessToken, {
        method: "POST",
        body: JSON.stringify({ userUuids: batch.map((fan: any) => fan.external_uuid) }),
      });
      for (const fan of batch) {
        const insight = response?.[fan.external_uuid];
        const total = insight?.spending?.total?.netTotal;
        if (typeof total !== "number" || !Number.isFinite(total)) {
          errors++;
          continue;
        }
        if (total !== (fan.total_spent_cents ?? 0)) {
          updates.push({ id: fan.id, total_spent_cents: total });
        }
      }
    } catch (e: any) {
      console.error("[sync-fan-spending] batch failed:", e.message);
      errors += batch.length;
    }
  }

  let updated = 0;
  for (let i = 0; i < updates.length; i += 450) {
    try {
      const chunk = updates.slice(i, i + 450);
      await base44.asServiceRole.entities.Fan.bulkUpdate(chunk);
      updated += chunk.length;
    } catch (e: any) {
      console.error("[sync-fan-spending] bulkUpdate failed:", e.message);
      errors += updates.slice(i, i + 450).length;
    }
  }

  return Response.json({
    success: errors === 0,
    fansChecked: fans.length,
    fansUpdated: updated,
    fanErrors: errors,
    moreAvailable: fans.length === 500,
  });
}
