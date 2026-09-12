import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

// fan-spending — consolidates a single fan's REAL Fanvue spend + subscription
// data into one normalized payload for the Inbox Inspector. The total spent is
// taken from our synced Fan record (authoritative, never invented); the PPV/tip
// breakdown, last spend, top purchase, and subscription details are best-effort
// from the Fanvue insights API. Every missing field resolves to 0 / null so the
// UI can honestly show $0.00 and "-" — no number is ever fabricated.

function num(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

function classifyType(raw: any): "ppv" | "tip" | "subscription" | "purchase" {
  const s = String(raw || "").toLowerCase();
  if (/tip/.test(s)) return "tip";
  if (/ppv|locked|message/.test(s)) return "ppv";
  if (/sub/.test(s)) return "subscription";
  return "purchase";
}

function pickDate(...candidates: any[]): string | null {
  for (const c of candidates) {
    if (c && typeof c === "string") return c;
  }
  return null;
}

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  const base44 = createClientFromRequest(req);

  let user: any;
  try { user = await base44.auth.me(); } catch (e) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const fanId = body.fanId;
  if (!fanId) return Response.json({ error: "fanId required" }, { status: 400 });

  const fan = await base44.asServiceRole.entities.Fan.get(fanId).catch(() => null);
  if (!fan) return Response.json({ error: "Fan not found" }, { status: 404 });

  const creatorProfileId = fan.creator_profile_id;
  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { creator_profile_id: creatorProfileId, status: "connected" },
    "-created_date",
    1
  );
  const connection = connections[0];
  if (!connection) {
    // No Fanvue connection — return the DB-known total with zeroed breakdown.
    return Response.json({
      fanId,
      totalSpentCents: num(fan.total_spent_cents),
      sinceDate: fan.created_date || null,
      lastSpend: null,
      totalPpv: { sumCents: 0, avgCents: 0, count: 0 },
      totalTip: { sumCents: 0, avgCents: 0, count: 0 },
      topPurchase: null,
      subscription: { type: fan.subscription_status || "Unknown", costCents: 0, duration: null, autoRenewal: null },
      errors: { connection: "No connected Fanvue account" },
    });
  }

  // Authoritative total from our synced DB record — never invented.
  const totalSpentCents = num(fan.total_spent_cents);
  const userUuid = fan.external_uuid;

  const accessToken = await getValidAccessToken(connection, base44);

  // Each Fanvue call is independent — a failure on one does not blank the other.
  let fanProfile: any = null;
  let spendingItems: any[] = [];
  let fanError: string | null = null;
  let spendError: string | null = null;

  try {
    fanProfile = await apiCall(`/v1/insights/fans/${encodeURIComponent(userUuid)}`, accessToken);
  } catch (e: any) { fanError = e.message; }

  try {
    const spendRes: any = await apiCall(
      `/v1/insights/spending?fanUuid=${encodeURIComponent(userUuid)}&size=50`,
      accessToken
    );
    spendingItems = Array.isArray(spendRes?.data)
      ? spendRes.data
      : Array.isArray(spendRes) ? spendRes : [];
  } catch (e: any) { spendError = e.message; }

  // Normalize transactions
  const txns = spendingItems
    .map((t: any) => ({
      amountCents: num(t.amount ?? t.price ?? t.amountCents ?? t.totalAmount ?? t.value),
      type: classifyType(t.type ?? t.source ?? t.category ?? t.transactionType),
      at: pickDate(t.createdAt, t.created_at, t.date, t.timestamp, t.paidAt),
    }))
    .filter((t: any) => t.amountCents > 0);

  const ppvTxns = txns.filter((t) => t.type === "ppv");
  const tipTxns = txns.filter((t) => t.type === "tip");
  const totalPpvCents = ppvTxns.reduce((s, t) => s + t.amountCents, 0);
  const totalTipCents = tipTxns.reduce((s, t) => s + t.amountCents, 0);

  const topPurchase = txns.slice().sort((a, b) => b.amountCents - a.amountCents)[0] || null;
  const lastSpend = txns
    .slice()
    .sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())[0] || null;

  // Subscription details from the fan profile (defensive field mapping)
  const sub = fanProfile?.subscription || fanProfile?.subscriptionDetails || fanProfile || {};
  const subscription = {
    type: fan.subscription_status || sub.type || sub.status || sub.subscriptionStatus || "Unknown",
    costCents: num(sub.cost ?? sub.price ?? sub.amount ?? sub.costCents ?? sub.rebillPrice ?? sub.rebillAmount),
    duration: sub.duration ?? sub.billingPeriod ?? sub.term ?? sub.period ?? null,
    autoRenewal: sub.autoRenewal ?? sub.autoRenew ?? sub.rebill ?? sub.auto_renew ?? null,
  };

  // sinceDate: earliest transaction date, else fan created date
  const earliest = txns
    .slice()
    .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime())[0];
  const sinceDate = earliest?.at || fan.created_date || null;

  return Response.json({
    fanId,
    totalSpentCents,
    sinceDate,
    lastSpend: lastSpend ? { amountCents: lastSpend.amountCents, type: lastSpend.type, at: lastSpend.at } : null,
    totalPpv: {
      sumCents: totalPpvCents,
      avgCents: ppvTxns.length ? Math.round(totalPpvCents / ppvTxns.length) : 0,
      count: ppvTxns.length,
    },
    totalTip: {
      sumCents: totalTipCents,
      avgCents: tipTxns.length ? Math.round(totalTipCents / tipTxns.length) : 0,
      count: tipTxns.length,
    },
    topPurchase: topPurchase ? { amountCents: topPurchase.amountCents, type: topPurchase.type, at: topPurchase.at } : null,
    subscription,
    errors: { fan: fanError, spending: spendError },
  });
}