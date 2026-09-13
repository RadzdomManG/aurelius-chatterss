// PPV purchase reconciliation + fan ladder state machine.
// Matches Fanvue spending insights to PpvOfferTracking records, then applies
// the ladder rules:
//  - full-price base purchase  → advance one level, cancel pending rescue
//  - discount rescue purchase  → keep same level
//  - base+rescue both unpurchased past the expiry window → mark failed,
//    bump consecutive_failed_offers so the next base offer drops one level
//
// Imported by ai-processor-v2 (before a new base offer) and process-rescue-offers
// (before sending a rescue) so both ends agree on the fan's true ladder state.

import { getValidAccessToken, apiCall } from "./fanvue-api.ts";
import { getEnabledLadder, advanceLevel, dropLevel, levelToCents } from "./ppv-ladder.ts";

const OFFER_EXPIRY_MS = 30 * 60 * 1000; // 30 min — grace before an unpurchased offer counts as failed.

export async function reconcileFanPpv(base44, connection, fan, settings) {
  if (!fan || !connection) return { matched: 0, levelChanged: false };
  const creatorProfileId = fan.creator_profile_id;
  const fanId = fan.id;

  // Load this fan's offer tracking records (base + rescue), most recent first.
  const allOffers = await base44.asServiceRole.entities.PpvOfferTracking.filter(
    { creator_profile_id: creatorProfileId, fan_id: fanId },
    "-created_date",
    100
  );

  const unreconciled = (allOffers || []).filter((o) => o.purchased !== true);
  if (unreconciled.length === 0) {
    // Still run the expired-offer sweep below.
  }

  let matched = 0;

  // Fetch Fanvue spending insights for this fan to detect purchases.
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

  let newLevel = fan.current_ppv_ladder_level ?? 0;
  let consecutiveFailed = fan.consecutive_failed_offers ?? 0;
  let levelChanged = false;
  const fanUpdates = {};

  // Match purchases to offers by exact price + recency (purchase after offer sent).
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
        // Rescue purchased → keep same level. Mark parent base offer rescue purchased.
        await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, update);
        if (offer.parent_offer_id) {
          try {
            await base44.asServiceRole.entities.PpvOfferTracking.update(offer.parent_offer_id, { rescue_status: "purchased" });
          } catch (e) {}
        }
        consecutiveFailed = 0;
        fanUpdates.last_ppv_purchased_at = new Date(match.at).toISOString();
        fanUpdates.highest_discount_purchase_cents = Math.max(fan.highest_discount_purchase_cents || 0, offerPrice);
        fanUpdates.last_rescue_price_cents = offerPrice;
        fanUpdates.rescue_pending = false;
      } else {
        // Base purchased → advance one level, cancel any pending rescue.
        update.base_status = "purchased";
        if (offer.rescue_status === "pending") update.rescue_status = "cancelled";
        await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, update);
        newLevel = advanceLevel(newLevel, settings);
        levelChanged = true;
        consecutiveFailed = 0;
        fanUpdates.last_ppv_purchased_at = new Date(match.at).toISOString();
        fanUpdates.consecutive_full_price_purchases = (fan.consecutive_full_price_purchases || 0) + 1;
        fanUpdates.highest_full_price_purchase_cents = Math.max(fan.highest_full_price_purchase_cents || 0, offerPrice);
        fanUpdates.last_base_ppv_price_cents = offerPrice;
        fanUpdates.rescue_pending = false;
      }
    }
  }

  // Expired-offer sweep: base offers past the grace window with no purchase and
  // no pending/sent rescue still in flight count as a failed cycle.
  const now = Date.now();
  for (const offer of (allOffers || [])) {
    if (offer.offer_type !== "base") continue;
    if (offer.base_status === "purchased" || offer.base_status === "failed") continue;
    if (offer.purchased) continue;
    const sentAt = offer.sent_at ? new Date(offer.sent_at).getTime() : 0;
    if (!sentAt || now - sentAt < OFFER_EXPIRY_MS) continue;
    // Rescue still pending/sent but not yet past its own expiry → don't fail yet.
    if (offer.rescue_status === "pending" || offer.rescue_status === "sent") {
      const rescueTime = offer.rescue_sent_at ? new Date(offer.rescue_sent_at).getTime() : (offer.rescue_scheduled_at ? new Date(offer.rescue_scheduled_at).getTime() : 0);
      if (rescueTime && now - rescueTime < OFFER_EXPIRY_MS) continue;
    }
    // Cycle failed.
    const upd = { base_status: "failed" };
    if (offer.rescue_status === "sent") upd.rescue_status = "failed";
    try {
      await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, upd);
    } catch (e) {}
    consecutiveFailed = (consecutiveFailed || 0) + 1;
  }

  fanUpdates.consecutive_failed_offers = consecutiveFailed;
  if (levelChanged) {
    fanUpdates.current_ppv_ladder_level = newLevel;
    fanUpdates.current_base_price_cents = levelToCents(newLevel, settings);
  }

  // Persist fan state if anything changed.
  if (Object.keys(fanUpdates).length > 0) {
    try {
      await base44.asServiceRole.entities.Fan.update(fanId, fanUpdates);
    } catch (e) {
      console.error("[ppv-reconcile] fan update failed:", e?.message);
    }
  }

  return { matched, levelChanged, newLevel, consecutiveFailed, fanUpdates };
}

// Apply the "drop one level for a failed cycle" rule right before sending a
// new base offer. Returns the level to use for the new offer. Resets the
// consecutive_failed counter once the drop is applied.
export async function applyFailedCycleDrop(base44, fan, settings) {
  let level = fan.current_ppv_ladder_level ?? 0;
  const failed = fan.consecutive_failed_offers ?? 0;
  if (failed >= 1) {
    level = dropLevel(level);
    try {
      await base44.asServiceRole.entities.Fan.update(fan.id, {
        current_ppv_ladder_level: level,
        current_base_price_cents: levelToCents(level, settings),
        consecutive_failed_offers: 0,
      });
    } catch (e) {}
  }
  return level;
}