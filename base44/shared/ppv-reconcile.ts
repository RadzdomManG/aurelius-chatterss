// PPV purchase reconciliation for analytics.
// The fixed ladder/level system is RETIRED — the persona owns pricing — so this
// module no longer advances/drops levels or manages rescue offers. It matches
// Fanvue spending insights to PpvOfferTracking records and marks them purchased
// (plus highest-spend + last-purchase facts on the fan) so the Revenue analytics
// tab and PpvOfferTracking stay accurate. Re-offers and discounts are now the
// persona's own judgment, driven by the "last_price_counter" FanMemory key.

import { getValidAccessToken, apiCall } from "./fanvue-api.ts";

const OFFER_EXPIRY_MS = 30 * 60 * 1000; // 30-min grace before an unpurchased offer counts as failed.

export async function reconcileFanPpv(base44, connection, fan, _settings) {
  if (!fan || !connection) return { matched: 0 };
  const creatorProfileId = fan.creator_profile_id;
  const fanId = fan.id;

  const allOffers = await base44.asServiceRole.entities.PpvOfferTracking.filter(
    { creator_profile_id: creatorProfileId, fan_id: fanId },
    "-created_date",
    100
  );

  const unreconciled = (allOffers || []).filter((o) => o.purchased !== true);
  let matched = 0;

  let purchases = [];
  try {
    const accessToken = await getValidAccessToken(connection, base44);
    const spendRes = await apiCall(
      "/v1/insights/spending?fanUuid=" + encodeURIComponent(fan.external_uuid) + "&size=50",
      accessToken
    );
    const items = Array.isArray(spendRes?.data) ? spendRes.data : Array.isArray(spendRes) ? spendRes : [];
    for (const t of items) {
      const amt = Number(t.amount ?? t.price ?? t.amountCents ?? t.value);
      const d = t.createdAt || t.created_at || t.date || t.timestamp || t.paidAt;
      const s = String((t.type ?? t.source ?? t.category ?? t.transactionType) || "").toLowerCase();
      if (isFinite(amt) && amt > 0 && d && (/ppv|locked|message/.test(s) || !s)) {
        purchases.push({ amountCents: Math.round(amt), at: new Date(d).getTime(), used: false });
      }
    }
  } catch (e) {
    console.error("[ppv-reconcile] spending fetch failed:", e?.message);
  }

  const fanUpdates = {};

  for (const offer of unreconciled) {
    const offerPrice = offer.price_cents || 0;
    const sentAt = offer.sent_at ? new Date(offer.sent_at).getTime() : new Date(offer.created_date || Date.now()).getTime();
    const match = purchases.find((p) => !p.used && p.amountCents === offerPrice && p.at >= sentAt);
    if (match) {
      match.used = true;
      matched++;
      const isRescue = offer.offer_type === "rescue";
      const update = {
        purchased: true,
        purchased_at: new Date(match.at).toISOString(),
        purchase_type: isRescue ? "rescue" : "base",
      };
      if (isRescue) {
        update.rescue_status = "purchased";
        await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, update);
        if (offer.parent_offer_id) {
          try {
            await base44.asServiceRole.entities.PpvOfferTracking.update(offer.parent_offer_id, { rescue_status: "purchased" });
          } catch (e) {}
        }
        fanUpdates.last_ppv_purchased_at = new Date(match.at).toISOString();
        fanUpdates.highest_discount_purchase_cents = Math.max(fan.highest_discount_purchase_cents || 0, offerPrice);
        fanUpdates.last_rescue_price_cents = offerPrice;
        fanUpdates.rescue_pending = false;
      } else {
        update.base_status = "purchased";
        await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, update);
        fanUpdates.last_ppv_purchased_at = new Date(match.at).toISOString();
        fanUpdates.consecutive_full_price_purchases = (fan.consecutive_full_price_purchases || 0) + 1;
        fanUpdates.highest_full_price_purchase_cents = Math.max(fan.highest_full_price_purchase_cents || 0, offerPrice);
        fanUpdates.last_base_ppv_price_cents = offerPrice;
        fanUpdates.rescue_pending = false;
      }
    }
  }

  // Expired-offer sweep: mark old unpurchased offers as failed for analytics.
  const now = Date.now();
  for (const offer of (allOffers || [])) {
    if (offer.offer_type !== "base") continue;
    if (offer.base_status === "purchased" || offer.base_status === "failed") continue;
    if (offer.purchased) continue;
    const sentAt = offer.sent_at ? new Date(offer.sent_at).getTime() : 0;
    if (!sentAt || now - sentAt < OFFER_EXPIRY_MS) continue;
    try {
      await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, { base_status: "failed" });
    } catch (e) {}
  }

  if (Object.keys(fanUpdates).length > 0) {
    try {
      await base44.asServiceRole.entities.Fan.update(fanId, fanUpdates);
    } catch (e) {
      console.error("[ppv-reconcile] fan update failed:", e?.message);
    }
  }

  return { matched, fanUpdates };
}