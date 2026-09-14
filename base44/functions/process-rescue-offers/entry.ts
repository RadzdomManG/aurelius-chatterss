// process-rescue-offers — scheduled rescue-offer poller (runs ~every 1 min via
// the "PPV Rescue" workflow). NO auth gate (workflow has no user session); uses
// asServiceRole for all ops, exactly like recover-ai-jobs.
//
// For each base PPV offer whose rescue timer has elapsed:
//  1. Re-reconcile purchases — if the fan already bought the base, CANCEL the rescue.
//  2. Re-validate: creator active, automation on, PPV allowed, media still eligible.
//  3. Re-validate every media UUID (free/unknown/unavailable → cancel, never send free).
//  4. Generate a short persona-aware teaser via Grok, send the SAME locked content
//     at base − $5 (floor $7). Content stays LOCKED — never sent as a free attachment.
//  5. Create a rescue PpvOfferTracking record (offer_type="rescue", parent_offer_id).
//  6. Mark the base offer rescue_status="sent". Idempotent: only "pending" offers fire.
//
// This is the ONLY place rescue offers are sent, so there is at most one rescue per offer.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { isPaused } from "../../shared/app-config.ts";
import { getValidAccessToken, sendFanvueMessage } from "../../shared/fanvue-api.ts";
import { callGrok } from "../../shared/grok-client.ts";
import { validateMediaForPpv } from "../../shared/media-eligibility.ts";
import { reconcileFanPpv } from "../../shared/ppv-reconcile.ts";
import { isValidRescuePrice } from "../../shared/ppv-ladder.ts";

