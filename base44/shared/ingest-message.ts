// Canonical incoming fan message ingestion — used by both fanvue-webhook
// and fanvue-sync. Guarantees: dedup by Fanvue UUID, fan upsert by
// (creator_profile_id + external_uuid), conversation upsert by
// (creator_profile_id + fan_id), idempotent message persistence,
// conversation metadata update, and AI job creation for eligible live messages.
//
// This is the SINGLE entry point for all incoming fan messages. Never scatter
// this logic across multiple paths.
import { waitUntil } from "base44:runtime";

export async function ingestIncomingFanMessage(
  base44: any,
  params: {
    creatorProfileId: string;
    fanUuid: string;
    fanDisplayName?: string;
    fanHandle?: string;
    fanAvatar?: string;
    messageUuid: string | null;
    messageText: string;
    mediaUuids?: string[];
    ppvCents?: number | null;
    sentAt: string;
    unreadCount?: number | null;
    isOutbound?: boolean;
    triggerAI?: boolean;
    source?: string;
  }
) {
  const {
    creatorProfileId,
    fanUuid,
    messageUuid,
    messageText,
    sentAt,
    isOutbound = false,
    triggerAI = true,
    source = "webhook",
  } = params;

  if (!fanUuid || !creatorProfileId) {
    return { skipped: true, reason: "MISSING_IDENTITY" };
  }

  // 1. Dedup by Fanvue message UUID — prevents double-processing from
  // webhook retries, concurrent deliveries, or sync + webhook races.
  if (messageUuid) {
    const existingMsgs = await base44.asServiceRole.entities.Message.filter(
      { external_uuid: messageUuid },
      "-created_date",
      1
    );
    if (existingMsgs[0]) {
      return { skipped: true, reason: "DUPLICATE_MESSAGE", message: existingMsgs[0] };
    }
  }

  // 2. Upsert fan by (creator_profile_id + external_uuid)
  let fan: any;
  const existingFans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId, external_uuid: fanUuid },
    "-created_date",
    1
  );
  if (existingFans[0]) {
    fan = existingFans[0];
    const patch: any = {};
    const name = params.fanDisplayName;
    if (name && name !== "Unknown Fan" && name !== fan.display_name) patch.display_name = name;
    if (params.fanHandle && params.fanHandle !== fan.handle) patch.handle = params.fanHandle;
    if (params.fanAvatar && params.fanAvatar !== fan.avatar_url) patch.avatar_url = params.fanAvatar;
    if (Object.keys(patch).length > 0) {
      await base44.asServiceRole.entities.Fan.update(fan.id, patch);
    }
  } else {
    fan = await base44.asServiceRole.entities.Fan.create({
      creator_profile_id: creatorProfileId,
      external_uuid: fanUuid,
      display_name: params.fanDisplayName || "Unknown Fan",
      handle: params.fanHandle || "",
      avatar_url: params.fanAvatar || null,
    });
  }

  // 3. Upsert conversation by (creator_profile_id + fan_id)
  let conversation: any;
  const existingConvos = await base44.asServiceRole.entities.Conversation.filter(
    { creator_profile_id: creatorProfileId, fan_id: fan.id },
    "-created_date",
    1
  );
  if (existingConvos[0]) {
    conversation = existingConvos[0];
  } else {
    conversation = await base44.asServiceRole.entities.Conversation.create({
      creator_profile_id: creatorProfileId,
      fan_id: fan.id,
      external_chat_uuid: fanUuid,
      status: "active",
    });
  }

  // 4. Persist message (idempotency already checked in step 1)
  const senderType = isOutbound ? "creator" : "fan";
  const message = await base44.asServiceRole.entities.Message.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    external_uuid: messageUuid || null,
    sender_type: senderType,
    body: messageText,
    media: params.mediaUuids || [],
    ppv_cents: params.ppvCents || null,
    source,
    fanvue_created_at: sentAt,
  });

  // 5. Update conversation metadata
  const nextUnread = isOutbound
    ? conversation.unread_count || 0
    : params.unreadCount != null
    ? params.unreadCount
    : (conversation.unread_count || 0) + 1;

  const preview = messageText || (params.mediaUuids?.length ? "[media]" : "");
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    status: "active",
    unread_count: nextUnread,
    last_message_at: sentAt,
    last_message_preview: preview,
    last_sender_type: senderType,
  });

  // 6. Log activity
  await base44.asServiceRole.entities.ActivityLog.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    event_type: isOutbound ? "message.persisted_outbound" : "message.persisted",
    status: "info",
    message: `${isOutbound ? "Creator sent" : "New message from"} ${params.fanDisplayName || "fan"}`,
    metadata: {
      messageUuid,
      hydrated: !!(params.fanDisplayName && params.fanDisplayName !== "Unknown Fan"),
    },
  });

  // 7. Trigger AI ONLY for inbound fan messages (never outbound)
  if (triggerAI && !isOutbound) {
    let job: any = null;
    try {
      // Pre-create a PENDING AI job BEFORE processing. If the webhook
      // crashes mid-processing, this pending job remains in the DB and
      // recover-ai-jobs picks it up within ~5 min.
      job = await base44.asServiceRole.entities.AIJob.create({
        creator_profile_id: creatorProfileId,
        conversation_id: conversation.id,
        trigger_message_uuid: messageUuid || message.id,
        status: "pending",
        stage: "ingested",
        job_created_at: new Date().toISOString(),
      });

      // Dispatch to a dedicated function so the webhook can acknowledge Fanvue
      // quickly. waitUntil keeps the dispatch alive after the response; the
      // persisted pending job remains the durable fallback for the watchdog.
      waitUntil(
        base44.asServiceRole.functions.invoke("process-ai-job", {
          conversationId: conversation.id,
          jobId: job.id,
          triggerMessageUuid: messageUuid || message.id,
        }).catch(async (dispatchErr: any) => {
          try {
            await base44.asServiceRole.entities.ActivityLog.create({
              creator_profile_id: creatorProfileId,
              conversation_id: conversation.id,
              event_type: "ai.dispatch.failed",
              status: "error",
              message: `AI job dispatch failed: ${dispatchErr?.message || "unknown error"}`,
              metadata: { messageUuid, jobId: job?.id },
            });
          } catch (e) {}
        })
      );
    } catch (aiErr) {
      // AI processing failed — the message is already persisted. The job
      // is marked failed by processAIJob's internal error handler. Return
      // 2xx anyway so Fanvue doesn't retry; recovery handles stale jobs.
      try {
        await base44.asServiceRole.entities.ActivityLog.create({
          creator_profile_id: creatorProfileId,
          conversation_id: conversation.id,
          event_type: "ai.processing.failed",
          status: "error",
          message: `AI processing failed: ${(aiErr as any).message}`,
          metadata: { messageUuid, jobId: job?.id },
        });
      } catch (e) {}
    }
  }

  return { skipped: false, fan, conversation, message };
}