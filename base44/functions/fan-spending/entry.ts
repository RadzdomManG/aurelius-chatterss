import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

// Fanvue's fan-insights endpoint provides purchase totals and source breakdown.
// /insights/spending is only for refunds and chargebacks.
export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  const base44 = createClientFromRequest(req);
  try { await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!body.fanId) return Response.json({ error: "fanId required" }, { status: 400 });

  const fan = await base44.asServiceRole.entities.Fan.get(body.fanId).catch(() => null);
  if (!fan) return Response.json({ error: "Fan not found" }, { status: 404 });

  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { creator_profile_id: fan.creator_profile_id, status: "connected" }, "-created_date", 1
  );
  const connection = connections[0];

  let insight: any = null;
  let insightError: string | null = null;
  if (!connection) {
    insightError = "No connected Fanvue account";
  } else if (!(connection.granted_scopes || []).includes("read:insights") ||
             !(connection.granted_scopes || []).includes("read:fan")) {
    insightError = "Missing read:insights or read:fan scope";
  } else {
    try {
      const accessToken = await getValidAccessToken(connection, base44);
      insight = await apiCall(`/v1/insights/fans/${encodeURIComponent(fan.external_uuid)}`, accessToken);
    } catch (e: any) {
      insightError = e.message || "Fan insights request failed";
    }
  }

  const spend = insight?.spending;
  const sources = spend?.sources || {};
  const total = spend?.total?.netTotal;
  const totalSpentCents = typeof total === "number" && Number.isFinite(total)
    ? total : (fan.total_spent_cents ?? 0);
  const sourceStats = (names: string[]) => {
    const selected = names.map((name) => sources[name]).filter(Boolean);
    const sumCents = selected.reduce((sum: number, item: any) => sum + (item.netTotal ?? 0), 0);
    const count = selected.reduce((sum: number, item: any) => sum + (item.netCount ?? 0), 0);
    return { sumCents, count, avgCents: count ? Math.round(sumCents / count) : 0 };
  };

  if (insight && totalSpentCents !== (fan.total_spent_cents ?? 0)) {
    try {
      await base44.asServiceRole.entities.Fan.update(fan.id, { total_spent_cents: totalSpentCents });
    } catch (e) {}
  }

  const maxPayment = spend?.maxSinglePayment?.total;
  return Response.json({
    fanId: fan.id,
    totalSpentCents,
    sinceDate: insight?.subscription?.createdAt || fan.created_date || null,
    // Fan insights supplies the date of the last purchase, but not its amount.
    lastSpend: null,
    lastPurchaseAt: spend?.lastValidPurchaseAt || null,
    totalPpv: sourceStats(["message", "post"]),
    totalTip: sourceStats(["tip"]),
    topPurchase: typeof maxPayment === "number" && maxPayment > 0
      ? { amountCents: maxPayment, type: "purchase", at: null } : null,
    subscription: {
      type: insight?.status || fan.subscription_status || "Unknown",
      costCents: 0,
      duration: null,
      autoRenewal: insight?.subscription?.autoRenewalEnabled ?? null,
    },
    errors: { fan: insightError },
  });
}
