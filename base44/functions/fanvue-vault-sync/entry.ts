// fanvue-vault-sync — paginated sync of a creator's Fanvue vault into local
// VaultFolder + VaultMedia entities so the automatic-vault PPV engine can
// select unseen media without re-fetching the whole vault per fan message.
//
// Auth: any authenticated user (me() gate). Writes use asServiceRole so org-
// shared connection records (not owned by the caller) are readable.
// Capped at MAX_ITEMS per run to stay within function timeouts; re-run to
// continue. Existing VaultFolder.approved flags are preserved across re-sync.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";
import { getValidAccessToken, getMedia } from "../../shared/fanvue-api.ts";

const MAX_ITEMS = 500;
const CHUNK = 100;

function extractThumb(item: any): string {
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const v =
    variants.find((x) => x.variantType === "thumbnail") ||
    variants.find((x) => x.variantType === "thumbnail_gallery") ||
    variants.find((x) => x.variantType === "main") ||
    variants.find((x) => x.url);
  if (v?.url) return v.url;
  return item.thumbnailUrl || item.thumbnail_url || item.previewUrl || item.url || "";
}

function contentTypeOf(item: any): "image" | "video" {
  const t = String(item.type || item.mediaType || "").toLowerCase();
  return t.includes("video") ? "video" : "image";
}

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  let body: any = {};
  try { body = await req.json().catch(() => ({})); } catch (e) {}

  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const requestedCreatorId = body.creatorProfileId;
    let connection: any;
    if (requestedCreatorId) {
      const conns = await base44.entities.FanvueConnection.filter({ creator_profile_id: requestedCreatorId, status: "connected" }, "-created_date", 1);
      connection = conns[0];
    } else {
      const conns = await base44.entities.FanvueConnection.filter({ status: "connected" }, "-created_date", 1);
      connection = conns[0];
    }
    if (!connection) return Response.json({ error: "No connected Fanvue account found" }, { status: 404 });

    const granted = connection.granted_scopes || [];
    if (!granted.includes("read:media")) {
      return Response.json({ error: "Insufficient scopes — reconnect Fanvue to grant read:media", needsReconnect: true, code: "MISSING_SCOPE" }, { status: 403 });
    }

    const creatorProfileId = connection.creator_profile_id;
    const accessToken = await getValidAccessToken(connection, base44);

    // Preserve existing approved flags so re-sync doesn't wipe the allow-list.
    const existingFolders = await base44.asServiceRole.entities.VaultFolder.filter({ creator_profile_id: creatorProfileId }, "created_date", 200);
    const approvedByName = new Map((existingFolders || []).map((f: any) => [f.folder_name, !!f.approved]));

    // Existing media UUIDs → only insert new ones, update stale thumbs/titles.
    const existingMedia = await base44.asServiceRole.entities.VaultMedia.filter({ creator_profile_id: creatorProfileId }, "created_date", 1000);
    const mediaByUuid = new Map((existingMedia || []).map((m: any) => [m.external_uuid, m]));

    const folderCounts: Record<string, number> = {};
    let cursor: string | null = null;
    let total = 0;
    let pages = 0;
    const syncedAt = new Date().toISOString();

    while (total < MAX_ITEMS && pages < 20) {
      const res: any = await getMedia(accessToken, { cursor, size: 50 });
      const items = res?.data || [];
      if (!items.length) break;
      const toCreate: any[] = [];
      const toUpdate: any[] = [];
      for (const item of items) {
        const uuid = item.uuid || item.id;
        if (!uuid) continue;
        const folderName = item.folderName || item.folder_name || "Default";
        folderCounts[folderName] = (folderCounts[folderName] || 0) + 1;
        const thumb = extractThumb(item);
        const main = (Array.isArray(item.variants) ? item.variants.find((v: any) => v.variantType === "main")?.url : null) || thumb;
        const ct = contentTypeOf(item);
        const existing = mediaByUuid.get(uuid);
        if (existing && existing.id) {
          const changed =
            existing.folder_name !== folderName ||
            existing.thumbnail_url !== thumb ||
            existing.main_url !== main ||
            existing.title !== (item.title || existing.title) ||
            existing.status !== (item.status || existing.status || "ready");
          if (changed) {
            toUpdate.push({
              id: existing.id,
              folder_name: folderName,
              title: item.title || existing.title || "",
              content_type: ct,
              thumbnail_url: thumb,
              main_url: main,
              status: item.status || existing.status || "ready",
              duration_seconds: item.duration ?? existing.duration_seconds,
              synced_at: syncedAt,
            });
          }
        } else {
          toCreate.push({
            creator_profile_id: creatorProfileId,
            external_uuid: uuid,
            folder_name: folderName,
            title: item.title || "",
            content_type: ct,
            thumbnail_url: thumb,
            main_url: main,
            status: item.status || "ready",
            duration_seconds: item.duration ?? null,
            synced_at: syncedAt,
          });
        }
        mediaByUuid.set(uuid, true as any);
        total++;
      }
      for (let i = 0; i < toCreate.length; i += CHUNK) {
        await base44.asServiceRole.entities.VaultMedia.bulkCreate(toCreate.slice(i, i + CHUNK));
      }
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        await base44.asServiceRole.entities.VaultMedia.bulkUpdate(toUpdate.slice(i, i + CHUNK));
      }
      cursor = res?.nextCursor || null;
      pages++;
      if (!cursor) break;
    }

    // Upsert folders with counts, preserving approved flags.
    const folderUpserts = Object.entries(folderCounts).map(([name, count]) => {
      const existing = existingFolders.find((f: any) => f.folder_name === name);
      if (existing) {
        return base44.asServiceRole.entities.VaultFolder.update(existing.id, {
          media_count: count,
          last_synced_at: syncedAt,
        });
      }
      return base44.asServiceRole.entities.VaultFolder.create({
        creator_profile_id: creatorProfileId,
        folder_name: name,
        media_count: count,
        approved: !!approvedByName.get(name),
        last_synced_at: syncedAt,
      });
    });
    await Promise.all(folderUpserts);

    // Mark folders that no longer exist as media_count 0 (don't delete — keep
    // the approved flag in case the folder is temporarily empty).
    const currentNames = new Set(Object.keys(folderCounts));
    for (const f of (existingFolders || [])) {
      if (!currentNames.has(f.folder_name)) {
        try { await base44.asServiceRole.entities.VaultFolder.update(f.id, { media_count: 0 }); } catch (e) {}
      }
    }

    await base44.asServiceRole.entities.ActivityLog.create({
      creator_profile_id: creatorProfileId,
      event_type: "vault.sync",
      status: "success",
      message: `Vault sync: ${total} media across ${Object.keys(folderCounts).length} folder(s)`,
      metadata: { total, folders: Object.keys(folderCounts), pages },
    });

    return Response.json({
      success: true,
      mediaSynced: total,
      folders: Object.entries(folderCounts).map(([name, count]) => ({ folder_name: name, media_count: count })),
      moreAvailable: !!cursor,
    });
  } catch (error) {
    const msg = (error as any).message || "";
    if (msg.includes("403") || msg.toLowerCase().includes("insufficient scopes") || msg.includes("age_verification")) {
      return Response.json({
        error: msg.includes("age_verification") ? "Age verification required for media access" : "Insufficient scopes — reconnect Fanvue to grant read:media",
        needsReconnect: !msg.includes("age_verification"),
      }, { status: 403 });
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}