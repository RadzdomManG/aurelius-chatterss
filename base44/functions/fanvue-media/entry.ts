import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getValidAccessToken, getMedia } from "../../shared/fanvue-api.ts";

export default async function(req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { creatorProfileId, page, size } = parsedBody;

    // Find the connection
    let connection;
    if (creatorProfileId) {
      const conns = await base44.entities.FanvueConnection.filter(
        { creator_profile_id: creatorProfileId, status: "connected" },
        "-created_date",
        1
      );
      connection = conns[0];
    } else {
      const conns = await base44.entities.FanvueConnection.filter(
        { status: "connected" },
        "-created_date",
        1
      );
      connection = conns[0];
    }

    if (!connection) {
      return Response.json({ error: "No connected Fanvue account found" }, { status: 404 });
    }

    const accessToken = await getValidAccessToken(connection, base44);

    // Fetch media from Fanvue API
    const mediaRes = await getMedia(accessToken, page || 1, size || 50);

    return Response.json({
      success: true,
      data: mediaRes.data || [],
      pagination: mediaRes.pagination || null,
    });
  } catch (error) {
    // Detect insufficient scopes and give a clear reconnect instruction
    const msg = error.message || "";
    if (msg.includes("403") || msg.toLowerCase().includes("insufficient scopes")) {
      return Response.json({
        error: "Insufficient scopes — reconnect Fanvue to grant read:media access. Go to Models → Fanvue → Reconnect.",
        needsReconnect: true,
      }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}