// sync-fan-spending — pulls real spender data from Fanvue's top-spenders
// insights endpoint and writes total_spent_cents back onto our Fan records
// so the Subscribers page, Inspector, and AI context all reflect real spend.
//
// Called from the Audience page "Sync spending" button. One Fanvue API call
// (paginated) updates every known fan in bulk.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { apiCall, getValidAccessToken } from "../../shared/fanvue-api.ts";

function num(v: any): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return isFinite(n) ? n : 0;
}

function pickUuid(f: any): string | null {
  return f.uuid || f.fanUuid || f.userUuid || f.userId || f.id || null;
}

function pickSpent(f: any): number {
  // Fanvue returns cents for monetary fields; try common names.
  const cents = num(
    f.totalSpent || f.totalSpentCents || f.totalSpentCents || f.spent ||
    f.totalAmountSpent || f.amountSpent || f.lifetimeValue || f.netSpend
  );
  if (cents > 0) return Math.round(cents);
  // Some responses use dollars — if the value looks like dollars (< 1000) and
  // a cents field is absent, convert. Defensive: only when no cents-shaped field.
  const dollarish = num(f.totalSpentUsd || f.totalSpentDollars);
  if (dollarish > 0) return Math.round(dollarish * 100);
  return 0;
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

  // Wide date range (last 365 days) so the endpoint returns all spenders.
  const now = new Date();
  const startISO = new Date(now.getTime() - 365 * 86400000).toISOString();
  const endISO = now.toISOString();

  // Paginate the top-spenders endpoint. Fanvue uses cursor pagination.
  const spendersByUuid: Record<string, number> = {};
  let cursor: string | null = null;
  let pages = 0;
  const MAX_PAGES = 20;
  while (pages < MAX_PAGES) {
    pages++;
    const params = new URLSearchParams({
      size: "50",
      startDate: startISO,
      endDate: endISO,
    });
    if (cursor) params.set("cursor", cursor);
    let res: any;
    try {
      res = await apiCall(`/v1/insights/top-spenders?${params}`, accessToken);
    } catch (err: any) {
      // Retry once on transient Fanvue 5xx before giving up.
      if (/5\d\d|Service Unavailable|Bad Gateway|timeout/i.test(err.message || "")) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          res = await apiCall(`/v1/insights/top-spenders?${params}`, accessToken);
        } catch (err2: any) {
          return Response.json({
            error: err2.message || "Failed to fetch top spenders from Fanvue",
          }, { status: 502 });
        }
      } else {
        return Response.json({
          error: err.message || "Failed to fetch top spenders from Fanvue",
        }, { status: 502 });
      }
    }
    const items = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
    for (const f of items) {
      const uuid = pickUuid(f);
      const spent = pickSpent(f);
      if (uuid && spent > 0) spendersByUuid[uuid] = spent;
    }
    cursor = res?.cursor || res?.nextCursor || res?.meta?.cursor || null;
    if (!cursor || items.length === 0) break;
  }

  // Also try the subscribers endpoint — it carries amountPaid which we can
  // use as a floor for total_spent_cents when top-spenders didn't list a fan.
  try {
    let subCursor: string | null = null;
    let subPages = 0;
    while (subPages < 10) {
      subPages++;
      const params = new URLSearchParams({ size: "50" });
      if (subCursor) params.set("cursor", subCursor);
      const subRes: any = await apiCall(`/v1/insights/subscribers?${params}`, accessToken);
      const items = Array.isArray(subRes?.data) ? subRes.data : Array.isArray(subRes) ? subRes : [];
      for (const s of items) {
        const uuid = pickUuid(s);
        if (!uuid) continue;
        const subPaid = num(s.subscription?.amountPaid || s.amountPaid);
        const subPrice = num(s.subscription?.price || s.price);
        const floor = Math.max(subPaid, subPrice);
        if (floor > 0 && !(uuid in spendersByUuid)) spendersByUuid[uuid] = floor;
      }
      subCursor = subRes?.cursor || subRes?.nextCursor || subRes?.meta?.cursor || null;
      if (!subCursor || items.length === 0) break;
    }
  } catch (e) {
    // Best-effort — subscribers endpoint is supplementary.
  }

  // Load our Fan records for this creator and match by external_uuid.
  const fans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId },
    "-created_date",
    500
  );

  const toUpdate: any[] = [];
  let updated = 0;
  for (const fan of (fans || [])) {
    const spent = spendersByUuid[fan.external_uuid] || 0;
    // Only write if the value actually changed (avoids needless writes).
    if (spent > 0 && spent !== (fan.total_spent_cents || 0)) {
      toUpdate.push({ id: fan.id, total_spent_cents: spent });
    }
  }

  // Bulk update in chunks of 450.
  for (let i = 0; i < toUpdate.length; i += 450) {
    try {
      await base44.asServiceRole.entities.Fan.bulkUpdate(toUpdate.slice(i, i + 450));
      updated += Math.min(450, toUpdate.length - i);
    } catch (e) {
      console.error("[sync-fan-spending] bulkUpdate chunk failed:", (e as any).message);
    }
  }

  return Response.json({
    success: true,
    spendersFound: Object.keys(spendersByUuid).length,
    fansChecked: (fans || []).length,
    fansUpdated: updated,
  });
}