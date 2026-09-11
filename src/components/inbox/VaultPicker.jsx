import React from "react";
import { base44 } from "@/api/base44Client";
import { getMediaThumbnail, isMediaVideo } from "@/lib/vault-utils";
import { Image as ImageIcon, Film, Lock, X, Check, Loader2, ShieldAlert } from "lucide-react";

/**
 * Vault media picker with MULTI-SELECT support. Loads the creator's media
 * via the fanvue-media backend function. Thumbnails render from the
 * canonical getMediaThumbnail() resolver in vault-utils.js.
 *
 * Props:
 *   selectedUuids: string[] — currently selected media UUIDs
 *   onPick: (uuids: string[], items: object[]) => void
 */
export default function VaultPicker({ creatorProfileId, selectedUuids = [], onPick }) {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [imgErrors, setImgErrors] = React.useState({});

  const selectedSet = React.useMemo(() => new Set(selectedUuids), [selectedUuids]);

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

  const toggleItem = (item) => {
    const uuid = item.uuid;
    const isSelected = selectedSet.has(uuid);
    let newUuids, newItems;
    if (isSelected) {
      newUuids = selectedUuids.filter((u) => u !== uuid);
    } else {
      newUuids = [...selectedUuids, uuid];
    }
    const selectedItems = items.filter((i) => newUuids.includes(i.uuid));
    onPick(newUuids, selectedItems);
  };

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
        ) : isMediaVideo(item) ? (
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
          {selectedUuids.length > 0 && (
            <span className="ml-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-medium text-warning">
              {selectedUuids.length} selected
            </span>
          )}
        </span>
        {selectedUuids.length > 0 && (
          <button
            onClick={() => onPick([], [])}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected items preview */}
      {selectedUuids.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedUuids.map((uuid) => {
            const item = items.find((i) => i.uuid === uuid);
            return (
              <div key={uuid} className="relative h-12 w-12 overflow-hidden rounded border border-warning/30">
                {item ? renderThumb(item, "h-full w-full") : (
                  <div className="flex h-full w-full items-center justify-center bg-muted">
                    <Check className="h-4 w-4 text-warning" />
                  </div>
                )}
                <button
                  onClick={() => toggleItem(item || { uuid })}
                  className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center bg-destructive text-white"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Picker toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImageIcon className="h-3.5 w-3.5" />
        )}
        {loading ? "Loading vault…" : selectedUuids.length > 0 ? "Pick more from vault" : "Pick from vault"}
      </button>

      {open && (
        <div className="mt-2">
          {error ? (
            <p className="px-1 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto scrollbar-thin sm:grid-cols-6">
              {items.map((item) => {
                const isSelected = selectedSet.has(item.uuid);
                return (
                  <button
                    key={item.uuid || item.id}
                    onClick={() => toggleItem(item)}
                    className={`group relative aspect-square overflow-hidden rounded border transition ${
                      isSelected ? "border-warning ring-1 ring-warning" : "border-border hover:border-primary"
                    }`}
                    title={item.title || item.name || "Media"}
                  >
                    {renderThumb(item)}
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center bg-warning/30">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-warning">
                          <Check className="h-3 w-3 text-warning-foreground" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
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