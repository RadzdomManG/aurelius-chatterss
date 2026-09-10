import React from "react";
import { toast } from "sonner";
import { FileText, FolderPlus, Trash2, Plus } from "lucide-react";
import { fanvueCall, useConnection } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";

export default function Templates() {
  const { connection, loading: loadingConn } = useConnection();
  const [templates, setTemplates] = React.useState([]);
  const [folders, setFolders] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [folderUuid, setFolderUuid] = React.useState("");
  const [newFolder, setNewFolder] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const [t, f] = await Promise.all([
        fanvueCall("listTemplateMessagesV1", { query: { size: 100 } }),
        fanvueCall("listTemplateFoldersV1", { query: { size: 100 } }),
      ]);
      setTemplates(t?.data?.data || []);
      setFolders(f?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  React.useEffect(() => { load(); }, [load]);

  const createFolder = async () => {
    if (!newFolder.trim()) return;
    try {
      await fanvueCall("createTemplateFolder", { data: { name: newFolder.trim() } });
      setNewFolder("");
      toast.success("Folder created");
      await load();
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  const saveTemplate = async () => {
    if (!text.trim()) return;
    try {
      setSaving(true);
      await fanvueCall("upsertTemplateMessage", {
        data: { name: name.trim() || null, text: text.trim(), price: 0, folderUuid: folderUuid || null },
      });
      setName(""); setText(""); setFolderUuid(""); setShowForm(false);
      toast.success("Template saved");
      await load();
    } catch (e) { toast.error(e?.error || "Failed"); }
    finally { setSaving(false); }
  };

  const remove = async (uuid) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await fanvueCall("deleteTemplateMessage", { params: { templateUuid: uuid }, confirm: true });
      setTemplates((prev) => prev.filter((t) => t.uuid !== uuid));
      toast.success("Deleted");
    } catch (e) { toast.error(e?.error || "Failed"); }
  };

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={FileText} title="Connect Fanvue" description="Connect a Fanvue account to manage message templates." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:chat")) return <div className="h-full p-8"><ScopeGate missing={["read:chat", "write:chat"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">Templates</h1>
            <p className="text-sm text-muted-foreground">Reusable message templates and folders</p>
          </div>
          <button onClick={() => setShowForm((s) => !s)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New template
          </button>
        </div>

        {showForm && (
          <div className="mb-6 space-y-3 rounded-lg border border-border bg-card p-4">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (optional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Message text…" rows={3} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
            <div className="flex flex-wrap items-center gap-2">
              <select value={folderUuid} onChange={(e) => setFolderUuid(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground">
                <option value="">No folder</option>
                {folders.map((f) => <option key={f.uuid} value={f.uuid}>{f.name}</option>)}
              </select>
              <button onClick={saveTemplate} disabled={saving || !text.trim()} className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Save</button>
            </div>
          </div>
        )}

        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-medium text-foreground">Folders</h3>
          <div className="flex flex-wrap gap-2">
            {folders.map((f) => <span key={f.uuid} className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">{f.name}</span>)}
            {folders.length === 0 && <span className="text-xs text-muted-foreground">No folders yet.</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder name" className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground" />
            <button onClick={createFolder} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-accent"><FolderPlus className="h-4 w-4" /> Add</button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : templates.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No templates yet.</div>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.uuid} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{t.name || "Untitled"}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.text}</p>
                  {t.folderName && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t.folderName}</span>}
                </div>
                <button onClick={() => remove(t.uuid)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}