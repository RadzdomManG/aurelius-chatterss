// fanvue-webhook — handles ALL current Creator events.
// Primary: creator.message.received (fan → creator), creator.message.sent (creator → fan).
// Also: creator.message.deleted, creator.message.read, creator.message.reaction.
// Business: creator.follow.created, creator.subscription.*, creator.payment.succeeded, etc.
//
// Idempotency: dedupes by Fanvue message UUID (persisted check).
// Returns 2xx FAST — AI processing runs async via waitUntil.
// Signature: X-Fanvue-Signature (HMAC-SHA256, t=... v0=... format).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { secrets, waitUntil } from "base44:runtime";
import { processAIJob } from "../../shared/ai-processor.ts";
import { getValidAccessToken, getChatForFan } from "../../shared/fanvue-api.ts";

const TOLERANCE_SECONDS = 300;

const INBOUND_EVENTS = new Set(["message.received", "creator.message.received"]);
const OUTBOUND_EVENTS = new Set(["message.sent", "creator.message.sent"]);
const DELETE_EVENTS = new Set(["creator.message.deleted", "message.deleted"]);
const READ_EVENTS = new Set(["creator.message.read", "creator.message.read_by_fan", "message.read"]);

function getHeader(req: any, name: string): string | null {
  try {
    const direct = req.headers?.get?.(name);
    if (direct) return direct;
  } catch (e) {}
  try {
    const entries = Array.from(req.headers.entries?.() || []);
    const found = entries.find(([k]) => k.toLowerCase() === name.toLowerCase());
    if (found) return found[1];
  } catch (e) {}
  try {
    const h = req.headers || {};
    const keys = Object.keys(h);
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found) return h[found];
  } catch (e) {}
  return null;
}

async function verifySignature(rawBody: string, signatureHeader: string, secret: string) {
  let timestamp: string | undefined, signature: string | undefined;
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.substring(0, idx);
    const value = part.substring(idx + 1);
    if (key === "t") timestamp = value;
    if (key === "v0") signature = value;
  }
  if (!timestamp || !signature) return { ok: false, reason: "no t or v0 in header" };

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale timestamp" };
  }

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

  if (expected.length !== signature.length) return { ok: false, reason: "length mismatch" };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0 ? { ok: true } : { ok: false, reason: "hmac mismatch" };
}

function detectEventType(req: any, parsed: any): string {
  const topic = getHeader(req, "X-Fanvue-Topic");
  if (topic) return topic;
  if (parsed) {
    if (parsed.type) return parsed.type;
    if (parsed.event) return parsed.event;
  }
  return "unknown";
}

/**
 * Normalize a message event into a common shape. Handles BOTH:
 *   - creator.* envelope (snake_case: data.uuid, data.fan.uuid, data.text, ...)
 *   - legacy flat (camelCase: messageUuid, sender.uuid, message.text, ...)
 * Sets isOutbound for creator.message.sent events.
 */
function normalizeMessageEvent(parsed: any, eventType: string) {
  const isNew = eventType.startsWith("creator.");
  if (isNew) {
    const data = parsed.data || {};
    const fan = data.fan || {};
    const creator = data.creator || {};
    const isOutbound = eventType === "creator.message.sent" || data.sender === "creator";
    return {
      msgUuid: data.uuid || null,
      msgText: data.text || "",
      sentAt: data.created_at || parsed.timestamp || new Date().toISOString(),
      senderUuid: fan.uuid || null,
      senderName: fan.display_name || "",
      senderHandle: fan.handle || "",
      senderAvatar: fan.avatar_url || "",
      recipientUuid: creator.uuid || null,
      mediaUuids: data.media_uuids || [],
      ppvCents: data.price != null ? data.price : null,
      unreadCount: data.unread_messages_count != null ? data.unread_messages_count : null,
      isOutbound,
    };
  }

  // Legacy flat format
  const msg = parsed.message || {};
  const sender = parsed.sender || {};
  const senderAvatar = sender.avatarUrl || (sender.avatarUri && sender.avatarUri.url) || "";
  const isOutbound = eventType === "message.sent" || parsed.senderType === "creator";
  return {
    msgUuid: parsed.messageUuid || msg.uuid || null,
    msgText: msg.text || parsed.text || "",
    sentAt: msg.createdAt || parsed.timestamp || parsed.createdAt || new Date().toISOString(),
    senderUuid: sender.uuid || null,
    senderName: sender.displayName || "",
    senderHandle: sender.handle || "",
    senderAvatar: senderAvatar,
    recipientUuid: parsed.recipientUuid || null,
    mediaUuids: msg.mediaUuids || parsed.mediaUuids || [],
    ppvCents: msg.price != null ? msg.price : (parsed.price != null ? parsed.price : null),
    unreadCount: parsed.unreadMessagesCount != null ? parsed.unreadMessagesCount : null,
    isOutbound,
  };
}

