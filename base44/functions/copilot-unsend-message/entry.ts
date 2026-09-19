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

    let msgRecord: any = null;
    if (messageId) {
      try { msgRecord = await base44.entities.Message.get(messageId); } catch (e) {}
    } else if (messageUuid && conversationId) {
      const matches = await base44.entities.Message.filter({ conversation_id: conversationId, external_uuid: messageUuid }, "-created_date", 1);
      msgRecord = matches[0];
    }
    if (!msgRecord) return Response.json({ error: "Message not found or not accessible" }, { status: 404 });
    if (conversationId && msgRecord.conversation_id !== conversationId) return Response.json({ error: "Message does not belong to this conversation" }, { status: 400 });
    if (messageUuid && msgRecord.external_uuid !== messageUuid) return Response.json({ error: "Message UUID does not match" }, { status: 400 });
    if (msgRecord.sender_type !== "creator" && msgRecord.sender_type !== "ai") return Response.json({ error: "Only creator or AI sent messages can be unsent" }, { status: 403 });
    if (!msgRecord.external_uuid) return Response.json({ error: "This message has no Fanvue ID to unsend" }, { status: 400 });
    if (msgRecord.unsend_status === "unsent") return Response.json({ success: true, alreadyUnsent: true });
    const convId = msgRecord.conversation_id;
    const msgUuid = msgRecord.external_uuid;
    const conversation = await base44.entities.Conversation.get(convId);
    if (!conversation || (msgRecord.creator_profile_id && msgRecord.creator_profile_id !== conversation.creator_profile_id)) return Response.json({ error: "Conversation not found or ownership mismatch" }, { status: 404 });

    const fan = await base44.asServiceRole.entities.Fan.get(conversation.fan_id);
    if (!fan?.external_uuid) return Response.json({ error: "Fan not found or missing external UUID" }, { status: 404 });

    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: conversation.creator_profile_id, status: "connected" }, "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected" }, { status: 400 });

    const accessToken = await getValidAccessToken(connection, base44);

    const deletion = await deleteMessage(accessToken, fan.external_uuid, msgUuid);
    if (!deletion.ok && deletion.status !== 404) {
      return Response.json({ error: "Fanvue did not unsend this message", fanvueStatus: deletion.status, detail: deletion.body }, { status: 502 });
    }
    await base44.asServiceRole.entities.Message.update(msgRecord.id, { unsend_status: "unsent", pending_unsend_at: null });

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