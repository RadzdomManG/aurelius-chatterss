import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getValidAccessToken, getChatForFan, sleep } from "../../shared/fanvue-api.ts";

/**
 * Backfill / repair: finds Fan records with placeholder identity
 * ("Unknown Fan" display name or empty handle) and hydrates their real
 * displayName / handle / avatarUrl from the Fanvue chats API
 * (GET /chats?userUuids=<uuid>). Respects rate limits with a small sleep
 * between calls. Does not fabricate identities when Fanvue returns none.
 */
export default async function (req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { creatorProfileId, dryRun } = parsedBody;

    // Find the connected FanvueConnection for this creator
    const conns = await base44.entities.FanvueConnection.filter(
      creatorProfileId
        ? { creator_profile_id: creatorProfileId, status: "connected" }
        : { status: "connected" },
      "-created_date",
      1
    );
    const connection = conns[0];
    if (!connection) {
      return Response.json({ error: "No connected Fanvue account found" }, { status: 404 });
    }

    const creatorProfileIdFinal = connection.creator_profile_id;
    const accessToken = await getValidAccessToken(connection, base44);

    // Find fans with placeholder identity
    const allFans = await base44.asServiceRole.entities.Fan.filter(
      { creator_profile_id: creatorProfileIdFinal },
      "-created_date",
      500
    );
    const unknownFans = allFans.filter(
      (f) =>
        !f.display_name ||
        f.display_name === "Unknown Fan" ||
        f.display_name === "Unknown" ||
        !f.handle
    );

    if (dryRun) {
      return Response.json({
        dryRun: true,
        totalFans: allFans.length,
        unknownCount: unknownFans.length,
        unknownFanUuids: unknownFans.map((f) => f.external_uuid),
      });
    }

    let resolved = 0;
    let stillUnknown = 0;
    const resolvedDetails = [];

    for (const fan of unknownFans) {
      if (!fan.external_uuid) {
        stillUnknown++;
        continue;
      }
      // Respect Fanvue rate limits (200 req/min). ~1 call per fan.
      await sleep(350);
      try {
        const userIdentity = await getChatForFan(accessToken, fan.external_uuid);
        if (userIdentity && (userIdentity.displayName || userIdentity.handle)) {
          const update = {
            display_name: userIdentity.displayName || userIdentity.handle || fan.display_name,
            handle: userIdentity.handle || fan.handle || "",
          };
          if (userIdentity.avatarUrl) update.avatar_url = userIdentity.avatarUrl;
          await base44.asServiceRole.entities.Fan.update(fan.id, update);
          resolved++;
          resolvedDetails.push({
            uuid: fan.external_uuid,
            display_name: update.display_name,
            handle: update.handle,
          });
        } else {
          stillUnknown++;
        }
      } catch (err) {
        console.error(`[hydrate] failed for ${fan.external_uuid}:`, err.message);
        stillUnknown++;
      }
    }

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileIdFinal,
      event_type: "identity.hydrate",
      status: "success",
      message: `Identity backfill: ${resolved} resolved, ${stillUnknown} still unknown (of ${unknownFans.length})`,
      metadata: { resolved, stillUnknown, unknownCount: unknownFans.length },
    });

    return Response.json({
      success: true,
      totalFans: allFans.length,
      unknownCount: unknownFans.length,
      resolved,
      stillUnknown,
      resolvedDetails,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}