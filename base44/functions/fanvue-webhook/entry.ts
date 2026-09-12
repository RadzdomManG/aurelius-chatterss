// fanvue-webhook — handles ALL current Creator events.
// Primary: creator.message.received (fan → creator), creator.message.sent (creator → fan).
// Also: creator.message.deleted, creator.message.read, creator.message.reaction, creator.message.mass_sent.
// Fan state: creator.fan.status_changed, creator.fan.presence_changed.
// Business: creator.follow.created, creator.subscription.*, creator.payment.succeeded, etc.
//
// Uses the canonical ingestIncomingFanMessage() from shared/ingest-message.ts
// for all message persistence — guarantees single-entry-point dedup + AI trigger.
// Persists the message and runs AI processing inline; the recovery workflow
// picks up any pre-created job if the webhook request ends before completion.
// Signature: X-Fanvue-Signature (HMAC-SHA256, t=... v0=... format).
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { secrets, waitUntil } from "base44:runtime";
import { ingestIncomingFanMessage } from "../../shared/ingest-message.ts";
// AI processing runs synchronously within this request via process-ai-job (canonical ai-processor-v2).
import { getValidAccessToken, getChatForFan } from "../../shared/fanvue-api.ts";

const TOLERANCE_SECONDS = 300;

const INBOUND_EVENTS = new Set(["message.received", "creator.message.received"]);
const OUTBOUND_EVENTS = new Set(["message.sent", "creator.message.sent", "creator.message.mass_sent"]);
const DELETE_EVENTS = new Set(["creator.message.deleted"]);
const READ_EVENTS = new Set(["creator.message.read", "creator.message.read_by_fan"]);

// Fanvue delivers every message event in BOTH the creator.* and legacy message.*
// formats simultaneously (~4ms apart). Both carry the same message UUID. Processing
// both causes a race condition that double-persists the message. Skip the legacy
// format entirely — the creator.* variant carries richer data and is always sent.
const LEGACY_DUPLICATE_EVENTS = new Set(["message.received", "message.sent", "message.read", "message.deleted"]);

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
 */
