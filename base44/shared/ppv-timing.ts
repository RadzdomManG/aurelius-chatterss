// PPV timing + negotiation detection extracted from ai-processor-v2.
// Pure functions — operate on conversation/settings/recent-message data
// passed in, no DB calls. Imported by the AI processor.

// ---- PPV frequency limiting ----
export function isPpvOfferAllowed(conversation: any, settings: any, recentMsgs: any[]): boolean {
  if (!settings.ppv_allowed) return false;
  // Warm-up floor: never offer PPV in the first N messages of a conversation.
  const warmup = settings.ppv_warmup_messages ?? 3;
  if ((recentMsgs || []).length < warmup) return false;
  const minMessages = settings.ppv_min_messages_between_offers || 5;
  const minMinutes = Math.max(settings.ppv_min_minutes_between_offers || 10, 10);

  // Check time-based limit
  if (conversation.last_ppv_offer_at) {
    const lastOffer = new Date(conversation.last_ppv_offer_at).getTime();
    const minutesSince = (Date.now() - lastOffer) / 60000;
    if (minutesSince < minMinutes) return false;
  }

  // Check message-count-based limit: count creator messages since last PPV offer
  const recentCreatorMsgs = recentMsgs.filter((m: any) => m.sender_type === "creator" || m.source === "ai");
  if (conversation.last_ppv_offer_at) {
    const lastOfferTime = new Date(conversation.last_ppv_offer_at).getTime();
    const msgsSinceOffer = recentCreatorMsgs.filter((m: any) =>
      new Date(m.created_date).getTime() > lastOfferTime
    );
    if (msgsSinceOffer.length < minMessages) return false;
  }

  return true;
}

// ---- Negotiation detection ----
// A fan message is a price counter when a recent unpaid base offer exists AND
// the message contains a dollar amount or counter keywords. Lets the persona
// re-offer the SAME content immediately, bypassing the inter-offer cooldown.
export const NEGOTIATION_WINDOW_MS = 30 * 60 * 1000;
export const NEGOTIATION_KEYWORDS = ["cheaper", "lower", "less", "deal", "too much", "too expensive", "too pricey", "make it", "can u", "can you", "will you", "how about", "drop the price", "reduce", "negotiate", "discount"];

export function detectNegotiation(fanText: string, baseOffer: any): boolean {
  if (!baseOffer || baseOffer.purchased === true) return false;
  const sentAt = baseOffer.sent_at ? new Date(baseOffer.sent_at).getTime() : new Date(baseOffer.created_date || 0).getTime();
  if (!sentAt || Date.now() - sentAt > NEGOTIATION_WINDOW_MS) return false;
  const t = (fanText || "").toLowerCase();
  if (!t) return false;
  if (/\$\s*\d+/.test(t)) return true;
  if (/\b\d{1,3}\s*(bucks|dollar|dollars|usd)\b/.test(t)) return true;
  return NEGOTIATION_KEYWORDS.some((k) => t.includes(k));
}