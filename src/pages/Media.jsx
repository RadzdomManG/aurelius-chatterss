import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Image as ImageIcon, Film, Folder, Plug, Download, Lock, DollarSign, ShieldAlert } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import StatusBadge from "@/components/shared/StatusBadge";

/**
 * Extract thumbnail URL from Fanvue media object.
 * Fanvue returns a `variants` array — each variant has variantType + url.
 * Priority: thumbnail > thumbnail_gallery > main > any variant with url.
 * Fallbacks for non-standard shapes (preview, cover, etc.).
 */
function getThumbnail(item) {
  const variants = Array.isArray(item.variants) ? item.variants : [];
  const thumb =
    variants.find((v) => v.variantType === "thumbnail") ||
    variants.find((v) => v.variantType === "thumbnail_gallery") ||
    variants.find((v) => v.variantType === "main") ||
    variants.find((v) => v.url);
  if (thumb?.url) return thumb.url;
  // Legacy fallbacks
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

export default function Media() {
  const [hasConnection, setHasConnection] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [mediaItems, setMediaItems] = React.useState([]);
  const [fetching, setFetching] = React.useState(false);
  const [creator, setCreator] = React.useState(null);
  const [nextCursor, setNextCursor] = React.useState(null);
  const [needsReconnect, setNeedsReconnect] = React.useState(false);
  const [ageVerification, setAgeVerification] = React.useState(false);
  const [grantedScopes, setGrantedScopes] = React.useState([]);

  React.useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const [conns, creators] = await Promise.all([
        base44.entities.FanvueConnection.list("-created_date", 10),
        base44.entities.CreatorProfile.list("-created_date", 10),
      ]);
      const connected = conns.find((c) => c.status === "connected");
      setHasConnection(!!connected);
      setCreator(creators.find((c) => c.id === connected?.creator_profile_id) || creators[0] || null);
      setGrantedScopes(connected?.granted_scopes || []);

      if (connected) {
        await fetchMedia(connected.creator_profile_id, null, true);
      }
    } catch (err) {
      console.error("Failed to check connection:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMedia = async (creatorProfileId, cursor = null, replace = false) => {
    try {
      setFetching(true);
      const res = await base44.functions.invoke("fanvue-media", {
        creatorProfileId,
        cursor,
        size: 50,
      });
      if (res.data?.success) {
        const newItems = res.data.data || [];
        setMediaItems((prev) => (replace || !cursor ? newItems : [...prev, ...newItems]));
        setNextCursor(res.data.nextCursor || null);
      } else if (res.data?.needsReconnect) {
        setNeedsReconnect(true);
      } else if (res.data?.ageVerification) {
        setAgeVerification(true);
      } else {
        toast.error(res.data?.error || "Failed to load media");
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || "";
      if (msg.includes("Insufficient scopes") || msg.includes("reconnect")) {
        setNeedsReconnect(true);
      } else if (msg.includes("age_verification")) {
        setAgeVerification(true);
      } else {
        toast.error("Failed to load media: " + msg);
      }
    } finally {
      setFetching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!hasConnection) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={Plug} title="Connect Fanvue to view media" description="Media and vault content are loaded from the Fanvue API (read:media scope). Connect a creator account to begin." actionLabel="Go to Models" actionTo="/models" />
      </div>
    );
  }

  if (needsReconnect) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 mx-auto">
            <Lock className="h-7 w-7 text-warning" />
          </div>
          <h3 className="mb-1.5 font-heading text-lg text-foreground">Reconnect Fanvue to access media</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Your current connection was made before the <code className="rounded bg-muted px-1">read:media</code> scope was added.
            Reconnect to grant media access and unlock the vault.
          </p>
          <p className="mb-4 text-xs text-muted-foreground">
            Current scopes: {grantedScopes.length > 0 ? grantedScopes.join(", ") : "none"}
          </p>
          <Link to="/models" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Go to Models <Download className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (ageVerification) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 mx-auto">
            <ShieldAlert className="h-7 w-7 text-warning" />
          </div>
          <h3 className="mb-1.5 font-heading text-lg text-foreground">Age verification required</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Fanvue requires age verification before media can be displayed in your region.
            Complete age verification on Fanvue, then refresh this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="mb-1 font-heading text-3xl text-foreground">Media</h1>
            <p className="text-sm text-muted-foreground">
              {creator ? `${creator.display_name}'s vault and media content` : "Fanvue creator media and vault content"}
            </p>
            {grantedScopes.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground/70">
                Scopes: {grantedScopes.join(", ")}
              </p>
            )}
          </div>
          {creator && (
            <button
              onClick={() => fetchMedia(creator.id, null, true)}
              disabled={fetching}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              <Download className={`h-4 w-4 ${fetching ? "animate-bounce" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {fetching && mediaItems.length === 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg border border-border bg-muted" />
            ))}
          </div>
        ) : mediaItems.length > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {mediaItems.map((item) => (
                <MediaCard key={item.uuid || item.id} item={item} />
              ))}
            </div>
            {nextCursor && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => fetchMedia(creator.id, nextCursor)}
                  disabled={fetching}
                  className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-50"
                >
                  Load More
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Folder className="mx-auto mb-3 h-12 w-12 text-muted-foreground/40" />
            <h3 className="mb-1 font-heading text-lg text-foreground">No media found</h3>
            <p className="text-sm text-muted-foreground">
              No ready media items were returned from the Fanvue API. Make sure your connected account has vault content and the <code className="rounded bg-muted px-1">read:media</code> scope was granted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaCard({ item }) {
  const [imgError, setImgError] = React.useState(false);
  const isVideo = item.type === "video" || item.mediaType === "video";
  const thumb = getThumbnail(item);
  const isPpv = item.pricing?.USD?.price || item.priceCents || item.isLocked;
  const status = item.status || "ready";

  return (
    <div className="group relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-square">
        {thumb && !imgError && status === "ready" ? (
          <img
            src={thumb}
            alt={item.title || item.name || "Media"}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted">
            {imgError ? (
              <>
                <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground/60">Preview unavailable</span>
              </>
            ) : isVideo ? (
              <Film className="h-8 w-8 text-muted-foreground/50" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>
        )}
        {isVideo && thumb && !imgError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
              <Film className="h-5 w-5 text-white" />
            </div>
          </div>
        )}
        {isPpv && (
          <div className="absolute right-2 top-2">
            <StatusBadge variant="warning" label="PPV" />
          </div>
        )}
        {status !== "ready" && (
          <div className="absolute left-2 top-2">
            <StatusBadge variant="neutral" label={status} dot={false} />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-foreground">{item.title || item.name || "Untitled"}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {isPpv ? (
            <span className="inline-flex items-center gap-1 text-warning">
              <DollarSign className="h-3 w-3" />
              {((item.pricing?.USD?.price || item.priceCents || 0) / 100).toFixed(2)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Free
            </span>
          )}
          {item.purchaseCount > 0 && (
            <span>· {item.purchaseCount} purchases</span>
          )}
        </div>
      </div>
    </div>
  );
}