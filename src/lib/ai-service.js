import { base44 } from "@/api/base44Client";

/**
 * AI Service — routes draft/playground generation through the backend so the
 * same strict persona prompt and OpenAI-compatible provider are used everywhere.
 */

export async function generateDraft(params) {
  const { personaInstructions, fanDisplayName, fanMemory, recentMessages, newMessage } = params;

  if (!personaInstructions) {
    return {
      reply: "",
      confidence: 0,
      intent: "error",
      sentiment: "neutral",
      error: "No active persona set for this creator. Set a persona in Models → Persona.",
    };
  }

  const conversationContext = (recentMessages || [])
    .slice(-15)
    .map((m) => `${m.sender === "fan" ? "Fan" : "Creator"}: ${m.text || m.body || ""}`)
    .join("\n");

  try {
    const res = await base44.functions.invoke("generate-ai-reply", {
      personaInstructions,
      fanDisplayName,
      fanMemory,
      recentMessages,
      newMessage,
      simulation: false,
    });

    return res?.data || res;
  } catch (err) {
    console.error("AI generation failed:", err);
    return {
      reply: "",
      confidence: 0,
      intent: "error",
      sentiment: "neutral",
      error: err.message || "AI generation failed",
    };
  }
}

export async function generatePlaygroundReply(params) {
  const { personaInstructions, fanMemory, recentMessages, newMessage, fanDisplayName } = params;

  const conversationContext = (recentMessages || [])
    .map((m) => `${m.sender === "fan" ? "Fan" : "Creator"}: ${m.text || m.body || ""}`)
    .join("\n");

  try {
    const res = await base44.functions.invoke("generate-ai-reply", {
      personaInstructions,
      fanDisplayName,
      fanMemory,
      recentMessages,
      newMessage,
      simulation: true,
    });

    return res?.data || res;
  } catch (err) {
    return {
      reply: "",
      confidence: 0,
      intent: "error",
      sentiment: "neutral",
      error: err.message || "AI generation failed",
    };
  }
}