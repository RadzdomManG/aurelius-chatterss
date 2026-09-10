import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { secrets, waitUntil } from "base44:runtime";

const TOLERANCE_SECONDS = 300;

async function verifySignature(rawBody, signatureHeader, secret) {
  let timestamp, signature;
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.substring(0, idx);
    const value = part.substring(idx + 1);
    if (key === "t") timestamp = value;
    if (key === "v0") signature = value;
  }
  if (!timestamp || !signature) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > TOLERANCE_SECONDS) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

async function processMessageReceived(base44, event) {
  const msg = event.data || event.message || event;
  const msgUuid = msg.uuid || msg.messageUuid;
  const msgText = msg.text || msg.body || "";
  const sentAt = msg.sentAt || msg.createdAt || new Date().toISOString();
  const sender = msg.sender || {};
  const recipient = msg.recipient || {};
  const senderUuid = sender.uuid || msg.senderUuid;
  const senderHandle = sender.handle || "";
  const senderName = sender.displayName || sender.handle || "Unknown Fan";
  const recipientUuid = recipient.uuid || msg.recipientUuid;
  const msgType = msg.type || "SINGLE_RECIPIENT";
  const pricing = msg.pricing;
  const ppvCents = pricing?.USD?.price || null;

  if (!senderUuid || !recipientUuid) return;

  // Find the creator's FanvueConnection by the recipient UUID
  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { external_user_uuid: recipientUuid, status: "connected" },
    "-created_date",
    1
  );
  const connection = connections[0];
  if (!connection) return;

  const creatorProfileId = connection.creator_profile_id;

  // Find or create Fan
  let fan;
  const existingFans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId, external_uuid: senderUuid },
    "-created_date",
    1
  );
  if (existingFans[0]) {
    fan = existingFans[0];
    if (senderName !== fan.display_name || senderHandle !== fan.handle) {
      await base44.asServiceRole.entities.Fan.update(fan.id, {
        display_name: senderName,
        handle: senderHandle,
      });
    }
  } else {
    fan = await base44.asServiceRole.entities.Fan.create({
      creator_profile_id: creatorProfileId,
      external_uuid: senderUuid,
      display_name: senderName,
      handle: senderHandle,
    });
  }

  // Find or create Conversation
  let conversation;
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
      external_chat_uuid: senderUuid,
      status: "active",
    });
  }

  // Check for duplicate message (idempotency by external_uuid)
  if (msgUuid) {
    const existingMsgs = await base44.asServiceRole.entities.Message.filter(
      { external_uuid: msgUuid },
      "-created_date",
      1
    );
    if (existingMsgs[0]) return; // Already processed
  }

  // Create the Message
  await base44.asServiceRole.entities.Message.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    external_uuid: msgUuid || null,
    sender_type: "fan",
    body: msgText,
    media: msg.mediaUuids || [],
    ppv_cents: ppvCents,
    source: "webhook",
    fanvue_created_at: sentAt,
  });

  // Update conversation
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    status: "active",
    unread_count: (conversation.unread_count || 0) + 1,
    last_message_at: sentAt,
    last_message_preview: msgText || "[media]",
    last_sender_type: "fan",
  });

  // Create an AIJob to trigger draft generation (client-side useAIProcessor will pick it up)
  await base44.asServiceRole.entities.AIJob.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    trigger_message_uuid: msgUuid || null,
    status: "pending",
  });

  // Log activity
  await base44.asServiceRole.entities.ActivityLog.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    event_type: "fan.message.received",
    status: "info",
    message: `New message from ${senderName}`,
    metadata: { messageUuid: msgUuid },
  });
}

export default async function(req) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("X-Fanvue-Signature");
    const webhookSecret = secrets.get("FANVUE_WEBHOOK_SECRET");

    if (!signatureHeader) {
      return Response.json({ error: "Missing signature header" }, { status: 401 });
    }
    if (!webhookSecret) {
      return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    const valid = await verifySignature(rawBody, signatureHeader, webhookSecret);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event || event.type;

    if (eventType === "message.received") {
      const base44 = createClientFromRequest(req);
      waitUntil(processMessageReceived(base44, event));
    }

    // Log webhook receipt
    const base44 = createClientFromRequest(req);
    waitUntil(
      base44.asServiceRole.entities.ActivityLog.create({
        event_type: "webhook.received",
        status: "info",
        message: `Webhook received: ${eventType || "unknown"}`,
      })
    );

    return Response.json({ received: true, eventType });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}