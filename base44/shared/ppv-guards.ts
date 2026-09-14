// Casual-turn PPV guardrails: a temperature gate and a tease-or-drop backstop.
//
// Temperature gate: PPV is only appropriate once the conversation has an
// explicit/flirty mood. A lightweight keyword scan over the recent message
// window — no extra LLM call — returns true when sexual language or a fan
// request for content/pics/video is present. Used to gate ppvAllowed BEFORE
// the AI is told PPV is on.
//
// Tease-or-drop backstop: after the AI generates its reply, if it set a price
// but the LAST bubble contains no content tease, the backend strips the PPV
// and the reply goes out as a free message. Prevents a paywall from being
// bolted onto an innocent conversational bubble.

// --- Temperature gate ---
// Sexual/flirty vocabulary + fan content-request signals. Broad on purpose:
// false negatives (blocking a legitimate offer) are safer than false positives
// (sending PPV on a casual turn).
const NSFW_KEYWORDS = [
  // explicit body / sexual
  "pussy", "cock", "dick", "tits", "boobs", "ass", "cum", "creampie", "wet",
  "horny", "hard", "hard on", "hard-on", "fuck", "fucking", "fingering",
  "stroke", "stroking", "moan", "moaning", "clit", "inside", "deep inside",
  "spank", "spanking", "nude", "nudes", "naked", "undress", "strip",
  "sext", "sexting", "dirty", "kink", "fetish", "dominate", "submissive",
  "throbbing", "dripping", "soaked", "aroused", "turned on", "touch yourself",
  "touch me", "feel me", "inside you", "fill you", "cum for me", "finish",
  "blowjob", "handjob", "riding", "on top of you", "bend over", "tie up",
  // flirty / escalation
  "flirty", "tease", "teasing", "craving", "want you", "want me", "need you",
  "thinking about you", "miss you", "alone right now", "what would you do",
  // fan content-request signals
  "send it", "send me", "show me", "can i see", "can you send", "i want to see",
  "let me see", "pics", "picture", "pictures", "photo", "photos", "video",
  "videos", "vid", "content", "unlock", "ppv", "pay", "premium", "exclusive",
];

// A PPV offer is itself an explicit signal: a recent creator message that
// references content/tease counts as ongoing sexual context.
const CREATOR_TEASE_KEYWORDS = [
  "something dirty", "something for you", "just for you", "made for you",
  "i took", "i filmed", "i recorded", "send it", "should i send",
  "want to see", "wet", "horny", "thinking about you",
];

export function hasExplicitMood(recentMsgs: any[]): boolean {
  if (!Array.isArray(recentMsgs) || recentMsgs.length === 0) return false;
  const window = recentMsgs.slice(-12);
  for (const m of window) {
    const t = String(m?.body || "").toLowerCase();
    if (!t) continue;
    // Only the fan's own content requests count as fan signals; creator
    // teases count as mood only when they reference explicit content.
    const isCreator = m.sender_type === "creator" || m.source === "ai";
    if (isCreator) {
      if (CREATOR_TEASE_KEYWORDS.some((k) => t.includes(k))) return true;
    } else {
      if (NSFW_KEYWORDS.some((k) => t.includes(k))) return true;
    }
  }
  return false;
}

// --- Tease-or-drop backstop ---
// Checks the LAST bubble for any reference to locked content / something to
// unlock. If the AI set a price but the last bubble has none of these, the
// caller strips the PPV and sends a free message.
const TEASE_KEYWORDS = [
  "send", "unlock", "unlocked", "pic", "pics", "picture", "pictures",
  "photo", "photos", "video", "videos", "vid", "content", "see", "watch",
  "made for you", "just for you", "for you", "took", "filmed", "recorded",
  "something", "tease", "special", "private", "only you", "your eyes",
  "i made", "i took", "i filmed", "i recorded", "should i", "want to see",
  "let me show", "i can show", "i can send", "i'll send", "ill send",
];

export function hasContentTease(lastBubble: string): boolean {
  const t = String(lastBubble || "").toLowerCase();
  if (!t.trim()) return false;
  return TEASE_KEYWORDS.some((k) => t.includes(k));
}