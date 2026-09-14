// Anti-repetition utilities extracted from ai-processor-v2 for testability + reuse.
// Pure functions — no side effects, no DB calls. Imported by the AI processor
// and unit-testable in isolation.

const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

export function normalizeText(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function extractEmojis(text: string): string[] {
  return (text || "").match(EMOJI_REGEX) || [];
}

export function getRecentEmojis(creatorMsgs: any[], count = 15): string[] {
  const emojis: string[] = [];
  for (const m of creatorMsgs.slice(-10)) {
    emojis.push(...extractEmojis(m.body || ""));
  }
  return emojis.slice(-count);
}

export function hasRepetitiveEmoji(reply: string, recentEmojis: string[]): boolean {
  const replyEmojis = extractEmojis(reply);
  if (replyEmojis.length === 0) return false;
  const recentSet = new Set(recentEmojis);
  for (const e of replyEmojis) {
    if (recentSet.has(e)) {
      const count = replyEmojis.filter((x) => x === e).length;
      if (count >= 2) return true;
    }
  }
  if (replyEmojis.length > 0 && recentEmojis.length >= 3) {
    const last3 = recentEmojis.slice(-3);
    if (last3.every((e) => e === last3[0]) && replyEmojis.every((e) => e === last3[0])) return true;
  }
  return false;
}

const STOPWORD_PAIR = new Set(["the", "and", "but", "for", "was", "were", "you", "ur", "im", "just", "like", "with", "this", "that", "have", "been", "they", "them", "what", "when", "then", "some", "into", "your", "youre", "shes"]);

export function extractKeyphrases(text: string): Set<string> {
  const words = text.split(" ").filter((w) => w.length > 2);
  const phrases = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (pair.split(" ").every((w) => STOPWORD_PAIR.has(w))) continue;
    phrases.add(pair);
  }
  return phrases;
}

export function getBannedPhrases(recentCreatorMsgs: any[]): string[] {
  const last5 = recentCreatorMsgs.slice(-5).map((m) => normalizeText(m.body || "")).filter(Boolean);
  const all = new Set<string>();
  for (const c of last5) {
    extractKeyphrases(c).forEach((p) => all.add(p));
  }
  return Array.from(all).slice(0, 40);
}

export function isRepetitive(reply: string, recentCreatorMsgs: any[]): boolean {
  const r = normalizeText(reply);
  if (!r) return false;
  const recent = recentCreatorMsgs.slice(-10).map((m) => normalizeText(m.body)).filter(Boolean);
  if (recent.includes(r)) return true;
  const rOpen = r.split(" ").slice(0, 3).join(" ");
  if (rOpen && recent.some((c) => c.startsWith(rOpen))) return true;
  // Jaccard similarity (lowered from 0.8 -> 0.5 to catch near-paraphrases)
  const aSet = new Set(r.split(" "));
  for (const c of recent) {
    const bSet = new Set(c.split(" "));
    let inter = 0;
    aSet.forEach((w) => { if (bSet.has(w)) inter++; });
    const uni = aSet.size + bSet.size - inter;
    if (uni > 0 && inter / uni > 0.5) return true;
  }
  // Repeated keyphrase detection: reuse of 2+ distinctive 2-word phrases
  // from any of the last 5 creator replies (catches thematic repetition
  // like "on the couch" / "after work" even when overall overlap is low).
  const replyPhrases = extractKeyphrases(r);
  if (replyPhrases.size > 0) {
    const last5 = recent.slice(-5);
    for (const c of last5) {
      const cPhrases = extractKeyphrases(c);
      let reused = 0;
      replyPhrases.forEach((p) => { if (cPhrases.has(p)) reused++; });
      if (reused >= 2) return true;
    }
  }
  return false;
}

export { EMOJI_REGEX };