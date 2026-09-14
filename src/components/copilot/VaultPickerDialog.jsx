import React from "react";
import { base44 } from "@/api/base44Client";
import { useCreator } from "@/lib/creator-context";
import { X, Check, FolderOpen, Loader2 } from "lucide-react";

export default function VaultPickerDialog({ open, onClose, onPick }) {
  const { selectedCreator } = useCreator();
  const [media, setMedia] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState(new Set());
  const [activeFolder, setActiveFolder] = React.useState(null);

  React.useEffect(() => {
    if (!open || !selectedCreator?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [mediaList, folderList] = await Promise.all([
          base44.entities.VaultMedia.filter({ creator_profile_id: selectedCreator.id }, "-created_date", 200),
          base44.entities.VaultFolder.filter({ creator_profile_id: selectedCreator.id }, "folder_name", 100),
        ]);
        if (cancelled) return;
        setMedia(Array.isArray(mediaList) ? mediaList : []);
        setFolders(Array.isArray(folderList) ? folderList : []);
      } catch (e) {
        if (!cancelled) { setMedia([]); setFolders([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, selectedCreator?.id]);

  if (!open) return null;

  const folderNames = Array.from(new Set(folders.map((f) => f.folder_name)));
  const filtered = activeFolder ? media.filter((m) => m.folder_name === activeFolder) : media;

  const toggle = (uuid) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const handleConfirm = () => {
    onPick(Array.from(selected));
    setSelected(new Set());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FolderOpen className="h-4 w-4 text-primary" /> Pick vault media
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Folder filter */}
        {folderNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-5 py-2.5">
            <button
              onClick={() => setActiveFolder(null)}
              className={`rounded-full px-2.5 py-1 text-xs ${!activeFolder ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              All
            </button>
            {folderNames.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFolder(f)}
                className={`rounded-full px-2.5 py-1 text-xs ${activeFolder === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                {f}
              </button>
            ))}
          </div>
        )}

        {/* Media grid */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No vault media found. Sync the vault on the Media page first.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {filtered.map((m) => {
                const uuid = m.external_uuid;
                const isSel = selected.has(uuid);
                return (
                  <button
                    key={m.id || uuid}
                    onClick={() => toggle(uuid)}
                    className={`group relative aspect-square overflow-hidden rounded-lg border-2 ${isSel ? "border-primary" : "border-transparent hover:border-border"}`}
                  >
                    {m.thumbnail_url ? (
                      <img src={m.thumbnail_url} alt={m.title || ""} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground text-xs">
                        {m.content_type === "video" ? "Video" : "Image"}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 truncate bg-black/50 px-1 py-0.5 text-[8px] text-white">
                      {m.folder_name || "—"}
                    </div>
                    {isSel && (
                      <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Attach {selected.size > 0 ? `(${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}