import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { getValidAccessToken, getChats, getMessages, getMe, sleep } from "../../shared/fanvue-api.ts";

export default async function(req) {
  let parsedBody = {};
  try {
    parsedBody = await req.json();
  } catch (e) {}

  let connection;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { creatorProfileId, fullSync, messagesOnly, maxChatsWithMessages } = parsedBody;

    // Find the FanvueConnection for this creator
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

    const creatorProfileIdFinal = connection.creator_profile_id;

    await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
      sync_status: "syncing",
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileIdFinal,
      event_type: "sync.started",
      status: "info",
      message: messagesOnly ? "Message sync started" : fullSync ? "Full sync started" : "Incremental sync started",
    });

    const accessToken = await getValidAccessToken(connection, base44);
    const me = await getMe(accessToken);
    const creatorUuid = me.uuid || me.id || me.user?.uuid;

    // Preload existing data
    const existingFans = await base44.asServiceRole.entities.Fan.filter(
      { creator_profile_id: creatorProfileIdFinal },
      "-created_date",
      5000
    );
    const fanByUuid = new Map();
    existingFans.forEach((f) => fanByUuid.set(f.external_uuid, f));

    const existingConvos = await base44.asServiceRole.entities.Conversation.filter(
      { creator_profile_id: creatorProfileIdFinal },
      "-created_date",
      5000
    );
    const convoByFanId = new Map();
    existingConvos.forEach((c) => convoByFanId.set(c.fan_id, c));

    const existingMsgs = await base44.asServiceRole.entities.Message.filter(
      { creator_profile_id: creatorProfileIdFinal },
      "-created_date",
      5000
    );
    const msgUuidSet = new Set();
    existingMsgs.forEach((m) => { if (m.external_uuid) msgUuidSet.add(m.external_uuid); });

    // === Phase 1: Sync chats -> fans + conversations (fast, no message fetching) ===
    let totalChats = 0;
    let totalMessages = 0;
    const fansToCreate = [];
    const fansToUpdate = [];
    const convosToCreate = [];
    const convosToUpdate = [];
    const chatFanUuids = []; // track order for message phase

    if (!messagesOnly) {
      // v1 chats use CURSOR pagination — walk nextCursor until exhausted.
      const allChats = [];
      let cursor = null;
      do {
        const chatsRes = await getChats(accessToken, { cursor, size: 50 });
        const chats = chatsRes.data || [];
        allChats.push(...chats);
        cursor = chatsRes.nextCursor || chatsRes.next_cursor || null;
        if (cursor) await sleep(400);
        } while (cursor);

      // Build fans from the full in-memory chat list
      for (const chat of allChats) {
        const fanUuid = chat.user?.uuid;
        if (!fanUuid) continue;

        let fan = fanByUuid.get(fanUuid);
        if (fan) {
          if (chat.user?.displayName && chat.user.displayName !== fan.display_name) {
            fansToUpdate.push({
              id: fan.id,
              display_name: chat.user.displayName,
              handle: chat.user?.handle || fan.handle,
            });
            fan.display_name = chat.user.displayName;
          }
        } else {
          fan = {
            creator_profile_id: creatorProfileIdFinal,
            external_uuid: fanUuid,
            display_name: chat.user?.displayName || chat.user?.handle || "Unknown Fan",
            handle: chat.user?.handle || "",
            subscription_status: null,
          };
          fansToCreate.push(fan);
          fanByUuid.set(fanUuid, fan);
        }
        chatFanUuids.push(fanUuid);
        totalChats++;
      }

      // Batch create + update fans
      if (fansToCreate.length > 0) {
        const created = await base44.asServiceRole.entities.Fan.bulkCreate(fansToCreate);
        created.forEach((f) => fanByUuid.set(f.external_uuid, f));
      }
      if (fansToUpdate.length > 0) {
        await base44.asServiceRole.entities.Fan.bulkUpdate(fansToUpdate);
      }

      // Build conversations from the same in-memory list (fans now have IDs — no second API walk)
      for (const chat of allChats) {
        const fanUuid = chat.user?.uuid;
        if (!fanUuid) continue;
        const fan = fanByUuid.get(fanUuid);
        if (!fan || !fan.id) continue;

        const existingConvo = convoByFanId.get(fan.id);
        if (existingConvo && existingConvo.id) {
          convosToUpdate.push({
            id: existingConvo.id,
            status: "active",
            unread_count: chat.unreadMessagesCount || 0,
            last_message_preview: chat.lastMessage?.text || existingConvo.last_message_preview,
            last_sender_type: chat.lastMessage?.senderUuid === creatorUuid ? "creator" : "fan",
          });
        } else if (!convoByFanId.has(fan.id)) {
          convosToCreate.push({
            creator_profile_id: creatorProfileIdFinal,
            fan_id: fan.id,
            external_chat_uuid: fanUuid,
            status: "active",
            unread_count: chat.unreadMessagesCount || 0,
            last_message_preview: chat.lastMessage?.text || "",
            last_sender_type: chat.lastMessage?.senderUuid === creatorUuid ? "creator" : "fan",
          });
          convoByFanId.set(fan.id, { fan_id: fan.id, _pending: true });
        }
      }

      if (convosToCreate.length > 0) {
        const createdConvos = await base44.asServiceRole.entities.Conversation.bulkCreate(convosToCreate);
        createdConvos.forEach((c) => convoByFanId.set(c.fan_id, c));
      }
      if (convosToUpdate.length > 0) {
        await base44.asServiceRole.entities.Conversation.bulkUpdate(convosToUpdate);
      }
    } else {
      // messagesOnly mode: populate chatFanUuids from existing conversations
      existingConvos.forEach((c) => {
        const fan = existingFans.find((f) => f.id === c.fan_id);
        if (fan?.external_uuid) chatFanUuids.push(fan.external_uuid);
      });
    }

    // === Phase 2: Sync messages (rate-limited, optional) ===
    if (fullSync || messagesOnly) {
      const maxMessages = maxChatsWithMessages || 20; // cap to avoid timeout
      const messagesToCreate = [];
      let processed = 0;

      for (const fanUuid of chatFanUuids) {
        if (processed >= maxMessages) break;

        const fan = fanByUuid.get(fanUuid);
        if (!fan || !fan.id) { processed++; continue; }
        const conversation = convoByFanId.get(fan.id);
        if (!conversation || !conversation.id) { processed++; continue; }

        await sleep(400);
        try {
          const msgsRes = await getMessages(accessToken, fanUuid, 50);
          const messages = msgsRes.data || [];

          for (const msg of messages) {
            if (msgUuidSet.has(msg.uuid)) continue;

            const senderType = msg.sender?.uuid === creatorUuid ? "creator" : "fan";
            messagesToCreate.push({
              creator_profile_id: creatorProfileIdFinal,
              conversation_id: conversation.id,
              external_uuid: msg.uuid,
              sender_type: senderType,
              body: msg.text || "",
              media: msg.mediaUuids || [],
              ppv_cents: msg.pricing?.USD?.price || null,
              source: "sync",
              fanvue_created_at: msg.sentAt || null,
            });
            msgUuidSet.add(msg.uuid);
            totalMessages++;
          }
        } catch (msgErr) {
          console.error(`[sync] messages failed for ${fanUuid}:`, msgErr.message);
        }
        processed++;
      }

      // Batch create messages in chunks
      if (messagesToCreate.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < messagesToCreate.length; i += chunkSize) {
          await base44.asServiceRole.entities.Message.bulkCreate(messagesToCreate.slice(i, i + chunkSize));
        }
      }
    }

    // === Phase 3: Post-sync dedup ===
    // Remove duplicate messages (same external_uuid) that may have been created
    // by concurrent webhook + sync processing. Keep the oldest, delete the rest.
    const postSyncMsgs = await base44.asServiceRole.entities.Message.filter(
      { creator_profile_id: creatorProfileIdFinal },
      "-created_date",
      5000
    );
    const uuidGroups: Record<string, any[]> = {};
    postSyncMsgs.forEach((m) => {
      if (m.external_uuid) {
        if (!uuidGroups[m.external_uuid]) uuidGroups[m.external_uuid] = [];
        uuidGroups[m.external_uuid].push(m);
      }
    });
    let dedupCount = 0;
    for (const [, group] of Object.entries(uuidGroups)) {
      if (group.length <= 1) continue;
      group.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
      for (const m of group.slice(1)) {
        try {
          await base44.asServiceRole.entities.Message.delete(m.id);
          dedupCount++;
        } catch (e) {}
      }
    }

    // Update sync status
    await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
      sync_status: "completed",
      last_sync_at: new Date().toISOString(),
    });

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileIdFinal,
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
    try {
      const base44 = createClientFromRequest(req);
      if (connection) {
        await base44.asServiceRole.entities.FanvueConnection.update(connection.id, {
          sync_status: "error",
        });
        await base44.asServiceRole.entities.ActivityLog.create({
          creator_profile_id: connection.creator_profile_id,
          event_type: "sync.error",
          status: "error",
          message: error.message,
        });
      }
    } catch (e) {}

    return Response.json({ error: error.message }, { status: 500 });
  }
}