// sync-fan-spending — pulls real per-fan spend data from Fanvue's spending
// insights endpoint and writes total_spent_cents back onto our Fan records
// so the Subscribers page, Inspector, and AI context all reflect real spend.
//
// Called from the Audience page "Sync spending" button. Iterates every Fan
// record for the creator, calls /v1/insights/spending per fan (bounded
// concurrency), sums transaction amounts, and bulk-updates changed records.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

function num(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  const base44 = createClientFromRequest(req);
  try {
    await base44.auth.me();
  } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const creatorProfileId = body.creatorProfileId;
  if (!creatorProfileId) {
    return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
  }

  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { creator_profile_id: creatorProfileId, status: "connected" },
    "-created_date",
    1
  );
  const connection = connections[0];
  if (!connection) {
    return Response.json({ error: "No connected Fanvue account" }, { status: 404 });
  }

  const granted = connection.granted_scopes || [];
  if (!granted.includes("read:insights") || !granted.includes("read:fan")) {
    return Response.json({
      error: "Missing required scopes (read:insights, read:fan)",
      code: "MISSING_SCOPE",
    }, { status: 403 });
  }

  const accessToken = await getValidAccessToken(connection, base44);

  // Load all Fan records for this creator.
  const fans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId },
    "-created_date",
    500
  );

  if (!fans || fans.length === 0) {
    return Response.json({
      success: true,
      fansChecked: 0,
      fansUpdated: 0,
      message: "No fans to sync",
    });
  }

  // Per-fan spending lookup with bounded concurrency.
  const CONCURRENCY = 5;
  const results: { id: string; total_spent_cents: number }[] = [];
  let errors = 0;

  const fetchSpend = async (fan: any): Promise<void> => {
    const uuid = fan.external_uuid;
    if (!uuid) return;
    try {
      const res: any = await apiCall(
        `/v1/insights/spending?fanUuid=${encodeURIComponent(uuid)}&size=50`,
        accessToken
      );
      const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
      const total = items.reduce((sum: number, t: any) => {
        return sum + num(t.amount ?? t.price ?? t.amountCents ?? t.totalAmount ?? t.value);
      }, 0);
      if (total > 0 && total !== (fan.total_spent_cents || 0)) {
        results.push({ id: fan.id, total_spent_cents: total });
      }
    } catch (e) {
      errors++;
      // Continue — best-effort per fan.
    }
  };

  // Process in batches of CONCURRENCY.
  for (let i = 0; i < fans.length; i += CONCURRENCY) {
    const batch = fans.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(fetchSpend));
  }

  // Bulk update in chunks of 450.
  let updated = 0;
  for (let i = 0; i < results.length; i += 450) {
    try {
      await base44.asServiceRole.entities.Fan.bulkUpdate(results.slice(i, i + 450));
      updated += Math.min(450, results.length - i);
    } catch (e) {
      console.error("[sync-fan-spending] bulkUpdate chunk failed:", (e as any).message);
    }
  }

  return Response.json({
    success: true,
    fansChecked: fans.length,
    fansUpdated: updated,
    fanErrors: errors,
  });
}