function normalizeMessageEvent(parsed: any, eventType: string) {
  const isNew = eventType.startsWith("creator.");
  if (isNew) {
    const data = parsed.data || {};
    const fan = data.fan || {};
    const creator = data.creator || {};
    const isOutbound = eventType === "creator.message.sent" || eventType === "creator.message.mass_sent" || data.sender === "creator";
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

async function processMessageEvent(base44: any, event: any, eventType: string) {
  const normalized = normalizeMessageEvent(event, eventType);
  if (!normalized) return;
  if (!normalized.senderUuid || !normalized.recipientUuid) return;

  const connections = await base44.asServiceRole.entities.FanvueConnection.filter(
    { external_user_uuid: normalized.recipientUuid, status: "connected" },
    "-created_date",
    1
  );
  const connection = connections[0];
  if (!connection) return;

  const creatorProfileId = connection.creator_profile_id;

  // For inbound messages, hydrate identity if missing
  if (!normalized.isOutbound) {
    await hydrateIdentityIfNeeded(base44, connection, normalized);
  }

  // Use the canonical ingest function — single entry point for all messages
  const result = await ingestIncomingFanMessage(base44, {
    creatorProfileId,
    fanUuid: normalized.senderUuid,
    fanDisplayName: normalized.senderName || undefined,
    fanHandle: normalized.senderHandle || undefined,
    fanAvatar: normalized.senderAvatar || undefined,
    messageUuid: normalized.msgUuid,
    messageText: normalized.msgText,
    mediaUuids: normalized.mediaUuids,
    ppvCents: normalized.ppvCents,
    sentAt: normalized.sentAt,
    unreadCount: normalized.unreadCount,
    isOutbound: normalized.isOutbound,
    triggerAI: !normalized.isOutbound,
    source: "webhook",
  });

  return result;
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
  const creatorUuid = data.creator?.uuid || data.recipientUuid;
  if (!fanUuid) return;
  try {
    // Scope by creator when possible so a stale/colliding fan UUID can't reset
    // the wrong account's unread badge, and clear EVERY duplicate conversation
    // record for the fan (not just the first).
    const fanFilter: any = { external_uuid: fanUuid };
    if (creatorUuid) {
      const conns = await base44.asServiceRole.entities.FanvueConnection.filter({ external_user_uuid: creatorUuid, status: "connected" }, "-created_date", 1);
      if (conns[0]) fanFilter.creator_profile_id = conns[0].creator_profile_id;
    }
    const fans = await base44.asServiceRole.entities.Fan.filter(fanFilter, "-created_date", 5);
    if (!fans[0]) return;
    for (const fan of fans) {
      const convos = await base44.asServiceRole.entities.Conversation.filter({ fan_id: fan.id }, "-created_date", 10);
      for (const c of convos) {
        if (c.unread_count > 0) {
          await base44.asServiceRole.entities.Conversation.update(c.id, { unread_count: 0 });
        }
      }
    }
  } catch (e) {}
}

async function processFanStatusChanged(base44: any, event: any) {
  const data = event.data || event;
  const fanUuid = data.fan?.uuid || data.user?.uuid || data.uuid;
  const creatorUuid = data.creator?.uuid;
  const status = data.status || data.subscription_status;
  if (!fanUuid) return;
  try {
    const fanFilter: any = { external_uuid: fanUuid };
    if (creatorUuid) {
      const conns = await base44.asServiceRole.entities.FanvueConnection.filter({ external_user_uuid: creatorUuid, status: "connected" }, "-created_date", 1);
      if (conns[0]) fanFilter.creator_profile_id = conns[0].creator_profile_id;
    }
    const fans = await base44.asServiceRole.entities.Fan.filter(fanFilter, "-created_date", 5);
    for (const fan of fans) {
      await base44.asServiceRole.entities.Fan.update(fan.id, { subscription_status: status });
    }
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "fan.status_changed",
      status: "info",
      message: `Fan ${fans[0]?.display_name || fanUuid} status changed: ${status || "unknown"}`,
    });
  } catch (e) {}
}

async function processFanPresenceChanged(base44: any, event: any) {
  const data = event.data || event;
  const fanUuid = data.fan?.uuid || data.user?.uuid || data.uuid;
  const presence = data.presence || data.status;
  try {
    await base44.asServiceRole.entities.ActivityLog.create({
      event_type: "fan.presence_changed",
      status: "info",
      message: `Fan ${fanUuid} presence: ${presence || "unknown"}`,
    });
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

    // Skip legacy message.* events — the creator.* equivalent is always sent
    // and carries the same data. Processing both causes duplicate messages.
    if (LEGACY_DUPLICATE_EVENTS.has(eventType)) {
      waitUntil(
        (async () => {
          try {
            const b = createClientFromRequest(req);
            await b.asServiceRole.entities.ActivityLog.create({
              event_type: "webhook.duplicate_ignored",
              status: "info",
              message: `Skipped legacy ${eventType} (creator.* variant handles it)`,
              metadata: { eventType },
            });
          } catch (e) {}
        })()
      );
      return Response.json({ received: true, verified: true, eventType, skipped: "legacy_duplicate" });
    }

    if (INBOUND_EVENTS.has(eventType) || OUTBOUND_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageEvent(base44, event, eventType);
    } else if (DELETE_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageDeleted(base44, event);
    } else if (READ_EVENTS.has(eventType)) {
      const base44 = createClientFromRequest(req);
      await processMessageRead(base44, event);
    } else if (eventType === "creator.fan.status_changed" || eventType === "fan.status_changed") {
      const base44 = createClientFromRequest(req);
      await processFanStatusChanged(base44, event);
    } else if (eventType === "creator.fan.presence_changed" || eventType === "fan.presence_changed") {
      const base44 = createClientFromRequest(req);
      await processFanPresenceChanged(base44, event);
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