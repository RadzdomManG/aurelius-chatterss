import React from "react";
import { getMediaThumbnail, isMediaVideo } from "@/lib/vault-utils";
import { getVaultMediaMap } from "@/lib/vault-media-cache";
import { Film, ImageIcon, Lock, Pencil, Trash2, Check, X } from "lucide-react";

function MediaStrip({ mediaUuids, creatorProfileId }) {
  const [map, setMap] = React.useState(null);
  React.useEffect(() => {
    let active = true;
    getVaultMediaMap(creatorProfileId).then((m) => {
      if (active) setMap(m);
    });
    return () => {
      active = false;
    };
  }, [creatorProfileId]);

  if (!Array.isArray(mediaUuids) || mediaUuids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {mediaUuids.map((uuid, i) => {
        const item = (map && map.get(uuid)) || { uuid };
        const thumb = getMediaThumbnail(item);
        const video = isMediaVideo(item);
        return (
          <div
            key={uuid || i}
            className="relative h-16 w-16 overflow-hidden rounded-md border border-border/50 bg-muted"
          >
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {video ? (
                  <Film className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PpvSetCard({ set, creatorProfileId, onEdit, onDelete, onToggleActive }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-heading text-lg text-foreground">{set.name}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {set.description || "No description"}
          </p>
          {Array.isArray(set.tags) && set.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {set.tags.map((t) => (
                <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onEdit(set)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Edit set"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(set)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
            title="Delete set"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <MediaStrip mediaUuids={set.media_uuids} creatorProfileId={creatorProfileId} />

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Lock className="h-3.5 w-3.5 text-warning" />
          ${(set.suggested_price_cents / 100).toFixed(2)}
          <span className="text-xs font-normal text-muted-foreground">suggested</span>
        </span>
        <button
          onClick={() => onToggleActive(set)}
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
            set.active
              ? "bg-success/15 text-success"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {set.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {set.active ? "Active" : "Inactive"}
        </button>
      </div>
    </div>
  );
}