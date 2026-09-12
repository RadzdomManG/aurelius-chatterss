import { base44 } from "@/api/base44Client";

/**
 * Module-level cache of a creator's vault media, keyed by creatorProfileId.
 * Resolves Fanvue media UUIDs -> full media objects (with thumbnail variants)
 * so chat bubbles can render real previews without re-fetching per message.
 *
 * One fetch per creator is shared across every MessageMedia instance; the
 * promise is cached so repeat mounts pay nothing.
 */
const cache = new Map();

export function getVaultMediaMap(creatorProfileId) {
  if (!creatorProfileId) return Promise.resolve(new Map());
  if (cache.has(creatorProfileId)) return cache.get(creatorProfileId);

  const promise = (async () => {
    try {
      const res = await base44.functions.invoke("fanvue-media", {
        creatorProfileId,
        size: 50,
      });
      const items = (res.data && res.data.data) || [];
      const map = new Map();
      for (const item of items) {
        if (item && item.uuid) map.set(item.uuid, item);
      }
      return map;
    } catch (e) {
      return new Map();
    }
  })();

  cache.set(creatorProfileId, promise);
  return promise;
}

export function invalidateVaultMediaCache(creatorProfileId) {
  if (creatorProfileId) cache.delete(creatorProfileId);
  else cache.clear();
}