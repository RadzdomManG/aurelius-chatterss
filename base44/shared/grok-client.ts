import { secrets } from "base44:runtime";

const XAI_API_URL = "https://api.x.ai/v1/chat/completions";
const DEFAULT_XAI_MODEL = "grok-3-latest";
const DEFAULT_LOCAL_MODEL = "rei-local";

function getSecret(name: string): string {
  try {
    return String(secrets.get(name) || "").trim();
  } catch (e) {
    return "";
  }
}

function completionUrl(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, "");
  if (clean.endsWith("/chat/completions")) return clean;
  if (clean.endsWith("/v1")) return `${clean}/chat/completions`;
  return `${clean}/v1/chat/completions`;
}

function parseJsonContent(content: string) {
  const cleaned = String(content || "")
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch (inner) {}
    }
    return { reply: cleaned, confidence: 0.5, intent: "conversation", sentiment: "neutral", _parseError: true };
  }
}

export function isCustomAIConfigured() {
  return !!getSecret("AI_API_BASE_URL");
}

/**
 * Calls the configured OpenAI-compatible chat provider.
 *
 * Secrets:
 * - AI_API_BASE_URL: optional. Use this to replace Grok with a local/tunnel URL, e.g. https://your-tunnel.trycloudflare.com/v1
 * - AI_MODEL: optional. Defaults to rei-local when AI_API_BASE_URL is set, otherwise grok-3-latest.
 * - AI_API_KEY: optional bearer token for the custom provider.
 * - AI_TIMEOUT_MS: optional timeout for the custom provider. Default is 180000.
 * - XAI_API_KEY: fallback key for xAI when AI_API_BASE_URL is not set.
 */
export async function callGrok(systemPrompt, userPrompt, jsonSchema, model = null) {
  const customBaseUrl = getSecret("AI_API_BASE_URL");
  const isCustom = !!customBaseUrl;
  const apiUrl = isCustom ? completionUrl(customBaseUrl) : XAI_API_URL;
  const apiKey = isCustom ? getSecret("AI_API_KEY") : getSecret("XAI_API_KEY");
  const selectedModel = model || getSecret("AI_MODEL") || (isCustom ? DEFAULT_LOCAL_MODEL : DEFAULT_XAI_MODEL);

  if (!isCustom && !apiKey) throw new Error("XAI_API_KEY secret is not set");

  const schemaKeys = jsonSchema?.properties ? Object.keys(jsonSchema.properties) : [];
  const schemaHint = schemaKeys.length > 0
    ? `\n\nRespond ONLY with a valid JSON object containing these keys: ${schemaKeys.join(", ")}. No markdown, no code fences, just raw JSON.`
    : "";

  const body = {
    model: selectedModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt + schemaHint },
    ],
    temperature: 0.75,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  };

  let res;
  const timeoutMs = isCustom ? 180000 : 25000;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      res = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeout);
      if (err?.name === "AbortError") throw new Error(`${isCustom ? "Custom AI" : "xAI"} API timeout (>${timeoutMs / 1000}s)`);
      throw err;
    }
    clearTimeout(timeout);
    if (res.ok || res.status < 500) break;
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }

  if (!res || !res.ok) {
    const errText = await res?.text().catch(() => res?.statusText || "no response");
    throw new Error(`${isCustom ? "Custom AI" : "xAI"} API ${res?.status || "none"}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseJsonContent(content);
}