const RESCUE_SCHEMA = {
  type: "object",
  properties: {
    replies: { type: "array", items: { type: "string" }, description: "1-2 short natural chat bubbles, each ONE single line, no line breaks inside." },
  },
};

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  if (await isPaused(base44)) {
    return Response.json({ success: true, paused: true, skipped: true });
  }

  let sent = 0, cancelled = 0, failed = 0, blocked = 0;
  const nowIso = new Date().toISOString();

  try {
    // Find base offers with a due pending rescue.
    const dueOffers = await base44.asServiceRole.entities.PpvOfferTracking.filter(
      { offer_type: "base", rescue_status: "pending" },
      "-created_date",
      100
    );
    const due = (dueOffers || []).filter((o) => o.rescue_scheduled_at && new Date(o.rescue_scheduled_at) <= new Date());

    for (const offer of due) {
      try {
        const creatorProfileId = offer.creator_profile_id;
        const [creators, settingsList, connections, fans] = await Promise.all([
          base44.asServiceRole.entities.CreatorProfile.filter({ id: creatorProfileId }, "-created_date", 1),
          base44.asServiceRole.entities.AutomationSettings.filter({ creator_profile_id: creatorProfileId }, "-created_date", 1),
          base44.asServiceRole.entities.FanvueConnection.filter({ creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1),
          base44.asServiceRole.entities.Fan.filter({ id: offer.fan_id }, "-created_date", 1),
        ]);
        const creator = creators[0];
        const settings = settingsList[0] || {};
        const connection = connections[0];
        const fan = fans[0];

        // Validation: creator active + automation on + rescue still enabled.
        const mode = creator?.automation_mode || "off";
        if (mode === "off" || !connection || !fan) {
          try { await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, { rescue_status: "cancelled" }); } catch (e) {}
          cancelled++;
          continue;
        }
        if (settings.rescue_enabled === false) {
          try { await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, { rescue_status: "cancelled" }); } catch (e) {}
          cancelled++;
          continue;
        }

        // Re-reconcile purchases — if the fan bought the base, cancel the rescue.
        try { await reconcileFanPpv(base44, connection, fan, settings); } catch (e) {}
        const refreshed = await base44.asServiceRole.entities.PpvOfferTracking.get(offer.id);
        if (!refreshed || refreshed.rescue_status !== "pending" || refreshed.purchased === true || refreshed.base_status === "purchased") {
          cancelled++;
          continue;
        }

        const rescuePrice = refreshed.rescue_price_cents;
        const basePrice = refreshed.base_price_cents || refreshed.price_cents;
        if (rescuePrice == null || !isValidRescuePrice(rescuePrice, basePrice)) {
          try { await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, { rescue_status: "cancelled" }); } catch (e) {}
          cancelled++;
          continue;
        }

        const mediaUuids = Array.isArray(refreshed.media_uuids) ? refreshed.media_uuids : [];
        // FINAL MEDIA ELIGIBILITY VALIDATION — a rescue must never bypass it.
        const eligibility = await validateMediaForPpv(base44, creatorProfileId, mediaUuids);
        if (!eligibility.ok) {
          try { await base44.asServiceRole.entities.PpvOfferTracking.update(offer.id, { rescue_status: "cancelled" }); } catch (e) {}
          blocked++;
          await base44.asServiceRole.entities.ActivityLog.create({
            creator_profile_id: creatorProfileId,
            conversation_id: refreshed.conversation_id,
            event_type: "ai.ppv_rescue_cancelled",
            status: "error",
            message: `Rescue cancelled — ${eligibility.reason || "media no longer eligible"}`,
            metadata: { offer_id: offer.id, invalid: eligibility.invalid, missing: eligibility.missing },
          });
          continue;
        }

        // Generate a short persona-aware rescue teaser via Grok.
        const personas = await base44.asServiceRole.entities.PersonaProfile.filter({ creator_profile_id: creatorProfileId, active: true }, "-updated_date", 1);
        const persona = personas[0];
        const recentMsgs = await base44.asServiceRole.entities.Message.filter({ conversation_id: refreshed.conversation_id }, "-created_date", 8);
        recentMsgs.sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
        const ctx = recentMsgs.slice(-8).map((m) => `[${m.sender_type === "fan" ? "Fan" : "You"}] ${m.body || "[media]"}`).join("\n");

        const sysPrompt = `You are roleplaying as a Fanvue creator. Your persona:\n${persona?.instructions || ""}\n\nStay fully in character. Write 1-2 short natural chat bubbles (each ONE single line, no line breaks inside a bubble). You just sent ${fan?.display_name || "the fan"} a locked PPV offer a few minutes ago and they haven't unlocked it yet. You decided to lower the price a little for them as a personal favour — mention it naturally and teasingly, like you're giving them a little deal because you like them. NEVER mention the exact dollar amount, the word "discount", "ladder", "rescue", "algorithm", "pricing", or that you are automated. Keep it casual, warm, and in-persona. Respond ONLY with JSON: {"replies": ["bubble 1", "bubble 2 (optional)"]}.`;

        const userPrompt = `Recent conversation:\n${ctx || "(no recent messages)"}\n\nWrite your rescue teaser now.`;

        let replies = [];
        try {
          const aiRes = await callGrok(sysPrompt, userPrompt, RESCUE_SCHEMA);
          replies = Array.isArray(aiRes?.replies) ? aiRes.replies.map((r) => String(r || "").replace(/\s+/g, " ").trim()).filter(Boolean) : [];
        } catch (e) {
          console.error("[rescue] grok failed:", (e as any).message);
        }
        if (replies.length === 0) {
          replies = ["couldn't stop thinking about you with this one… lowered it a little, just for you 💕"];
        }

        // Send the rescue: SAME locked media at the discounted price. Content
        // stays LOCKED — never sent as a free attachment.
        const accessToken = await getValidAccessToken(connection, base44);
        // FULL-LOCK PPV: only include a free preview when the creator opted in.
        const mediaForSend = {
          mediaUuids: eligibility.valid,
          ...(settings.ppv_preview_enabled === true ? { mediaPreviewUuid: eligibility.valid[0] } : {}),
        };
        const rescueSentAt = new Date().toISOString();
        let lastSentMsgUuid = null;
        for (let i = 0; i < replies.length; i++) {
          const isLast = i === replies.length - 1;
          const result = await sendFanvueMessage(accessToken, fan.external_uuid, replies[i], isLast ? rescuePrice : null, isLast ? mediaForSend : null);
          const su = result?.messageUuid || result?.uuid || result?.data?.uuid || result?.message?.uuid || result?.id || null;
          if (isLast && su) lastSentMsgUuid = su;
          if (su) {
            const existing = await base44.asServiceRole.entities.Message.filter({ external_uuid: su }, "-created_date", 1);
            if (!existing[0]) {
              await base44.asServiceRole.entities.Message.create({
                creator_profile_id: creatorProfileId,
                conversation_id: refreshed.conversation_id,
                external_uuid: su,
                sender_type: "creator",
                body: replies[i],
                ppv_cents: isLast ? rescuePrice : null,
                media: isLast ? eligibility.valid : [],
                source: "ai",
              });
            }
          }
          if (!isLast) await new Promise((r) => setTimeout(r, 1000));
        }

        // Mark the base offer's rescue as sent (idempotent claim — only if still pending).
        try {
          await base44.asServiceRole.entities.PpvOfferTracking.update(refreshed.id, { rescue_status: "sent", rescue_sent_at: rescueSentAt });
        } catch (e) {}

        // Create the rescue tracking record.
        try {
          await base44.asServiceRole.entities.PpvOfferTracking.create({
            creator_profile_id: creatorProfileId,
            fan_id: refreshed.fan_id,
            conversation_id: refreshed.conversation_id,
            content_set_id: refreshed.content_set_id,
            message_id: lastSentMsgUuid,
            media_uuids: eligibility.valid,
            source: refreshed.source,
            folder_name: refreshed.folder_name,
            sent_at: rescueSentAt,
            price_cents: rescuePrice,
            offer_type: "rescue",
            parent_offer_id: refreshed.id,
            base_price_cents: basePrice,
            ladder_level: refreshed.ladder_level,
            base_status: "sent",
            rescue_status: "none",
            purchased: false,
          });
        } catch (e) {}

        // Update fan rescue state.
        try {
          await base44.asServiceRole.entities.Fan.update(refreshed.fan_id, {
            rescue_pending: false,
            last_rescue_sent_at: rescueSentAt,
            last_rescue_price_cents: rescuePrice,
          });
        } catch (e) {}

        await base44.asServiceRole.entities.ActivityLog.create({
          creator_profile_id: creatorProfileId,
          conversation_id: refreshed.conversation_id,
          event_type: "ai.ppv_rescue_sent",
          status: "success",
          message: `Rescue sent to ${fan?.display_name || "fan"} — $${(basePrice / 100).toFixed(2)} → $${(rescuePrice / 100).toFixed(2)}, same locked content`,
          metadata: { offer_id: refreshed.id, base_price: basePrice, rescue_price: rescuePrice },
        });

        // Update conversation last_ppv_offer_at so the cooldown resets around the rescue.
        try {
          await base44.asServiceRole.entities.Conversation.update(refreshed.conversation_id, {
            last_ppv_offer_at: rescueSentAt,
            last_message_at: rescueSentAt,
            last_message_preview: replies.join(" "),
            last_sender_type: "creator",
          });
        } catch (e) {}

        sent++;
      } catch (err) {
        failed++;
        console.error("[rescue] offer", offer.id, (err as any).message);
      }
    }

    if (sent + cancelled + failed + blocked > 0) {
      await base44.asServiceRole.entities.ActivityLog.create({
        event_type: "runner.rescue",
        status: failed > 0 ? "warning" : "success",
        message: `Rescue poll: ${sent} sent, ${cancelled} cancelled, ${blocked} blocked (unsafe media), ${failed} failed`,
        metadata: { sent, cancelled, blocked, failed },
      });
    }

    return Response.json({ success: true, sent, cancelled, blocked, failed });
  } catch (error) {
    return Response.json({ error: (error as any)?.message || "rescue poll failed" }, { status: 500 });
  }
}