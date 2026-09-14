import React from "react";
import { base44 } from "@/api/base44Client";
import { Send, ImagePlus, FolderOpen, Loader2, X } from "lucide-react";
import VaultPickerDialog from "./VaultPickerDialog";

export default function CopilotComposer({ onSend, disabled }) {
  const [text, setText] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [vaultPickerOpen, setVaultPickerOpen] = React.useState(false);
  const [pendingUploads, setPendingUploads] = React.useState([]); // [{ url, name }]
  const [pendingVaultUuids, setPendingVaultUuids] = React.useState([]); // string[]
  const fileInputRef = React.useRef(null);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploaded = [];
      for (const file of files) {
        try {
          const res = await base44.integrations.Core.UploadPublicFile({ file });
          if (res?.file_url) {
            uploaded.push({ url: res.file_url, name: file.name });
          }
        } catch (err) {
          console.error("Upload failed:", err);
        }
      }
      setPendingUploads((prev) => [...prev, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removeUpload = (idx) => {
    setPendingUploads((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeVaultUuid = (idx) => {
    setPendingVaultUuids((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleVaultPick = (uuids) => {
    setPendingVaultUuids((prev) => [...prev, ...uuids]);
  };

  const handleSubmit = () => {
    if (!text.trim() && pendingUploads.length === 0 && pendingVaultUuids.length === 0) return;
    onSend(text.trim(), pendingUploads.map((u) => u.url), pendingVaultUuids);
    setText("");
    setPendingUploads([]);
    setPendingVaultUuids([]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const hasPending = pendingUploads.length > 0 || pendingVaultUuids.length > 0;

  return (
    <>
      <div className="border-t border-border bg-card p-3">
        {/* Pending attachments preview */}
        {hasPending && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pendingUploads.map((u, i) => (
              <div key={i} className="relative">
                <img src={u.url} alt={u.name} className="h-14 w-14 rounded-md border border-border object-cover" />
                <button
                  onClick={() => removeUpload(i)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
            {pendingVaultUuids.map((uuid, i) => (
              <div key={`v-${i}`} className="relative flex h-14 w-14 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
                <FolderOpen className="h-5 w-5 text-primary" />
                <span className="absolute bottom-0 left-0 right-0 truncate bg-primary/20 px-1 text-[8px] text-primary-foreground">{uuid.slice(0, 8)}</span>
                <button
                  onClick={() => removeVaultUuid(i)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="flex items-end gap-1.5">
          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-primary disabled:opacity-50"
            title="Upload image"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Vault picker button */}
          <button
            onClick={() => setVaultPickerOpen(true)}
            disabled={disabled}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-primary disabled:opacity-50"
            title="Pick from vault"
          >
            <FolderOpen className="h-4 w-4" />
          </button>

          {/* Text input */}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Tell me what to do…"
            rows={1}
            className="max-h-32 min-h-[36px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            style={{ height: "auto" }}
          />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || (!text.trim() && !hasPending)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
      <VaultPickerDialog open={vaultPickerOpen} onClose={() => setVaultPickerOpen(false)} onPick={handleVaultPick} />
    </>
  );
}