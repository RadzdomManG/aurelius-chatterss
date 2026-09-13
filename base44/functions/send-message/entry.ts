import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { secrets } from "base44:runtime";
import { getValidAccessToken, sendFanvueMessage } from "../../shared/fanvue-api.ts";

export default async function(req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { conversationId, body: messageBody, ppvCents, mediaUuids, mediaPreviewUuid, messageId } = parsedBody;

    if (!conversationId || (!messageBody && !mediaUuids?.length)) {
      return Response.json({ error: "conversationId and either body or mediaUuids are required" }, { status: 400 });
    }

    // Get the conversation
    const conversation = await base44.entities.Conversation.get(conversationId);
    if (!conversation) {
      return Response.json({ error: "Conversation not found" }, { status: 404 });
    }

    // Get the Fan to find the external UUID
    const fan = await base44.entities.Fan.get(conversation.fan_id);
    if (!fan || !fan.external_uuid) {
      return Response.json({ error: "Fan not found or missing external UUID" }, { status: 404 });
    }

    // Get the FanvueConnection
    const conns = await base44.entities.FanvueConnection.filter(
      { creator_profile_id: conversation.creator_profile_id },
      "-created_date",
      1
    );
    const connection = conns[0];
    if (!connection || connection.status !== "connected") {
      return Response.json({ error: "Fanvue account not connected" }, { status: 400 });
    }

    // Get a valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(connection, base44);

    // Send the message via Fanvue API (optionally with locked media + price)
    // Supports MULTIPLE media items — all are locked behind the PPV paywall.
    // FULL-LOCK PPV: only forward an EXPLICIT mediaPreviewUuid from the caller.
    // Never default to mediaUuids[0] — that would unlock the first image for free.
    const media = (mediaUuids && mediaUuids.length > 0)
      ? { mediaUuids, ...(mediaPreviewUuid ? { mediaPreviewUuid } : {}) }
      : null;
    const result = await sendFanvueMessage(
      accessToken,
      fan.external_uuid,
      messageBody || null,
      ppvCents || null,
      media
    );

    // Update the stored message with the external UUID + mark it sent.
    // Patch the EXACT record the caller created (by messageId) instead of
    // matching by body text — body-matching collided with duplicates and
    // empty bodies and produced wrong-record patches.
    if (messageId) {
      try {
        await base44.asServiceRole.entities.Message.update(messageId, {
          ...(result.messageUuid ? { external_uuid: result.messageUuid } : {}),
          send_status: "sent",
        });
      } catch (e) {}
    }

    // Log activity
    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: conversation.creator_profile_id,
      conversation_id: conversationId,
      event_type: "message.sent.fanvue",
      status: "success",
      message: "Message sent to Fanvue",
      metadata: { messageUuid: result.messageUuid, ppvCents, mediaUuids: mediaUuids || null },
    });

    return Response.json({
      success: true,
      messageUuid: result.messageUuid,
    });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      await base44.asServiceRole.entities.ActivityLog.create({
        conversation_id: parsedBody.conversationId,
        event_type: "fanvue.send.error",
        status: "error",
        message: error.message,
      });
    } catch (e) {}

    return Response.json({ error: error.message }, { status: 500 });
  }
}