async function hydrateIdentityIfNeeded(base44: any, connection: any, normalized: any) {
  if (normalized.senderName || normalized.senderHandle) return;
  if (!normalized.senderUuid) return;
  try {
    const accessToken = await getValidAccessToken(connection, base44);
    const user = await getChatForFan(accessToken, normalized.senderUuid);
    if (user) {
      normalized.senderName = user.displayName || user.handle || "";
      normalized.senderHandle = user.handle || "";
      normalized.senderAvatar = user.avatar_url || user.avatarUrl || normalized.senderAvatar || "";
    }
  } catch (err) {
    console.error("[webhook] identity hydration failed:", (err as any).message);
  }
}

async function processMessageReceived(base44: any, event: any, eventType: string) {
  const normalized = normalizeMessageEvent(event, eventType);
  if (!normalized) return;
  const { msgUuid, msgText, sentAt, senderUuid, mediaUuids, ppvCents, unreadCount, isOutbound } = normalized;
  if (!senderUuid || !normalized.recipientUuid) return;

  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { external_user_uuid: normalized.recipientUuid, status: "connected" },
    "-created_date",
    1
  );
  const connection = connections[0];
  if (!connection) return;

  const creatorProfileId = connection.creator_profile_id;

  // For inbound messages, hydrate identity if missing
  if (!isOutbound) {
    await hydrateIdentityIfNeeded(base44, connection, normalized);
  }

  const senderName = normalized.senderName || "Unknown Fan";
  const senderHandle = normalized.senderHandle || "";
  const senderAvatar = normalized.senderAvatar || "";

  // Upsert fan
  let fan: any;
  const existingFans = await base44.asServiceRole.entities.Fan.filter(
    { creator_profile_id: creatorProfileId, external_uuid: senderUuid },
    "-created_date",
    1
  );
  if (existingFans[0]) {
    fan = existingFans[0];
    const patch: any = {};
    if (senderName && senderName !== "Unknown Fan" && senderName !== fan.display_name) patch.display_name = senderName;
    if (senderHandle && senderHandle !== fan.handle) patch.handle = senderHandle;
    if (senderAvatar && senderAvatar !== fan.avatar_url) patch.avatar_url = senderAvatar;
    if (Object.keys(patch).length > 0) await base44.asServiceRole.entities.Fan.update(fan.id, patch);
  } else {
    fan = await base44.asServiceRole.entities.Fan.create({
      creator_profile_id: creatorProfileId,
      external_uuid: senderUuid,
      display_name: senderName,
      handle: senderHandle,
      avatar_url: senderAvatar || null,
    });
  }

  // Upsert conversation (one per creator + fan UUID)
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
      external_chat_uuid: senderUuid,
      status: "active",
    });
  }

  // Dedup by Fanvue message UUID — prevents double-processing from retries,
  // concurrent deliveries, or sync + webhook races.
  if (msgUuid) {
    const existingMsgs = await base44.asServiceRole.entities.Message.filter(
      { external_uuid: msgUuid },
      "-created_date",
      1
    );
    if (existingMsgs[0]) return;
  }

  const senderType = isOutbound ? "creator" : "fan";
  await base44.asServiceRole.entities.Message.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    external_uuid: msgUuid || null,
    sender_type: senderType,
    body: msgText,
    media: mediaUuids,
    ppv_cents: ppvCents,
    source: "webhook",
    fanvue_created_at: sentAt,
  });

  // Update conversation metadata
  const nextUnread = isOutbound ? (conversation.unread_count || 0) : (unreadCount != null ? unreadCount : (conversation.unread_count || 0) + 1);
  await base44.asServiceRole.entities.Conversation.update(conversation.id, {
    status: "active",
    unread_count: nextUnread,
    last_message_at: sentAt,
    last_message_preview: msgText || (mediaUuids.length ? "[media]" : ""),
    last_sender_type: senderType,
  });

  await base44.asServiceRole.entities.ActivityLog.create({
    creator_profile_id: creatorProfileId,
    conversation_id: conversation.id,
    event_type: isOutbound ? "message.persisted_outbound" : "message.persisted",
    status: "info",
    message: `${isOutbound ? "Creator sent" : "New message from"} ${senderName}`,
    metadata: { messageUuid: msgUuid, event: eventType, hydrated: !!(senderName && senderName !== "Unknown Fan") },
  });

  // ONLY trigger AI for inbound fan messages — never for outbound creator messages
  if (!isOutbound) {
    try {
      waitUntil(processAIJob(base44, conversation.id, null, msgUuid));
    } catch (aiErr) {
      console.error("[webhook] AI enqueue failed:", (aiErr as any).message);
    }
  }
}

