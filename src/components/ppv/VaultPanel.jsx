import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { RefreshCw, Loader2, Folder, Check, Film, Image as ImageIcon, Lock } from "lucide-react";
import { useCreator } from "@/lib/creator-context";

/**
 * VaultPanel — syncs the connected creator's Fanvue vault into local
 * VaultFolder + VaultMedia entities, lets the operator approve folders for
 * automatic-vault PPV selection, and browses synced media.
 */
export default function VaultPanel() {
  const { selectedCreatorId: creatorId } = useCreator();
  const [folders, setFolders] = React.useState([]);
  const [media, setMedia] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [activeFolder, setActiveFolder] = React.useState(null);
  const [imgErrors, setImgErrors] = React.useState({});

  const load = React.useCallback(async () => {
    if (!creatorId) { setFolders([]); setMedia([]); setLoading(false); return; }
    try {
      setLoading(true);
      const [folderList, mediaList] = await Promise.all([
        base44.entities.VaultFolder.filter({ creator_profile_id: creatorId }, "created_date", 200),
        base44.entities.VaultMedia.filter({ creator_profile_id: creatorId }, "created_date", 200),
      ]);
      const eligibleMedia = (mediaList || []).filter((m) => m.eligible_for_paid_ppv === true);
      // Per-folder eligible (locked) counts — folder media_count is the TOTAL
      // vault count; the PPV view counts ONLY locked content. Free media is
      // completely excluded from this view and from all counts.
      const eligibleByFolder = {};
      for (const m of eligibleMedia) eligibleByFolder[m.folder_name] = (eligibleByFolder[m.folder_name] || 0) + 1;
      const sorted = (folderList || [])
        .map((f) => ({ ...f, eligible_count: eligibleByFolder[f.folder_name] || 0 }))
        .sort((a, b) => (b.eligible_count || 0) - (a.eligible_count || 0));
      setFolders(sorted);
      setMedia(eligibleMedia);
      if (!activeFolder && sorted.length > 0 && sorted[0].eligible_count > 0) setActiveFolder(sorted[0].folder_name);
    } catch (e) {
      setFolders([]); setMedia([]);
    } finally {
      setLoading(false);
    }
  }, [creatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { load(); }, [creatorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = async () => {
    if (!creatorId) return;
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("fanvue-vault-sync", { creatorProfileId: creatorId });
      if (res?.data?.success) {
        toast.success(`Synced ${res.data.mediaSynced} media across ${res.data.folders?.length || 0} folder(s)${res.data.moreAvailable ? " — more available, sync again" : ""}`);
        await load();
      } else if (res?.data?.needsReconnect) {
        toast.error("Reconnect Fanvue (read:media scope required)");
      } else {
        toast.error(res?.data?.error || "Vault sync failed");
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || "Vault sync failed";
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  const toggleApproved = async (folder) => {
    try {
      await base44.entities.VaultFolder.update(folder.id, { approved: !folder.approved });
      setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, approved: !f.approved } : f)));
      toast.success(`${folder.folder_name} ${folder.approved ? "disapproved" : "approved"} for automatic PPV`);
    } catch (e) {
      toast.error("Failed to update folder");
    }
  };

  const approvedCount = folders.filter((f) => f.approved).length;
  const visibleMedia = activeFolder ? media.filter((m) => m.folder_name === activeFolder) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-warning" />
            <h2 className="font-heading text-lg text-foreground">Automatic PPV Media</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Locked content only</span>
          </div>
          <span className="text-xs text-muted-foreground">
            Eligible locked media: <strong className="text-foreground">{media.length}</strong> · {folders.length} folder{folders.length === 1 ? "" : "s"} · {approvedCount} approved
          </span>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || !creatorId}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {syncing ? "Syncing…" : "Sync vault"}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : folders.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Folder className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <h3 className="font-heading text-xl text-foreground">Vault not synced yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Sync your Fanvue vault to import folders and media. Then approve the folders the AI may pull from for automatic PPV offers.
          </p>
          <button
            onClick={handleSync}
            disabled={syncing || !creatorId}
            className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Sync now
          </button>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Folder list */}
          <div className="w-64 shrink-0 overflow-y-auto scrollbar-thin border-r border-border px-3 py-3">
            <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Folders</p>
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => setActiveFolder(f.folder_name)}
                className={`mb-1 flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors ${
                  activeFolder === f.folder_name ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{f.folder_name}</span>
                  <span className="text-xs text-muted-foreground">{f.eligible_count || 0} locked item{(f.eligible_count || 0) === 1 ? "" : "s"}</span>
                </span>
                <span
                  onClick={(e) => { e.stopPropagation(); toggleApproved(f); }}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                    f.approved ? "border-success bg-success text-success-foreground" : "border-border text-muted-foreground hover:border-success"
                  }`}
                  title={f.approved ? "Approved for auto PPV — click to remove" : "Click to approve for auto PPV"}
                >
                  {f.approved && <Check className="h-3 w-3" />}
                </span>
              </button>
            ))}
          </div>

          {/* Media grid */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
            <div className="mb-3 flex items-center gap-2">
              <Lock className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-foreground">{activeFolder || "Select a folder"}</span>
              <span className="text-xs text-muted-foreground">{visibleMedia.length} locked item{visibleMedia.length === 1 ? "" : "s"}</span>
            </div>
            {visibleMedia.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No locked PPV-eligible media in this folder — free content is hidden from automatic PPV.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {visibleMedia.map((m) => {
                  const key = m.id || m.external_uuid;
                  const isVideo = m.content_type === "video";
                  return (
                    <div key={key} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                      {m.thumbnail_url && !imgErrors[key] ? (
                        <img src={m.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover"
                          onError={() => setImgErrors((p) => ({ ...p, [key]: true }))} />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          {isVideo ? <Film className="h-5 w-5 text-muted-foreground/50" /> : <ImageIcon className="h-5 w-5 text-muted-foreground/50" />}
                        </div>
                      )}
                      {isVideo && (
                        <div className="absolute right-1 top-1 rounded bg-black/50 px-1 text-[10px] text-white">
                          {m.duration_seconds ? `${Math.round(m.duration_seconds)}s` : "video"}
                        </div>
                      )}
                      {m.title && (
                        <div className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-[11px] text-white">
                          {m.title}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}