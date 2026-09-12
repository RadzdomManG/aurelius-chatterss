import React from "react";
import { getMediaThumbnail, isMediaVideo } from "@/lib/vault-utils";
import { getVaultMediaMap } from "@/lib/vault-media-cache";
import { Film, ImageIcon } from "lucide-react";
import { Image } from "@/components/ui/image";

/**
 * Renders a message's attached media as a thumbnail strip.
 * `media` is an array of Fanvue vault UUIDs; we resolve them to thumbnails
 * via the shared vault-media cache (one fetch per creator).
 */
export default function MessageMedia({ mediaUuids, creatorProfileId }) {
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
    <div className="mb-1 flex flex-wrap gap-1.5">
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
              <Image
                src={thumb}
                alt=""
                fittingType="fill"
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                {video ? (
                  <Film className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            )}
            {video && (
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/55 px-1 text-[8px] font-medium text-white">
                VIDEO
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}