// Canonical PPV ladder + rescue-offer price logic.
// Single source of truth for base ladder rungs, rescue pricing, and fan
// ladder-level advancement/demotion. Imported by ai-processor-v2 and
// process-rescue-offers so both ends agree on every price.

// Official base ladder: $12, $15, $25, $50, $80, $150, $250, $300, $400 (cents).
export const BASE_LADDER_CENTS = [1200, 1500, 2500, 5000, 8000, 15000, 25000, 30000, 40000];
export const BASE_MIN_CENTS = 1200; // $12 — normal/base PPV floor. NO normal offer may start below this.
export const BASE_MAX_CENTS = 40000; // $400 — absolute ceiling.
export const RESCUE_MIN_CENTS = 700; // $7 — rescue offers ONLY may go this low (from $12 → $7).
export const RESCUE_DISCOUNT_CENTS = 500; // $5 off.

export function getEnabledLadder(settings: any): number[] {
  let enabled = Array.isArray(settings?.ppv_ladder_enabled) ? settings.ppv_ladder_enabled : BASE_LADDER_CENTS;
  enabled = enabled.map(Number).filter((c) => Number.isFinite(c) && c >= BASE_MIN_CENTS && c <= BASE_MAX_CENTS);
  if (!enabled.length) enabled = BASE_LADDER_CENTS.slice();
  // De-dup + sort, restricted to the official rungs only (never allow invented
  // levels like $20/$35/$60/$100/$200 in the base ladder).
  const official = new Set(BASE_LADDER_CENTS);
  enabled = enabled.filter((c) => official.has(c));
  if (!enabled.length) enabled = BASE_LADDER_CENTS.slice();
  return Array.from(new Set(enabled)).sort((a, b) => a - b);
}

export function levelToCents(level: number, settings: any): number {
  const ladder = getEnabledLadder(settings);
  const idx = Math.max(0, Math.min(level, ladder.length - 1));
  return ladder[idx];
}

export function centsToLevel(cents: number, settings: any): number {
  const ladder = getEnabledLadder(settings);
  const idx = ladder.indexOf(cents);
  return idx >= 0 ? idx : 0;
}

// The base price for a fan's NEXT base offer = ladder at their current level.
export function basePriceForFan(fan: any, settings: any): number {
  const level = fan?.current_ppv_ladder_level ?? 0;
  return levelToCents(level, settings);
}

// Advance one level on a successful FULL-PRICE purchase (cap at top rung).
export function advanceLevel(level: number, settings: any): number {
  const ladder = getEnabledLadder(settings);
  return Math.min(level + 1, ladder.length - 1);
}

// Drop one level when a base+rescue cycle both fail (floor at level 0 = $12).
export function dropLevel(level: number): number {
  return Math.max(0, level - 1);
}

// Rescue price = base - $5, floored at $7. Only valid for rescue offers.
export function rescuePriceFor(baseCents: number): number {
  return Math.max(baseCents - RESCUE_DISCOUNT_CENTS, RESCUE_MIN_CENTS);
}

// Validate a BASE offer price: must be an exact official rung within [min,max].
export function isValidBasePrice(cents: number, settings: any): boolean {
  if (!Number.isFinite(cents) || cents < BASE_MIN_CENTS || cents > BASE_MAX_CENTS) return false;
  return getEnabledLadder(settings).includes(cents);
}

// Validate a RESCUE price: must equal base-$5 (floored at $7) and be >= $7.
export function isValidRescuePrice(rescueCents: number, baseCents: number): boolean {
  if (!Number.isFinite(rescueCents) || rescueCents < RESCUE_MIN_CENTS) return false;
  return rescueCents === rescuePriceFor(baseCents);
}

// Snap an arbitrary AI suggestion to the nearest enabled rung (used only as a
// hint; the authoritative base price comes from basePriceForFan).
export function snapToLadder(suggested: number, settings: any): number {
  const ladder = getEnabledLadder(settings);
  if (!suggested || suggested <= 0) return ladder[0];
  let best = ladder[0];
  let bestDiff = Math.abs(suggested - best);
  for (const c of ladder) {
    const d = Math.abs(suggested - c);
    if (d < bestDiff) { best = c; bestDiff = d; }
  }
  return best;
}