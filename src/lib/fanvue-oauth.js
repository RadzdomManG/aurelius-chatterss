// Shared Fanvue OAuth initiate flow — used by Models page and ModelFanvue component
import { base44 } from "@/api/base44Client";

function generateCodeVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generateCodeChallenge(verifier) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function initiateFanvueOAuth() {
  // Read OAuth config from AppConfig entity (populated from secrets)
  const configs = await base44.entities.AppConfig.list("-created_date", 1);
  const config = configs[0];
  if (!config?.fanvue_client_id) {
    throw new Error("Fanvue OAuth not configured. Ask the assistant to set up AppConfig.");
  }

  // Generate PKCE
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = crypto.randomUUID();

  // Store OAuth session for the callback
  await base44.entities.OAuthSession.create({
    code_verifier: codeVerifier,
    code_challenge: codeChallenge,
    state,
    status: "pending",
  });

  // Build OAuth authorization URL (official Fanvue OAuth2 endpoint)
  const scopes = config.fanvue_scopes || "openid offline_access offline read:self read:chat write:chat";
  const authUrl = `https://auth.fanvue.com/oauth2/auth?response_type=code&client_id=${config.fanvue_client_id}&redirect_uri=${encodeURIComponent(config.fanvue_redirect_uri)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

  window.location.href = authUrl;
}