async function processMessageDeleted(base44: any, event: any) {
  const data = event.data || event;
  const msgUuid = data.uuid || data.messageUuid;
  if (!msgUuid) return;
  try {
    const msgs = await base44.asServiceRole.entities.Message.filter({ external_uuid: msgUuid }, "-created_date", 1);
    if (msgs[0]) await base44.asServiceRole.entities.Message.delete(msgs[0].id);
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "message.deleted",
      status: "info",
      message: `Message deleted: ${msgUuid}`,
    });
  } catch (e) {}
}

async function processMessageRead(base44: any, event: any) {
  const data = event.data || event;
  const fanUuid = data.fan?.uuid || data.userUuid;
  if (!fanUuid) return;
  try {
    const fans = await base44.asServiceRole.entities.Fan.filter({ external_uuid: fanUuid }, "-created_date", 1);
    if (!fans[0]) return;
    const convos = await base44.asServiceRole.entities.Conversation.filter({ fan_id: fans[0].id }, "-created_date", 1);
    if (convos[0]) {
      await base44.asServiceRole.entities.Conversation.update(convos[0].id, { unread_count: 0 });
    }
  } catch (e) {}
}

export default async function (req: Request): Promise<Response> {
  const rawBody = await req.text();
  const signatureHeader = getHeader(req, "X-Fanvue-Signature");
  const topicHeader = getHeader(req, "X-Fanvue-Topic");

  let parsed: any = null;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {}
  const eventTypeHint = topicHeader || (parsed && (parsed.type || parsed.event)) || "unknown";

  // Log webhook receipt for diagnostics (async, non-blocking)
  try {
    const diagBase44 = createClientFromRequest(req);
    waitUntil(
      diagBase44.asServiceRole.entities.ActivityLog.create({
        event_type: "webhook.request",
        status: signatureHeader ? "info" : "warning",
        message: `Webhook ${eventTypeHint} — sig:${signatureHeader ? "present" : "MISSING"} body:${rawBody.length}b`,
        metadata: {
          eventType: eventTypeHint,
          topicHeader: topicHeader || null,
          signaturePresent: !!signatureHeader,
          bodyLength: rawBody.length,
          bodyPreview: rawBody.slice(0, 500),
        },
      })
    );
  } catch (e) {}

  if (!signatureHeader) {
    return Response.json({ received: true, verified: false, reason: "no signature header" });
  }
  const webhookSecret = secrets.get("FANVUE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const verification = await verifySignature(rawBody, signatureHeader, webhookSecret);
  if (!verification.ok) {
    try {
      const errBase44 = createClientFromRequest(req);
      waitUntil(
        errBase44.asServiceRole.entities.ActivityLog.create({
          event_type: "webhook.signature_failed",
          status: "error",
          message: `Signature verification failed: ${verification.reason}`,
          metadata: { eventType: eventTypeHint },
        })
      );
    } catch (e) {}
    return Response.json({ error: "Invalid signature", reason: verification.reason }, { status: 401 });
  }

  try {
    const event = parsed || JSON.parse(rawBody);
    const eventType = detectEventType(req, event);

    if (INBOUND_EVENTS.has(eventType) || OUTBOUND_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageReceived(base44, event, eventType);
    } else if (DELETE_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageDeleted(base44, event);
    } else if (READ_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageRead(base44, event);
    } else {
      // Log other business events (follow, subscription, payment, etc.)
      waitUntil(
        (async () => {
          try {
            const b = createClientFromRequest(req);
            await b.asServiceRole.entities.ActivityLog.create({
              event_type: `webhook.${eventType}`,
              status: "info",
              message: `Verified event: ${eventType}`,
              metadata: { bodyPreview: rawBody.slice(0, 300) },
            });
          } catch (e) {}
        })()
      );
    }

    return Response.json({ received: true, verified: true, eventType });
  } catch (error) {
    return Response.json({ error: (error as any).message }, { status: 500 });
  }
}