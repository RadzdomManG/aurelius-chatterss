// Shared Fanvue API helpers — used by fanvue-auth, fanvue-sync, fanvue-webhook, send-message
import { secrets } from "base44:runtime";
import { decryptToken, encryptToken } from "./fanvue-crypto.ts";

const API_BASE = "https://api.fanvue.com";
const API_VERSION = "2025-06-26";
const TOKEN_URL = "https://auth.fanvue.com/oauth2/token";

function basicAuthHeader() {
  const clientId = secrets.get("FANVUE_CLIENT_ID");
  const clientSecret = secrets.get("FANVUE_CLIENT_SECRET");
  return "Basic " + btoa(`${clientId}:${clientSecret}`);
}

export async function apiCall(path, accessToken, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "X-Fanvue-API-Version": API_VERSION,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Fanvue API ${res.status} on ${path}: ${errorBody}`);
  }
  return res.json();
}

export async function getMe(accessToken) {
  return apiCall("/users/me", accessToken);
}

export async function getChats(accessToken, page = 1, size = 50, filter = null) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (filter) params.set("filter", filter);
  return apiCall(`/chats?${params}`, accessToken);
}

export async function getMessages(accessToken, userUuid, size = 50) {
  const params = new URLSearchParams({ size: String(size), markAsRead: "false" });
  return apiCall(`/chats/${userUuid}/messages?${params}`, accessToken);
}

export async function sendFanvueMessage(accessToken, userUuid, text, price = null) {
  const body = { text };
  if (price) body.price = price;
  return apiCall(`/chats/${userUuid}/message`, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function exchangeCodeForTokens(code, redirectUri, codeVerifier) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${errorBody}`);
  }
  return res.json();
}

export async function refreshFanvueToken(refreshTokenValue) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTokenValue,
    }),
  });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${errorBody}`);
  }
  return res.json();
}

// Decrypt the stored access token, refreshing if it's about to expire.
// Pass the base44 client (from createClientFromRequest) so we can update the connection.
export async function getValidAccessToken(connection, base44) {
  const encryptionKey = secrets.get("ENCRYPTION_KEY");
  const accessToken = await decryptToken(connection.encrypted_access_token, encryptionKey);

  if (connection.access_token_expires_at) {
    const expiresAt = new Date(connection.access_token_expires_at).getTime();
    if (Date.now() > expiresAt - 300000) {
      const refreshTokenValue = await decryptToken(connection.encrypted_refresh_token, encryptionKey);
      const tokens = await refreshFanvueToken(refreshTokenValue);
      const newEncryptedAccess = await encryptToken(tokens.access_token, encryptionKey);
      const newEncryptedRefresh = await encryptToken(tokens.refresh_token, encryptionKey);

      await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
        encrypted_access_token: newEncryptedAccess,
        encrypted_refresh_token: newEncryptedRefresh,
        access_token_expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      });

      return tokens.access_token;
    }
  }

  return accessToken;
}