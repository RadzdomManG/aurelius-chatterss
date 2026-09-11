import React from "react";
import { base44 } from "@/api/base44Client";
import { Image as ImageIcon, Film, Lock, X, Check, Loader2, ShieldAlert } from "lucide-react";

/**
 * Extract thumbnail URL from Fanvue media object.
 * Fanvue returns a `variants` array — each variant has variantType + url.
 * Priority: thumbnail > thumbnail_gallery > main > any variant with url.
 */
function getMediaThumbnail(item) {
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
    null
  );
}

/**
 * Vault media picker for the message composer. Loads the creator's media
 * via the fanvue-media backend function (which requests variants=thumbnail,main).
 * Thumbnails render from the variants array returned by the v1 API.
 */
export default function VaultPicker({ creatorProfileId, selectedUuid, onPick }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [imgErrors, setImgErrors] = React.useState({});

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await base44.functions.invoke("fanvue-media", {
        creatorProfileId,
        size: 50,
      });
      if (res.data?.success) {
        setItems(res.data.data || []);
      } else if (res.data?.needsReconnect) {
        setError("Reconnect Fanvue (read:media scope required)");
      } else if (res.data?.ageVerification) {
        setError("Age verification required on Fanvue");
      } else {
        setError(res.data?.error || "Failed to load vault");
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || "Failed to load vault";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [creatorProfileId]);

  React.useEffect(() => {
    if (open && items.length === 0 && !loading && !error) load();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedItem = items.find((i) => i.uuid === selectedUuid) || null;

  const renderThumb = (item, size = "h-full w-full") => {
    const thumb = getMediaThumbnail(item);
    const key = item.uuid || item.id;
    if (thumb && !imgErrors[key]) {
      return (
        <img
          src={thumb}
          alt=""
          className={`${size} object-cover`}
          loading="lazy"
          onError={() => setImgErrors((prev) => ({ ...prev, [key]: true }))}
        />
      );
    }
    return (
      <div className={`flex ${size} items-center justify-center bg-muted`}>
        {imgErrors[key] ? (
          <ShieldAlert className="h-4 w-4 text-muted-foreground/50" />
        ) : item.type === "video" ? (
          <Film className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    );
  };

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Lock className="h-3.5 w-3.5 text-warning" />
          Locked content
        </span>
        {selectedItem && (
          <button
            onClick={() => onPick(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        )}
      </div>

      {selectedItem ? (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 p-2">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded">
            {renderThumb(selectedItem)}
          </div>
          <span className="flex-1 truncate text-sm text-foreground">
            {selectedItem.title || selectedItem.name || "Locked media"}
          </span>
          <Check className="h-4 w-4 text-success" />
        </div>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          {loading ? "Loading vault…" : "Pick from vault"}
        </button>
      )}

      {open && !selectedItem && (
        <div className="mt-2">
          {error ? (
            <p className="px-1 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto scrollbar-thin sm:grid-cols-6">
              {items.map((item) => (
                <button
                  key={item.uuid || item.id}
                  onClick={() => {
                    onPick(item.uuid, item);
                    setOpen(false);
                  }}
                  className="group relative aspect-square overflow-hidden rounded border border-border hover:border-primary"
                  title={item.title || item.name || "Media"}
                >
                  {renderThumb(item)}
                  <div className="absolute inset-0 flex items-center justify-center bg-primary/0 opacity-0 transition group-hover:bg-primary/20 group-hover:opacity-100">
                    <Check className="h-4 w-4 text-white drop-shadow" />
                  </div>
                </button>
              ))}
              {items.length === 0 && !loading && (
                <p className="col-span-full py-3 text-center text-xs text-muted-foreground">
                  No media in vault
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}