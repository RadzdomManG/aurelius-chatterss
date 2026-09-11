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

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function apiCall(path, accessToken, options = {}, maxRetries = 4) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Fanvue-API-Version": API_VERSION,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    const isRateLimited = res.status === 429 || res.status === 425;

    if (isRateLimited && attempt < maxRetries) {
      // Exponential backoff: 2s, 4s, 8s, 16s
      const waitMs = Math.pow(2, attempt + 1) * 1000;
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      const errorBody = await res.text();
      // Also retry on rate limit errors returned in the body with other status codes
      const bodyIsRateLimit = /rate.?limit|too many requests/i.test(errorBody);
      if (bodyIsRateLimit && attempt < maxRetries) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        await sleep(waitMs);
        continue;
      }
      throw new Error(`Fanvue API ${res.status} on ${path}: ${errorBody}`);
    }

    return res.json();
  }
}

export async function getMe(accessToken) {
  return apiCall("/v1/users/me", accessToken);
}

// v1 chats use CURSOR pagination (breaking change from page/size).
// Returns { data: [...], nextCursor: string|null }.
export async function getChats(accessToken, opts = {}) {
  const { cursor, size = 15, filter, search, sortBy, sortDirection, smartListIds, userUuids, customListId } = opts;
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("size", String(size));
  if (search) params.set("search", search);
  if (sortBy) params.set("sortBy", sortBy);
  if (sortDirection) params.set("sortDirection", sortDirection);
  if (filter) [].concat(filter).forEach((f) => params.append("filter", f));
  if (smartListIds) [].concat(smartListIds).forEach((s) => params.append("smartListIds", s));
  if (userUuids) [].concat(userUuids).forEach((u) => params.append("userUuids", u));
  if (customListId) params.set("customListId", customListId);
  return apiCall(`/v1/chats?${params}`, accessToken);
}

export async function getMessages(accessToken, userUuid, size = 50, cursor = null) {
  const params = new URLSearchParams({ size: String(size), markAsRead: "false" });
  if (cursor) params.set("cursor", cursor);
  return apiCall(`/v1/chats/${userUuid}/messages?${params}`, accessToken);
}

export async function sendFanvueMessage(accessToken, userUuid, text, price = null, media = null) {
  const body = {};
  if (text) body.text = text;
  if (price) body.price = price;
  if (media?.mediaUuids?.length) body.mediaUuids = media.mediaUuids;
  if (media?.mediaPreviewUuid) body.mediaPreviewUuid = media.mediaPreviewUuid;
  return apiCall(`/v1/chats/${userUuid}/message`, accessToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// v1 media endpoint — MUST request variants=thumbnail,main and status=ready
// to get usable thumbnail URLs. Without variants, the response returns only
// minimal media objects with no signed URLs.
export async function getMedia(accessToken, opts = {}) {
  const params = new URLSearchParams({
    size: String(opts.size || 50),
    variants: opts.variants || "thumbnail,main",
    status: "ready",
  });
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.folderName) params.set("folderName", opts.folderName);
  return apiCall(`/v1/media?${params}`, accessToken);
}

export async function getVaultMedia(accessToken, folderName = null, size = 50) {
  // Use /v1/media with folderName param (NOT /v1/vault/folders/{name}/media
  // which returns lightweight objects without variant URLs).
  return getMedia(accessToken, { folderName, size });
}

/**
 * Resolve a single fan's identity (displayName, handle, nickname, avatarUrl)
 * via the chats list filtered by the fan's user UUID. Used to hydrate fans
 * when a webhook event omits display_name/handle (Fanvue omits rather than
 * nulls), and by the identity backfill for existing "Unknown" records.
 * Returns the `user` object or null.
 */
export async function getChatForFan(accessToken, fanUuid) {
  const params = new URLSearchParams({ size: "1" });
  params.append("userUuids", fanUuid);
  const res = await apiCall(`/v1/chats?${params}`, accessToken);
  return res?.data?.[0]?.user || null;
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