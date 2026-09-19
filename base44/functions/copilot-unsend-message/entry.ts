// copilot-unsend-message — agent tool that deletes (unsends) a message on Fanvue.
// Resolves the fan UUID from the conversation, calls the Fanvue deleteMessage
// endpoint, and updates the local Message record to reflect the unsend.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, deleteMessage } from "../../shared/fanvue-api.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { conversationId, messageId, messageUuid } = body;
    if (!messageUuid && !messageId) {
      return Response.json({ error: "messageId or messageUuid is required" }, { status: 400 });
    }

    // Resolve the message record if only messageId was given
    let msgRecord: any = null;
    if (messageId) {
      try { msgRecord = await base44.asServiceRole.entities.Message.get(messageId); } catch (e) {}
    }
    let msgUuid = messageUuid || msgRecord?.external_uuid;
    let convId = conversationId || msgRecord?.conversation_id;

    if (!msgUuid) return Response.json({ error: "Could not resolve the Fanvue message UUID" }, { status: 400 });
    if (!convId) return Response.json({ error: "conversationId is required (or pass messageId)" }, { status: 400 });

    const conversation = await base44.asServiceRole.entities.Conversation.get(convId);
    if (!conversation) return Response.json({ error: "Conversation not found" }, { status: 404 });

    const fan = await base44.asServiceRole.entities.Fan.get(conversation.fan_id);
    if (!fan?.external_uuid) return Response.json({ error: "Fan not found or missing external UUID" }, { status: 404 });

    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: conversation.creator_profile_id, status: "connected" }, "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected" }, { status: 400 });

    const accessToken = await getValidAccessToken(connection, base44);

    // Delete the message on Fanvue
    await apiCall(
      `/v1/chats/${encodeURIComponent(fan.external_uuid)}/messages/${encodeURIComponent(msgUuid)}`,
      accessToken,
      { method: "DELETE" }
    );

    // Update the local message record
    const localId = messageId || msgRecord?.id;
    if (localId) {
      try {
        await base44.asServiceRole.entities.Message.update(localId, { unsend_status: "unsent", send_status: "failed" });
      } catch (e) {}
    } else {
      const msgs = await base44.asServiceRole.entities.Message.filter({ external_uuid: msgUuid }, "-created_date", 1);
      if (msgs[0]) {
        await base44.asServiceRole.entities.Message.update(msgs[0].id, { unsend_status: "unsent", send_status: "failed" });
      }
    }

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: conversation.creator_profile_id,
      conversation_id: convId,
      event_type: "copilot.unsend_message",
      status: "success",
      message: `Copilot unsent a message from ${fan.display_name || "fan"}`,
      metadata: { messageUuid: msgUuid, conversationId: convId },
    });

    return Response.json({ success: true, messageUuid: msgUuid });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}