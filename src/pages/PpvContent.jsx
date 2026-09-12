import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Plus, Lock, Loader2, PackageOpen } from "lucide-react";
import PpvSetCard from "@/components/ppv/PpvSetCard";
import PpvSetComposer from "@/components/ppv/PpvSetComposer";
import { useCreator } from "@/lib/creator-context";
import CreatorSelector from "@/components/shared/CreatorSelector";

export default function PpvContent() {
  const { selectedCreatorId: creatorId, loaded } = useCreator();
  const [sets, setSets] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [composerOpen, setComposerOpen] = React.useState(false);
  const [editingSet, setEditingSet] = React.useState(null);

  React.useEffect(() => {
    if (creatorId) loadSets(creatorId);
    else { setSets([]); setLoading(false); }
  }, [creatorId]);

  const loadSets = async (cid) => {
    try {
      setLoading(true);
      const list = await base44.entities.PpvContentSet.filter(
        { creator_profile_id: cid },
        "created_date",
        100
      );
      setSets(list);
    } catch (err) {
      setSets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setEditingSet(null);
    setComposerOpen(true);
  };

  const handleEdit = (set) => {
    setEditingSet(set);
    setComposerOpen(true);
  };

  const handleDelete = async (set) => {
    if (!window.confirm(`Delete "${set.name}"? The AI will no longer offer this set.`)) return;
    try {
      await base44.entities.PpvContentSet.delete(set.id);
      setSets((prev) => prev.filter((s) => s.id !== set.id));
      toast.success("Set deleted");
    } catch (err) {
      toast.error("Failed to delete set");
    }
  };

  const handleToggleActive = async (set) => {
    try {
      await base44.entities.PpvContentSet.update(set.id, { active: !set.active });
      setSets((prev) =>
        prev.map((s) => (s.id === set.id ? { ...s, active: !s.active } : s))
      );
    } catch (err) {
      toast.error("Failed to update set");
    }
  };

  const handleSaved = () => {
    if (creatorId) loadSets(creatorId);
  };

  const activeCount = sets.filter((s) => s.active).length;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">PPV Content</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Curate locked content bundles. The AI reads each set's description, picks the best match for the fan's mood, attaches the media, and teases it — never repeating a set to the same fan.
            </p>
          </div>
          <CreatorSelector />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-warning" />
            {sets.length} set{sets.length === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>{activeCount} active</span>
        </div>
        <button
          onClick={handleNew}
          disabled={!creatorId}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          New set
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sets.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <PackageOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <h3 className="font-heading text-xl text-foreground">No content sets yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Build your first locked bundle — pick 1–5 vault items, describe what's inside, and set a suggested price. The AI will offer it when a fan heats up.
            </p>
            <button
              onClick={handleNew}
              className="mt-4 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Create your first set
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((set) => (
              <PpvSetCard
                key={set.id}
                set={set}
                creatorProfileId={creatorId}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleActive={handleToggleActive}
              />
            ))}
          </div>
        )}
      </div>

      {/* Composer slide-over */}
      {composerOpen && creatorId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setComposerOpen(false)}
          />
          <div className="relative h-full w-full max-w-lg bg-background shadow-xl">
            <PpvSetComposer
              creatorProfileId={creatorId}
              set={editingSet}
              onClose={() => setComposerOpen(false)}
              onSaved={handleSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}