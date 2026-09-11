import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { secrets } from "base44:runtime";
import { encryptToken } from "../../shared/fanvue-crypto.ts";
import { exchangeCodeForTokens, getMe } from "../../shared/fanvue-api.ts";

// --- PKCE helpers (server-side, never exposed to browser) ---
function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateCodeVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function generateCodeChallenge(verifier: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(hash));
}

// Full scope set — includes read:insights, read:creator, read:fan, write:creator,
// write:post, write:media for all active product features.
const FANVUE_SCOPES = "openid offline_access offline read:self read:chat write:chat read:creator read:fan read:media read:insights write:creator write:post write:media read:tracking_links write:tracking_links";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, code, state, redirectUri } = body;

    // --- INITIATE: build the OAuth authorization URL server-side ---
    if (action === "initiate") {
      const clientId = secrets.get("FANVUE_CLIENT_ID");
      const redirect = secrets.get("FANVUE_REDIRECT_URI");

      if (!clientId || !redirect) {
        return Response.json(
          { error: "FANVUE_CLIENT_ID and FANVUE_REDIRECT_URI secrets must be set" },
          { status: 500 }
        );
      }

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const stateValue = crypto.randomUUID();

      await base44.asServiceRole.entities.OAuthSession.create({
        code_verifier: codeVerifier,
        code_challenge: codeChallenge,
        state: stateValue,
        status: "pending",
      });

      // prompt=login forces a fresh Fanvue login screen, clearing any stale
      // session that triggers "Login session does not match the signed-in account".
      const authUrl = `https://auth.fanvue.com/oauth2/auth?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent(FANVUE_SCOPES)}&state=${stateValue}&code_challenge=${codeChallenge}&code_challenge_method=S256&prompt=login`;

      return Response.json({ authUrl, scopes: FANVUE_SCOPES });
    }

    // --- EXCHANGE: trade the authorization code for access tokens ---
    if (action === "exchange") {
      const sessions = await base44.asServiceRole.entities.OAuthSession.filter(
        { state },
        "-created_date",
        1
      );
      const session = sessions[0];

      if (!session) {
        return Response.json({ error: "No matching OAuth session found" }, { status: 404 });
      }

      if (session.status === "completed") {
        return Response.json({ error: "Session already completed" }, { status: 409 });
      }

      const redirect = redirectUri || secrets.get("FANVUE_REDIRECT_URI");

      const tokens = await exchangeCodeForTokens(code, redirect, session.code_verifier);

      const encryptionKey = secrets.get("ENCRYPTION_KEY");
      const encryptedAccess = await encryptToken(tokens.access_token, encryptionKey);
      const encryptedRefresh = await encryptToken(tokens.refresh_token, encryptionKey);

      let creatorUuid: string | null = null;
      let creatorName: string | null = null;
      let creatorHandle: string | null = null;
      try {
        const me = await getMe(tokens.access_token);
        creatorUuid = me.uuid;
        creatorName = me.displayName;
        creatorHandle = me.handle;
      } catch (e) {}

      let creatorProfile: any;
      const existingCreators = creatorUuid
        ? await base44.asServiceRole.entities.CreatorProfile.filter(
            { fanvue_user_uuid: creatorUuid },
            "-created_date",
            1
          )
        : [];
      if (existingCreators[0]) {
        creatorProfile = existingCreators[0];
        await base44.asServiceRole.entities.CreatorProfile.update(creatorProfile.id, {
          display_name: creatorName || creatorProfile.display_name,
          username: creatorHandle || creatorProfile.username,
          status: "active",
        });
      } else {
        creatorProfile = await base44.asServiceRole.entities.CreatorProfile.create({
          display_name: creatorName || "Fanvue Creator",
          username: creatorHandle || "",
          fanvue_user_uuid: creatorUuid || "",
          timezone: "UTC",
          automation_mode: "off",
          status: "active",
        });
      }

      const existingConnections = await base44.asServiceRole.entities.FanvueConnection.filter(
        { creator_profile_id: creatorProfile.id },
        "-created_date",
        1
      );
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
      const scopes = tokens.scope ? tokens.scope.split(" ") : [];

      if (existingConnections[0]) {
        await base44.asServiceRole.entities.FanvueConnection.update(existingConnections[0].id, {
          external_user_uuid: creatorUuid,
          encrypted_access_token: encryptedAccess,
          encrypted_refresh_token: encryptedRefresh,
          access_token_expires_at: expiresAt,
          granted_scopes: scopes,
          status: "connected",
        });
      } else {
        await base44.asServiceRole.entities.FanvueConnection.create({
          creator_profile_id: creatorProfile.id,
          external_user_uuid: creatorUuid,
          encrypted_access_token: encryptedAccess,
          encrypted_refresh_token: encryptedRefresh,
          access_token_expires_at: expiresAt,
          granted_scopes: scopes,
          status: "connected",
        });
      }

      await base44.asServiceRole.entities.OAuthSession.update(session.id, { status: "completed" });

      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: creatorProfile.id,
        event_type: "fanvue.connected",
        status: "success",
        message: `Fanvue account connected: ${creatorName || creatorHandle || "unknown"} (scopes: ${scopes.join(", ")})`,
        metadata: { scopes, creatorUuid },
      });

      // Trigger a background sync after connection
      try {
        await base44.asServiceRole.functions.invoke("fanvue-sync", { creatorProfileId: creatorProfile.id, fullSync: false });
      } catch (e) {}

      return Response.json({
        success: true,
        creatorProfileId: creatorProfile.id,
        creatorName,
        creatorHandle,
        grantedScopes: scopes,
      });
    }

    return Response.json({ error: "Unknown action: " + action }, { status: 400 });
  } catch (error) {
    return Response.json({ error: (error as any).message }, { status: 500 });
  }
}