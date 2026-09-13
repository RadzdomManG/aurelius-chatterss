import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { X, Save, Loader2 } from "lucide-react";
import VaultPicker from "@/components/inbox/VaultPicker";

const LADDER = [12, 15, 25, 50, 80, 150, 250, 300, 400];

export default function PpvSetComposer({ creatorProfileId, set, onClose, onSaved }) {
  const isEdit = !!set;
  const [name, setName] = React.useState(set?.name || "");
  const [description, setDescription] = React.useState(set?.description || "");
  const [tags, setTags] = React.useState(Array.isArray(set?.tags) ? set.tags : []);
  const [tagInput, setTagInput] = React.useState("");
  const [mediaUuids, setMediaUuids] = React.useState(set?.media_uuids || []);
  const [priceCents, setPriceCents] = React.useState(set?.suggested_price_cents || 1200);
  const [saving, setSaving] = React.useState(false);

  const valid = name.trim() && description.trim() && mediaUuids.length >= 1 && mediaUuids.length <= 5;

  const addTag = (raw) => {
    const t = raw.trim().toLowerCase().replace(/,/g, "").trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (t) => setTags((prev) => prev.filter((x) => x !== t));

  const handleTagKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleSave = async () => {
    if (!valid) {
      toast.error("Name, description, and 1–5 media items are required");
      return;
    }
    try {
      setSaving(true);
      const payload = {
        creator_profile_id: creatorProfileId,
        name: name.trim(),
        description: description.trim(),
        tags,
        media_uuids: mediaUuids,
        suggested_price_cents: priceCents,
        active: set?.active !== false,
      };
      if (isEdit) {
        await base44.entities.PpvContentSet.update(set.id, payload);
        toast.success("Content set updated");
      } else {
        await base44.entities.PpvContentSet.create(payload);
        toast.success("Content set created");
      }
      onSaved && onSaved();
      onClose && onClose();
    } catch (err) {
      toast.error("Failed to save set: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="font-heading text-2xl text-foreground">
          {isEdit ? "Edit content set" : "New content set"}
        </h2>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dildo vault folder"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Description <span className="text-xs font-normal text-muted-foreground">(the AI reads this to pick the set and write its teaser)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what's in this set — the vibe, the setting, what the fan sees. This is what the AI uses to match the fan's mood and to tease."
              rows={3}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Keyword tags <span className="text-xs font-normal text-muted-foreground">(the AI matches the fan's request to these first — e.g. "dildo", "couch", "car")</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-2 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={() => tagInput && addTag(tagInput)}
                placeholder={tags.length ? "" : "type a tag and press Enter"}
                className="min-w-[8rem] flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Suggested price <span className="text-xs font-normal text-muted-foreground">(the AI ladder is the final authority — this is a hint)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {LADDER.map((d) => {
                const cents = d * 100;
                const active = priceCents === cents;
                return (
                  <button
                    key={d}
                    onClick={() => setPriceCents(cents)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    ${d}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Locked content <span className="text-xs font-normal text-muted-foreground">(1–5 vault items)</span>
            </label>
            <div className="rounded-md border border-border">
              <VaultPicker
                creatorProfileId={creatorProfileId}
                selectedUuids={mediaUuids}
                onPick={(uuids) => setMediaUuids(uuids)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button
          onClick={onClose}
          className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!valid || saving}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isEdit ? "Save changes" : "Create set"}
        </button>
      </div>
    </div>
  );
}