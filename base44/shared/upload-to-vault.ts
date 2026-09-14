// Shared helper: upload a file from a public URL into the creator's Fanvue vault.
// Implements Fanvue's multipart upload session flow:
//   1. POST /v1/media/uploads  → create upload session (returns uploadId)
//   2. GET  /v1/media/uploads/{uploadId}/parts/{n}/url → presigned URL per part
//   3. PUT  file bytes to the presigned URL
//   4. PATCH /v1/media/uploads/{uploadId} → complete upload (returns media uuid)
// Returns the new vault media UUID, or throws on failure.
import { apiCall } from "./fanvue-api.ts";

export async function uploadFileToVault(accessToken: string, fileUrl: string): Promise<string> {
  // 1. Fetch the file from the public URL
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error(`Failed to fetch uploaded file (${fileRes.status})`);
  const blob = await fileRes.blob();
  const size = blob.size;
  const contentType = blob.type || "image/jpeg";
  const urlPath = fileUrl.split("/").pop()?.split("?")[0] || "upload";
  const ext = urlPath.includes(".") ? urlPath.split(".").pop() : "jpg";
  const filename = `${urlPath.split(".")[0] || "upload"}.${ext}`;

  // 2. Create the upload session
  const session: any = await apiCall("/v1/media/uploads", accessToken, {
    method: "POST",
    body: JSON.stringify({ filename, contentType, size }),
  });
  const uploadId = session?.uploadId || session?.id || session?.data?.uploadId || session?.data?.id;
  if (!uploadId) throw new Error("Upload session did not return an uploadId");

  // 3. Determine part count (single part for most images; Fanvue may specify parts)
  const partCount = session?.parts || session?.data?.parts || 1;
  const partSize = session?.partSize || session?.data?.partSize || size;

  const uploadedParts: any[] = [];
  for (let partNumber = 1; partNumber <= partCount; partNumber++) {
    // Get presigned URL for this part
    const partRes: any = await apiCall(`/v1/media/uploads/${uploadId}/parts/${partNumber}/url`, accessToken);
    const presignedUrl = partRes?.url || partRes?.data?.url;
    if (!presignedUrl) throw new Error(`No presigned URL for part ${partNumber}`);

    // Slice the blob for this part
    const start = (partNumber - 1) * partSize;
    const end = Math.min(start + partSize, size);
    const partBlob = partCount === 1 ? blob : blob.slice(start, end);

    // Upload to the presigned URL
    const uploadRes = await fetch(presignedUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: partBlob,
    });
    if (!uploadRes.ok) throw new Error(`Part ${partNumber} upload failed (${uploadRes.status})`);
    const etag = uploadRes.headers.get("ETag") || "";
    uploadedParts.push({ partNumber, etag });
  }

  // 4. Complete the upload session
  const complete: any = await apiCall(`/v1/media/uploads/${uploadId}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify({ parts: uploadedParts }),
  });
  const mediaUuid = complete?.uuid || complete?.mediaUuid || complete?.data?.uuid || complete?.data?.mediaUuid;
  if (!mediaUuid) throw new Error("Upload completion did not return a media UUID");

  return mediaUuid;
}