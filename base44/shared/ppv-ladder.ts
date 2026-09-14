// Persona-owned PPV pricing bounds.
// The persona is the SOLE authority over when, how, and at what price to offer
// PPV — it may negotiate freely with the fan. The backend only enforces hard
// safety bounds: a $5 floor, a $400 ceiling, whole-dollar amounts. No fixed
// ladder, no per-fan level, no rung restrictions.

export const PRICE_FLOOR_CENTS = 500;     // $5 — absolute minimum, never lower.
export const PRICE_CEILING_CENTS = 40000;  // $400 — absolute maximum, never higher.

// Validate a persona-chosen price: whole-dollar cents within [floor, ceiling].
export function isValidPriceCents(cents: number): boolean {
  return Number.isInteger(cents) && cents >= PRICE_FLOOR_CENTS && cents <= PRICE_CEILING_CENTS;
}

// Clamp + round an arbitrary AI suggestion to a valid whole-dollar price.
// Returns null when the AI chose not to offer (null / 0 / missing).
export function clampPersonaPrice(cents: number | null | undefined): number | null {
  if (!Number.isFinite(cents as number) || !cents || (cents as number) <= 0) return null;
  const whole = Math.round((cents as number) / 100) * 100; // nearest whole dollar
  return Math.max(PRICE_FLOOR_CENTS, Math.min(PRICE_CEILING_CENTS, whole));
}