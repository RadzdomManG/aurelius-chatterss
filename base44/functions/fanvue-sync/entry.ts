import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets } from "base44:runtime";
import { getValidAccessToken, getChats, getMessages, getMe } from "../../shared/fanvue-api.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { creatorProfileId, fullSync } = body;

    // Find the FanvueConnection for this creator
    let connection;
    if (creatorProfileId) {
      const conns = await base44.entities.FanvueConnection.filter(
        { creator_profile_id: creatorProfileId },
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

    // Update sync status
    await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
      sync_status: "syncing",
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: connection.creator_profile_id,
      event_type: "sync.started",
      status: "info",
      message: fullSync ? "Full historical sync started" : "Incremental sync started",
    });

    // Get a valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(connection, base44);

    // Get the creator's own UUID
    const me = await getMe(accessToken);
    const creatorUuid = me.uuid;

    // Sync chats (conversations + fans)
    let page = 1;
    let hasMore = true;
    let totalChats = 0;
    let totalMessages = 0;

    while (hasMore) {
      const chatsRes = await getChats(accessToken, page, 50);
      const chats = chatsRes.data || [];

      for (const chat of chats) {
        const fanUuid = chat.user?.uuid;
        if (!fanUuid) continue;

        // Find or create Fan
        let fan;
        const existingFans = await base44.asServiceRole.entities.Fan.filter(
          { creator_profile_id: connection.creator_profile_id, external_uuid: fanUuid },
          "-created_date",
          1
        );
        if (existingFans[0]) {
          fan = existingFans[0];
          if (chat.user?.displayName && chat.user.displayName !== fan.display_name) {
            await base44.asServiceRole.entities.Fan.update(fan.id, {
              display_name: chat.user.displayName,
              handle: chat.user?.handle || fan.handle,
            });
          }
        } else {
          fan = await base44.asServiceRole.entities.Fan.create({
            creator_profile_id: connection.creator_profile_id,
            external_uuid: fanUuid,
            display_name: chat.user?.displayName || chat.user?.handle || "Unknown Fan",
            handle: chat.user?.handle || "",
            subscription_status: null,
          });
        }

        // Find or create Conversation
        let conversation;
        const existingConvos = await base44.asServiceRole.entities.Conversation.filter(
          { creator_profile_id: connection.creator_profile_id, fan_id: fan.id },
          "-created_date",
          1
        );
        if (existingConvos[0]) {
          conversation = existingConvos[0];
          await base44.asServiceRole.entities.Conversation.update(conversation.id, {
            status: "active",
            unread_count: chat.unreadMessagesCount || 0,
            last_message_preview: chat.lastMessage?.text || conversation.last_message_preview,
            last_sender_type: chat.lastMessage?.senderUuid === creatorUuid ? "creator" : "fan",
          });
        } else {
          conversation = await base44.asServiceRole.entities.Conversation.create({
            creator_profile_id: connection.creator_profile_id,
            fan_id: fan.id,
            external_chat_uuid: fanUuid,
            status: "active",
            unread_count: chat.unreadMessagesCount || 0,
            last_message_preview: chat.lastMessage?.text || "",
            last_sender_type: chat.lastMessage?.senderUuid === creatorUuid ? "creator" : "fan",
          });
        }

        totalChats++;

        // Sync messages for this chat
        if (fullSync || conversation.last_message_at === null) {
          const msgsRes = await getMessages(accessToken, fanUuid, 50);
          const messages = msgsRes.data || [];

          for (const msg of messages) {
            // Check if message already exists (by external_uuid)
            const existingMsgs = await base44.asServiceRole.entities.Message.filter(
              { external_uuid: msg.uuid },
              "-created_date",
              1
            );
            if (existingMsgs[0]) continue;

            const senderType = msg.sender?.uuid === creatorUuid ? "creator" : "fan";

            await base44.asServiceRole.entities.Message.create({
              creator_profile_id: connection.creator_profile_id,
              conversation_id: conversation.id,
              external_uuid: msg.uuid,
              sender_type: senderType,
              body: msg.text || "",
              media: msg.mediaUuids || [],
              ppv_cents: msg.pricing?.USD?.price || null,
              source: "sync",
              fanvue_created_at: msg.sentAt || null,
            });

            totalMessages++;
          }

          // Update conversation last_message_at
          if (messages.length > 0) {
            const latestMsg = messages[0];
            await base44.asServiceRole.entities.Conversation.update(conversation.id, {
              last_message_at: latestMsg.sentAt || new Date().toISOString(),
              last_message_preview: latestMsg.text || conversation.last_message_preview,
              last_sender_type: latestMsg.sender?.uuid === creatorUuid ? "creator" : "fan",
            });
          }
        }
      }

      hasMore = chatsRes.pagination?.hasMore || false;
      page++;
    }

    // Update sync status to completed
    await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
      sync_status: "completed",
      last_sync_at: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: connection.creator_profile_id,
      event_type: "sync.completed",
      status: "success",
      message: `Sync completed: ${totalChats} chats, ${totalMessages} new messages`,
      metadata: { totalChats, totalMessages },
    });

    return Response.json({
      success: true,
      totalChats,
      totalMessages,
    });
  } catch (error) {
    // Mark sync as errored
    try {
      const base44 = createClientFromRequest(req);
      const body = await req.json().catch(() => ({}));
      if (body.creatorProfileId) {
        const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
          { creator_profile_id: body.creatorProfileId },
          "-created_date",
          1
        );
        if (conns[0]) {
          await base44.asServiceRole.entities.FanvueConnection.update(conns[0].id, {
            sync_status: "error",
          });
        }
      }
      await base44.asServiceRole.entities.ActivityLog.create({
        creator_profile_id: body.creatorProfileId,
        event_type: "sync.error",
        status: "error",
        message: error.message,
      });
    } catch (e) {}

    return Response.json({ error: error.message }, { status: 500 });
  }
}