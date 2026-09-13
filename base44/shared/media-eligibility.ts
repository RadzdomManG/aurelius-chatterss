// Media PPV eligibility — the single invariant the automatic PPV engine must
// hold: IF MEDIA IS FREE, BEHAVE AS IF IT DOES NOT EXIST.
//
// This module parses the Fanvue media access state into a normalized
// VaultMedia row (access_state + eligible_for_paid_ppv) during vault sync,
// and validates any list of media UUIDs against current eligibility right
// before a PPV send. Both the AI candidate pool and the final send gate
// flow through here so free media can never reach the LLM or the fan.

/**
 * Parse a raw Fanvue media object into the normalized access state.
 *
 * FANVUE VAULT REALITY: the vault media endpoint returns the creator's PRIVATE
 * library. It exposes NO per-item lock flag and NO paywall price — only an
 * optional `recommendedPrice` (the creator's suggested price, often null). A
 * media item only becomes "free" or "locked" to a FAN when it is SENT (as a
 * free message or a PPV-priced message). So from the fan's perspective ALL
 * vault library items are private/unsold — none of it is "free" while it sits
 * in the vault.
 *
 * Therefore the eligibility model is:
 *  - An explicit free signal (isLocked=false with no price) → FREE, ineligible.
 *  - A confirmed price > 0 or isLocked=true → LOCKED, eligible if available.
 *  - No signal at all (the common vault case) → LOCKED (private library),
 *    eligible when available. The operator's folder-approval gate + the
 *    per-fan sent-media dedup (PpvOfferTracking) are what keep already-
 *    delivered or non-sellable content out of offers — NOT this flag.
 *
 * This keeps the user's invariant intact: content the fan already received
 * free is never re-sold, because the AI candidate pool excludes every media
 * UUID already in PpvOfferTracking for that fan.
 */
export function parseAccessState(item) {
  const priceCents = Number(
    item?.pricing?.USD?.price ??
    item?.priceCents ??
    item?.price_cents ??
    item?.recommendedPrice?.USD ??
    item?.recommendedPrice?.price ??
    (typeof item?.recommendedPrice === "number" ? item.recommendedPrice : 0)
  ) || 0;
  const isLocked = item?.isLocked === true || item?.is_locked === true;
  const isExplicitlyFree = (item?.isLocked === false || item?.is_locked === false) && priceCents === 0;
  const statusRaw = String(item?.status || "ready").toLowerCase();
  const isAvailable = statusRaw === "ready" || statusRaw === "";

  let accessState;
  if (isExplicitlyFree) {
    accessState = "FREE";
  } else {
    // Confirmed price, explicit lock, OR no signal at all (private library) → LOCKED.
    accessState = "LOCKED";
  }
  const eligibleForPaidPpv = accessState === "LOCKED" && isAvailable;
  return { priceCents, isLocked, isAvailable, accessState, eligibleForPaidPpv };
}

/**
 * Validate a list of media UUIDs for a PPV send.
 *
 * Every UUID must resolve to a VaultMedia row with eligible_for_paid_ppv === true.
 * If ANY item is free, unknown, unavailable, or missing, the whole offer is
 * blocked (PPV_BLOCKED_UNSAFE_MEDIA) — never partially sent.
 */
export async function validateMediaForPpv(base44, creatorProfileId, mediaUuids) {
  if (!Array.isArray(mediaUuids) || mediaUuids.length === 0) {
    return { ok: false, valid: [], invalid: [], missing: [], reason: "NO_MEDIA" };
  }
  const unique = Array.from(new Set(mediaUuids.filter(Boolean)));
  const valid = [];
  const invalid = [];
  const missing = [];

  for (const uuid of unique) {
    const rows = await base44.asServiceRole.entities.VaultMedia.filter(
      { creator_profile_id: creatorProfileId, external_uuid: uuid },
      "-created_date",
      1
    );
    const row = rows?.[0];
    if (!row) {
      missing.push(uuid);
    } else if (row.eligible_for_paid_ppv !== true) {
      invalid.push(uuid);
    } else {
      valid.push(uuid);
    }
  }

  const ok = valid.length === unique.length && invalid.length === 0 && missing.length === 0;
  let reason = null;
  if (!ok) {
    if (missing.length > 0) reason = "PPV_BLOCKED_UNSAFE_MEDIA: " + missing.length + " media not found in vault";
    else if (invalid.length > 0) reason = "PPV_BLOCKED_UNSAFE_MEDIA: " + invalid.length + " media not PPV-eligible (free/unknown/unavailable)";
    else reason = "PPV_BLOCKED_UNSAFE_MEDIA";
  }
  return { ok, valid, invalid, missing, reason };
}

/**
 * Filter a list of VaultMedia rows down to ONLY PPV-eligible (locked) items.
 * Used when building the AI candidate pool so free media never enters AI context.
 */
export function onlyEligible(rows) {
  return (rows || []).filter((m) => m?.eligible_for_paid_ppv === true && m?.is_available !== false);
}