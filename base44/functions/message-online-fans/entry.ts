// message-online-fans — agent tool that sends a direct message to every fan
// currently online for the active creator. Uses the Fanvue getOnlineSubscribers
// endpoint for the real-time online list, then sends a persona-styled DM to
// each via sendFanvueMessage. Respects per-fan automation_paused and a 12-hour
// cooldown (reuses the presence-greet last_presence_greet_at field) so a fan
// is never spammed.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, apiCall, sendFanvueMessage } from "../../shared/fanvue-api.ts";

const COOLDOWN_MS = 12 * 60 * 60 * 1000; // 12 hours

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, message, priceCents, mediaUuids } = body;
    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
    if (!message && !mediaUuids?.length) {
      return Response.json({ error: "message or mediaUuids is required" }, { status: 400 });
    }

    // Resolve the connection + creator
    const [conns, creators] = await Promise.all([
      base44.asServiceRole.entities.FanvueConnection.filter(
        { creator_profile_id: creatorProfileId, status: "connected" },
        "-created_date", 1
      ),
      base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1),
    ]);
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected for this creator" }, { status: 400 });
    const creator = creators[0];

    const accessToken = await getValidAccessToken(connection, base44);

    // Determine the creator's user UUID for the online-subscribers endpoint.
    const creatorUserUuid = connection.external_user_uuid || creator?.fanvue_user_uuid;
    if (!creatorUserUuid) {
      return Response.json({ error: "Creator user UUID not found — cannot query online fans" }, { status: 400 });
    }

    // Fetch online subscribers from Fanvue (real-time source)
    let onlineFanUuids: string[] = [];
    try {
      const res = await apiCall(
        `/v1/creators/${encodeURIComponent(creatorUserUuid)}/subscribers/online`,
        accessToken
      );
      const items = res?.data || res || [];
      if (Array.isArray(items)) {
        onlineFanUuids = items.map((u: any) => u.uuid || u.userUuid || u.id).filter(Boolean);
      }
    } catch (e: any) {
      return Response.json({ error: `Failed to fetch online fans: ${e.message}` }, { status: 502 });
    }

    if (onlineFanUuids.length === 0) {
      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: creatorProfileId,
        event_type: "copilot.message_online_fans",
        status: "info",
        message: "Copilot: no fans currently online",
        metadata: { onlineCount: 0 },
      });
      return Response.json({ success: true, onlineCount: 0, messagedCount: 0, skippedCount: 0, results: [] });
    }

    // Load local Fan records to check automation_paused + cooldown
    const fans = await base44.asServiceRole.entities.Fan.filter(
      { creator_profile_id: creatorProfileId },
      "-created_date", 500
    );
    const fanByUuid = new Map(fans.map((f: any) => [f.external_uuid, f]));

    const media = (mediaUuids && mediaUuids.length > 0) ? { mediaUuids } : null;
    let messagedCount = 0;
    let skippedCount = 0;
    const results: any[] = [];
    const now = Date.now();

    for (const fanUuid of onlineFanUuids) {
      const fan = fanByUuid.get(fanUuid);
      // Respect per-fan automation pause
      if (fan?.automation_paused) {
        skippedCount++;
        results.push({ fanUuid, skipped: "automation_paused" });
        continue;
      }
      // Respect 12h cooldown via last_presence_greet_at
      if (fan?.last_presence_greet_at) {
        const lastGreet = new Date(fan.last_presence_greet_at).getTime();
        if (now - lastGreet < COOLDOWN_MS) {
          skippedCount++;
          results.push({ fanUuid, skipped: "cooldown" });
          continue;
        }
      }
      try {
        const sent = await sendFanvueMessage(accessToken, fanUuid, message || null, priceCents || null, media);
        const messageUuid = sent?.messageUuid || sent?.uuid || sent?.data?.uuid || sent?.message?.uuid || null;
        if (fan?.id) {
          try {
          const conversations = await base44.asServiceRole.entities.Conversation.filter({ creator_profile_id: creatorProfileId, fan_id: fan.id }, "-created_date", 1);
          if (conversations[0]) {
            await base44.asServiceRole.entities.Message.create({
              organization_id: creator?.organization_id,
              creator_profile_id: creatorProfileId,
              conversation_id: conversations[0].id,
              external_uuid: messageUuid,
              sender_type: "creator",
              source: "ai",
              body: message || "",
              media: mediaUuids || [],
              ppv_cents: priceCents || null,
              send_status: "sent",
            });
          }
          } catch (logError) { console.error("[message-online-fans] sent message could not be recorded", logError); }
        }
        messagedCount++;
        results.push({ fanUuid, sent: true, messageUuid });
        // Update the cooldown timestamp on the local fan record
        if (fan?.id) {
          try {
            await base44.asServiceRole.entities.Fan.update(fan.id, { last_presence_greet_at: new Date().toISOString() });
          } catch (e) {}
        }
      } catch (e: any) {
        skippedCount++;
        results.push({ fanUuid, error: e.message });
      }
    }

    // Log
    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.message_online_fans",
      status: "success",
      message: `Copilot messaged ${messagedCount} online fan(s) (${skippedCount} skipped, ${onlineFanUuids.length} online)${priceCents ? ` at $${(priceCents / 100).toFixed(2)}` : ""}`,
      metadata: { onlineCount: onlineFanUuids.length, messagedCount, skippedCount, priceCents },
    });

    return Response.json({
      success: true,
      onlineCount: onlineFanUuids.length,
      messagedCount,
      skippedCount,
      results,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}