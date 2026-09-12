import { secrets } from "base44:runtime";

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";

/**
 * Calls xAI Grok directly with the XAI_API_KEY secret.
 * Returns parsed JSON matching the requested schema.
 * Falls back gracefully on error.
 */
const DEFAULT_MODEL = "grok-3-latest";

export async function callGrok(systemPrompt, userPrompt, jsonSchema, model = DEFAULT_MODEL) {
  const apiKey = secrets.get("XAI_API_KEY");
  if (!apiKey) throw new Error("XAI_API_KEY secret is not set");

  // Build a concise schema instruction for Grok
  const schemaKeys = jsonSchema?.properties ? Object.keys(jsonSchema.properties) : [];
  const schemaHint = schemaKeys.length > 0
    ? `\n\nRespond ONLY with a JSON object containing these keys: ${schemaKeys.join(", ")}. No markdown, no code fences, just raw JSON.`
    : "";

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt + schemaHint },
    ],
    temperature: 0.7,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  };

  // Hard timeout + 5xx retry: a single Grok 5xx must not fall back to a
  // different model (InvokeLLM) — that breaks persona consistency and costs
  // extra credits. Retry once on a transient server error instead.
  let res;
  const timeoutMs = 25000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(XAI_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") throw new Error(`xAI API timeout (>${timeoutMs / 1000}s)`);
      throw err;
    }
    clearTimeout(timeout);
    if (res.ok || res.status < 500) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }

  if (!res || !res.ok) {
    const errText = await res?.text().catch(() => res?.statusText || "no response");
    throw new Error(`xAI API ${res?.status || "none"}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";

  // Parse JSON from the response
  try {
    // Strip any accidental markdown fences
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // If parsing fails, return the raw content in a fallback shape
    return { reply: content, confidence: 0.5, intent: "conversation", sentiment: "neutral", _parseError: true };
  }
}