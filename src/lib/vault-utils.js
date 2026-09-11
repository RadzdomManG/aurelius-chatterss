/**
 * Canonical Fanvue media thumbnail resolver — used by Media page, VaultPicker,
 * PPV picker, and any component that needs to display a vault media preview.
 *
 * Fanvue returns a `variants` array on each media object. Each variant has
 * a `variantType` (thumbnail, thumbnail_gallery, main) and a signed `url`.
 * Priority: thumbnail > thumbnail_gallery > main > any variant with url.
 * Falls back to legacy flat fields for older API responses.
 *
 * @param {object} item — Fanvue media object
 * @returns {string|null} — best available thumbnail URL
 */
export function getMediaThumbnail(item) {
  if (!item) return null;
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const thumb =
    variants.find((v) => v.variantType === "thumbnail") ||
    variants.find((v) => v.variantType === "thumbnail_gallery") ||
    variants.find((v) => v.variantType === "main") ||
    variants.find((v) => v.url);
  if (thumb?.url) return thumb.url;
  return (
    item.thumbnailUrl ||
    item.thumbnail_url ||
    item.previewUrl ||
    item.url ||
    item.preview?.url ||
    item.cover?.url ||
    item.thumbnails?.[0]?.url ||
    null
  );
}

/**
 * Get the main/full-quality variant URL (for modals and detail views).
 * @param {object} item — Fanvue media object
 * @returns {string|null}
 */
export function getMediaMainUrl(item) {
  if (!item) return null;
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const main =
    variants.find((v) => v.variantType === "main") ||
    variants.find((v) => v.variantType === "thumbnail_gallery") ||
    variants.find((v) => v.url);
  if (main?.url) return main.url;
  return getMediaThumbnail(item);
}

/**
 * Check if a media item is a video.
 */
export function isMediaVideo(item) {
  return item?.type === "video" || item?.mediaType === "video";
}

/**
 * Get PPV price in cents from a media item (if locked content).
 */
export function getMediaPriceCents(item) {
  return item?.pricing?.USD?.price || item?.priceCents || (item?.isLocked ? 0 : null);
}

/**
 * Format media price for display.
 */
export function formatMediaPrice(item) {
  const cents = getMediaPriceCents(item);
  if (cents == null) return null;
  return `$${(cents / 100).toFixed(2)}`;
}