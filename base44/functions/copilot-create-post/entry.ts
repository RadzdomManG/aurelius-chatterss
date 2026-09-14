// copilot-create-post — agent tool that publishes a post to the Fanvue feed.
// Supports text, optional PPV price, vault media (mediaUuids), and uploaded
// images (uploadedFileUrls → uploaded to Fanvue vault first). Runs server-side
// with direct Fanvue API calls via the shared apiCall helper.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, apiCall } from "../../shared/fanvue-api.ts";
import { uploadFileToVault } from "../../shared/upload-to-vault.ts";

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId, text, priceCents, mediaUuids, uploadedFileUrls, audience, publishAt } = body;
    if (!creatorProfileId) return Response.json({ error: "creatorProfileId is required" }, { status: 400 });
    if (!text && !mediaUuids?.length && !uploadedFileUrls?.length) {
      return Response.json({ error: "text or media is required" }, { status: 400 });
    }

    // Resolve the Fanvue connection for this creator
    const conns = await base44.asServiceRole.entities.FanvueConnection.filter(
      { creator_profile_id: creatorProfileId, status: "connected" },
      "-created_date", 1
    );
    const connection = conns[0];
    if (!connection) return Response.json({ error: "Fanvue account not connected for this creator" }, { status: 400 });

    const accessToken = await getValidAccessToken(connection, base44);

    // Upload any operator-uploaded images to the Fanvue vault first
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

    // Build the post body — matches the Fanvue POST /v1/posts shape used by
    // the existing PostComposer, plus mediaUuids for attached vault content.
    const postData: any = {};
    if (text) postData.text = text;
    if (priceCents && priceCents > 0) postData.price = priceCents;
    if (audience) postData.audience = audience;
    if (publishAt) postData.publishAt = publishAt;
    if (allMediaUuids.length > 0) postData.mediaUuids = allMediaUuids;

    let result: any = null;
    let apiError: string | null = null;
    try {
      result = await apiCall("/v1/posts", accessToken, {
        method: "POST",
        body: JSON.stringify(postData),
      });
    } catch (e: any) {
      apiError = e.message;
    }

    // Log the action
    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "copilot.create_post",
      status: apiError ? "error" : "success",
      message: apiError
        ? `Copilot post creation failed: ${apiError}`
        : `Copilot created a post${priceCents ? ` ($${(priceCents / 100).toFixed(2)} PPV)` : ""}${allMediaUuids.length ? ` with ${allMediaUuids.length} media item(s)` : ""}`,
      metadata: { priceCents, mediaCount: allMediaUuids.length, uploadResults, apiError },
    });

    if (apiError) return Response.json({ error: apiError }, { status: 502 });

    const postUuid = result?.uuid || result?.data?.uuid || result?.id || null;
    return Response.json({
      success: true,
      postUuid,
      mediaUploaded: uploadResults.filter((r) => r.ok).length,
      mediaUploadFailures: uploadResults.filter((r) => !r.ok).length,
      result,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}