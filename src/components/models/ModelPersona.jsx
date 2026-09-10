import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function ModelPersona({ creator, persona, onSaved }) {
  const [displayName, setDisplayName] = React.useState(persona?.display_name || "");
  const [instructions, setInstructions] = React.useState(persona?.instructions || "");
  const [active, setActive] = React.useState(persona?.active ?? true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setDisplayName(persona?.display_name || "");
    setInstructions(persona?.instructions || "");
    setActive(persona?.active ?? true);
  }, [persona]);

  const handleSave = async () => {
    try {
      setSaving(true);
      if (persona?.id) {
        await base44.entities.PersonaProfile.update(persona.id, {
          display_name: displayName,
          instructions,
          active,
        });
      } else {
        await base44.entities.PersonaProfile.create({
          creator_profile_id: creator.id,
          display_name: displayName || `${creator.display_name} Default`,
          instructions,
          active: true,
        });
      }
      toast.success("Persona saved");
      onSaved();
    } catch (err) {
      toast.error("Failed to save persona");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Persona Name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Aurelia Default"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Persona Instructions</label>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={12}
          placeholder="Describe the creator's personality, tone, speaking style, emoji usage, boundaries, conversation behavior, and reply length..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          This persona controls how the AI replies on behalf of this creator. Be specific about tone, style, and boundaries.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Active Persona</p>
          <p className="text-xs text-muted-foreground">Only one persona should be active per creator</p>
        </div>
        <button
          onClick={() => setActive(!active)}
          className={`relative h-6 w-11 rounded-full transition-colors ${active ? "bg-primary" : "bg-muted"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${active ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Persona"}
      </button>
    </div>
  );
}