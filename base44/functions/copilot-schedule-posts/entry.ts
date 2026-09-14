// copilot-schedule-posts — agent tool that bulk-schedules posts from a specific
// vault folder across multiple days. Example: "schedule 20 posts from my FEED
// folder over 5 days" → picks 20 media items, generates persona-styled captions
// via InvokeLLM, distributes 4 per day at varied times within the active window,
// and creates scheduled Fanvue posts.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, apiCall } from "../../shared/fanvue-api.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const {
      creatorProfileId,
      folderName,
      totalPosts,
      days,
      postsPerDay,
      startDate: startDateStr,
      timeWindowStart = "09:00",
      timeWindowEnd = "21:00",
      priceCents = 0,
      captionStyle,
    } = body;

    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
    if (!folderName) return Response.json({ error: "folderName is required" }, { status: 400 });
    if (!totalPosts || totalPosts < 1) return Response.json({ error: "totalPosts must be at least 1" }, { status: 400 });
    if (!days || days < 1) return Response.json({ error: "days must be at least 1" }, { status: 400 });

    // Resolve connection
    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: creatorProfileId, status: "connected" }, "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected" }, { status: 400 });
    const accessToken = await getValidAccessToken(connection, base44);

    // Load vault media from the specified folder
    const allMedia = await base44.asServiceRole.entities.VaultMedia.filter(
      { creator_profile_id: creatorProfileId, folder_name: folderName }, "-created_date", 500
    );
    let available = (allMedia || []).filter((m: any) => m.is_available !== false);
    if (available.length === 0) {
      // List available folder names to help the operator
      const folders = await base44.asServiceRole.entities.VaultFolder.filter({ creator_profile_id: creatorProfileId }, "folder_name", 100);
      const folderNames = (folders || []).map((f: any) => f.folder_name).filter(Boolean);
      return Response.json({
        error: `No media found in folder "${folderName}".`,
        availableFolders: folderNames,
      }, { status: 400 });
    }
    if (available.length < totalPosts) {
      return Response.json({
        error: `Only ${available.length} media items in folder "${folderName}", but you asked for ${totalPosts}.`,
      }, { status: 400 });
    }

    // Pick the first N items
    const selected = available.slice(0, totalPosts);

    // Load the active persona for caption style
    const personas = await base44.asServiceRole.entities.PersonaProfile.filter(
      { creator_profile_id: creatorProfileId, active: true }, "-updated_date", 1
    );
    const persona = personas[0];
    const personaInstructions = persona?.instructions || "You are a Fanvue creator. Write engaging, flirty captions.";

    // Generate captions via InvokeLLM — one call for all items
    const mediaList = selected.map((m: any, i: number) =>
      `${i + 1}. ${m.title || "untitled"} (${m.content_type})`
    ).join("\n");

    const captionPrompt = `${personaInstructions}\n\nYou are scheduling ${totalPosts} posts from the "${folderName}" folder. Generate a unique, engaging caption for EACH media item below. Each caption should be 1-3 sentences, in your persona's voice, and different from the others. ${captionStyle ? `Style hint: ${captionStyle}.` : ""} Do not mention prices, money, or "unlock" — the system handles that.\n\nMedia items:\n${mediaList}\n\nReturn a JSON object with a "captions" array containing exactly ${totalPosts} strings, one per media item in order.`;

    let captions: string[] = [];
    try {
      const llmRes: any = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: captionPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            captions: {
              type: "array",
              items: { type: "string" },
              description: `Exactly ${totalPosts} captions, one per media item in order`,
            },
          },
        },
      });
      const raw = llmRes?.captions || llmRes?.data?.captions || llmRes;
      if (Array.isArray(raw)) {
        captions = raw.slice(0, totalPosts);
        while (captions.length < totalPosts) {
          captions.push(`New ${selected[captions.length]?.content_type || "content"} for you 💕`);
        }
      } else {
        captions = selected.map((m: any) => `New ${m.content_type} for you 💕`);
      }
    } catch (e) {
      captions = selected.map((m: any) => `New ${m.content_type} for you 💕`);
    }

    // Distribute across days
    const perDay = postsPerDay || Math.ceil(totalPosts / days);
    const start = startDateStr ? new Date(startDateStr) : new Date();
    start.setHours(0, 0, 0, 0);

    const [winStartH, winStartM] = String(timeWindowStart).split(":").map(Number);
    const [winEndH, winEndM] = String(timeWindowEnd).split(":").map(Number);
    const winStartMin = winStartH * 60 + (winStartM || 0);
    const winEndMin = winEndH * 60 + (winEndM || 0);

    const schedule: any[] = [];
    let mediaIndex = 0;
    for (let day = 0; day < days && mediaIndex < totalPosts; day++) {
      const postsThisDay = Math.min(perDay, totalPosts - mediaIndex);
      const slotSize = postsThisDay > 0 ? (winEndMin - winStartMin) / postsThisDay : 0;
      for (let p = 0; p < postsThisDay; p++) {
        const slotStart = winStartMin + p * slotSize;
        const randomMin = slotStart + Math.random() * slotSize;
        const scheduledDate = new Date(start);
        scheduledDate.setDate(start.getDate() + day);
        scheduledDate.setHours(Math.floor(randomMin / 60), Math.floor(randomMin % 60), 0, 0);

        const media = selected[mediaIndex];
        const caption = captions[mediaIndex] || `New ${media.content_type} for you 💕`;

        let postUuid: string | null = null;
        let apiError: string | null = null;
        try {
          const result: any = await apiCall("/v1/posts", accessToken, {
            method: "POST",
            body: JSON.stringify({
              text: caption,
              mediaUuids: [media.external_uuid],
              ...(priceCents > 0 ? { price: priceCents } : {}),
              publishAt: scheduledDate.toISOString(),
            }),
          });
          postUuid = result?.uuid || result?.data?.uuid || null;
        } catch (e: any) {
          apiError = e.message;
        }

        schedule.push({
          day: day + 1,
          date: scheduledDate.toISOString(),
          mediaUuid: media.external_uuid,
          mediaTitle: media.title,
          contentType: media.content_type,
          caption,
          postUuid,
          success: !apiError,
          error: apiError,
        });
        mediaIndex++;
      }
    }

    const successCount = schedule.filter((s) => s.success).length;

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.schedule_posts",
      status: successCount === totalPosts ? "success" : "warning",
      message: `Copilot scheduled ${successCount}/${totalPosts} posts from folder "${folderName}" across ${days} day(s)`,
      metadata: { folderName, totalPosts, days, perDay, priceCents, successCount },
    });

    return Response.json({
      success: successCount > 0,
      folder: folderName,
      totalRequested: totalPosts,
      totalScheduled: successCount,
      totalFailed: totalPosts - successCount,
      schedule,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}