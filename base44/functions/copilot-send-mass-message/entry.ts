// copilot-send-mass-message — agent tool that broadcasts a mass message to
// fan segments (subscribers, followers, etc.). Supports text, optional PPV
// price, vault media, and uploaded images. Runs server-side with direct Fanvue
// API calls.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, apiCall } from "../../shared/fanvue-api.ts";
import { uploadFileToVault } from "../../shared/upload-to-vault.ts";

const MIN_PPV_CENTS = 300;

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, text, priceCents, mediaUuids, uploadedFileUrls, smartListIds, scheduledAt } = body;
    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
    if (!text && !mediaUuids?.length && !uploadedFileUrls?.length) {
      return Response.json({ error: "text or media is required" }, { status: 400 });
    }
    if (priceCents && priceCents > 0 && priceCents < MIN_PPV_CENTS) {
      return Response.json({ error: `Minimum PPV for mass messages is $3.00 (${MIN_PPV_CENTS} cents)` }, { status: 400 });
    }

    // Resolve the Fanvue connection
    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: creatorProfileId, status: "connected" },
      "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected for this creator" }, { status: 400 });

    const accessToken = await getValidAccessToken(connection, base44);

    // Upload any operator-uploaded images to the Fanvue vault
    let allMediaUuids = Array.isArray(mediaUuids) ? [...mediaUuids] : [];
    const uploadResults: any[] = [];
    if (uploadedFileUrls?.length) {
      for (const url of uploadedFileUrls) {
        try {
          const uuid = await uploadFileToVault(accessToken, url);
          allMediaUuids.push(uuid);
          uploadResults.push({ url, uuid, ok: true });
        } catch (e: any) {
          uploadResults.push({ url, error: e.message, ok: false });
        }
      }
    }

    // Build the mass message body — matches the existing MassMessageComposer
    // payload shape, plus mediaUuids for attached vault content.
    const lists = (Array.isArray(smartListIds) && smartListIds.length > 0) ? smartListIds : ["subscribers"];
    const massData: any = {
      text: text || "",
      includedLists: { smartListIds: lists, customListUuids: [] },
      excludedLists: { smartListIds: [], customListUuids: [] },
    };
    if (priceCents && priceCents > 0) massData.price = priceCents;
    if (scheduledAt) massData.scheduledAt = scheduledAt;
    if (allMediaUuids.length > 0) massData.mediaUuids = allMediaUuids;

    let result: any = null;
    let apiError: string | null = null;
    try {
      result = await apiCall("/v1/chats/mass-messages", accessToken, {
        method: "POST",
        body: JSON.stringify(massData),
      });
    } catch (e: any) {
      apiError = e.message;
    }

    // Log
    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.send_mass_message",
      status: apiError ? "error" : "success",
      message: apiError
        ? `Copilot mass message failed: ${apiError}`
        : `Copilot sent a mass message to ${lists.join(", ")}${priceCents ? ` ($${(priceCents / 100).toFixed(2)} PPV)` : ""}${allMediaUuids.length ? ` with ${allMediaUuids.length} media` : ""}`,
      metadata: { priceCents, smartListIds: lists, mediaCount: allMediaUuids.length, uploadResults, apiError },
    });

    if (apiError) return Response.json({ error: apiError }, { status: 502 });

    const messageUuid = result?.uuid || result?.messageUuid || result?.data?.uuid || null;
    return Response.json({
      success: true,
      messageUuid,
      targetSegments: lists,
      mediaUploaded: uploadResults.filter((r) => r.ok).length,
      mediaUploadFailures: uploadResults.filter((r) => !r.ok).length,
      result,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}