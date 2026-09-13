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
 * LOCKED   = positively confirmed paid/paywalled (price > 0).
 * UNKNOWN  = isLocked flag set but no confirmed price (conservative: ineligible).
 * FREE     = no paywall, no lock (the fan can view it without paying).
 *
 * eligible_for_paid_ppv is true ONLY when accessState === LOCKED && isAvailable.
 */
export function parseAccessState(item) {
  const priceCents = Number(item?.pricing?.USD?.price ?? item?.priceCents ?? item?.price_cents ?? 0) || 0;
  const isLocked = item?.isLocked === true || item?.is_locked === true;
  const statusRaw = String(item?.status || "ready").toLowerCase();
  const isAvailable = statusRaw === "ready" || statusRaw === "";

  let accessState;
  if (priceCents > 0) {
    accessState = "LOCKED";
  } else if (isLocked) {
    accessState = "UNKNOWN";
  } else {
    accessState = "FREE";
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