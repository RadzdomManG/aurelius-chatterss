import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, getMedia } from "../../shared/fanvue-api.ts";

// fanvue-media — fetches media with variants=thumbnail,main so cards get
// usable thumbnail URLs. Uses cursor pagination (v1 experimental endpoint).
export default async function (req: Request): Promise<Response> {
  let parsedBody: any = {};
  try {
    const text = await req.text();
    if (text) parsedBody = JSON.parse(text);
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { creatorProfileId, cursor, folderName, size } = parsedBody;

    let connection: any;
    if (creatorProfileId) {
      const conns = await base44.entities.FanvueConnection.filter(
        { creator_profile_id: creatorProfileId, status: "connected" },
        "-created_date",
        1
      );
      connection = conns[0];
    } else {
      const conns = await base44.entities.FanvueConnection.filter({ status: "connected" }, "-created_date", 1);
      connection = conns[0];
    }

    if (!connection) {
      return Response.json({ error: "No connected Fanvue account found" }, { status: 404 });
    }

    // Scope check
    const granted = connection.granted_scopes || [];
    if (!granted.includes("read:media")) {
      return Response.json({
        error: "Insufficient scopes — reconnect Fanvue to grant read:media access. Go to Models → Fanvue → Reconnect.",
        needsReconnect: true,
        code: "MISSING_SCOPE",
        missing: ["read:media"],
      }, { status: 403 });
    }

    const accessToken = await getValidAccessToken(connection, base44);

    // Fetch media with variants — the critical parameter for thumbnail URLs
    const mediaRes = await getMedia(accessToken, {
      cursor: cursor || null,
      folderName: folderName || null,
      size: size || 50,
    });

    return Response.json({
      success: true,
      data: mediaRes.data || [],
      nextCursor: mediaRes.nextCursor || null,
    });
  } catch (error) {
    const msg = (error as any).message || "";
    if (msg.includes("403") || msg.toLowerCase().includes("insufficient scopes") || msg.includes("age_verification")) {
      return Response.json({
        error: msg.includes("age_verification")
          ? "Age verification required for media access"
          : "Insufficient scopes — reconnect Fanvue to grant read:media access. Go to Models → Fanvue → Reconnect.",
        needsReconnect: !msg.includes("age_verification"),
        ageVerification: msg.includes("age_verification"),
      }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}