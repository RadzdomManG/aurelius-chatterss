import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Save } from "lucide-react";

const MODES = [
  { id: "off", label: "Off", description: "No AI responses. Messages still appear." },
  { id: "draft", label: "Draft", description: "AI generates drafts. You approve before sending." },
  { id: "full_auto", label: "Full Auto", description: "AI replies automatically. No approval needed." },
];

export default function ModelAutomation({ creator, autoSettings, onSaved }) {
  const [mode, setMode] = React.useState(creator.automation_mode || "off");
  const [settings, setSettings] = React.useState({
    enabled: autoSettings?.enabled ?? false,
    approval_required: autoSettings?.approval_required ?? true,
    quiet_hours_start: autoSettings?.quiet_hours_start || "23:00",
    quiet_hours_end: autoSettings?.quiet_hours_end || "08:00",
    max_replies_per_hour: autoSettings?.max_replies_per_hour ?? 20,
    min_confidence: autoSettings?.min_confidence ?? 0.7,
    ppv_allowed: autoSettings?.ppv_allowed ?? false,
    max_ppv_cents: autoSettings?.max_ppv_cents ?? 1000,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setMode(creator.automation_mode || "off");
    if (autoSettings) {
      setSettings({
        enabled: autoSettings.enabled,
        approval_required: autoSettings.approval_required,
        quiet_hours_start: autoSettings.quiet_hours_start || "23:00",
        quiet_hours_end: autoSettings.quiet_hours_end || "08:00",
        max_replies_per_hour: autoSettings.max_replies_per_hour || 20,
        min_confidence: autoSettings.min_confidence || 0.7,
        ppv_allowed: autoSettings.ppv_allowed ?? false,
        max_ppv_cents: autoSettings.max_ppv_cents || 1000,
      });
    }
  }, [creator, autoSettings]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await base44.entities.CreatorProfile.update(creator.id, { automation_mode: mode });
      if (autoSettings?.id) {
        await base44.entities.AutomationSettings.update(autoSettings.id, settings);
      } else {
        await base44.entities.AutomationSettings.create({ creator_profile_id: creator.id, ...settings });
      }
      toast.success("Automation settings saved");
      onSaved();
    } catch (err) {
      toast.error("Failed to save automation settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Mode selector */}
      <div>
        <label className="mb-3 block text-sm font-medium text-foreground">Automation Mode</label>
        <div className="grid grid-cols-3 gap-3">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`rounded-lg border p-4 text-left transition-all ${
                mode === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
              }`}
            >
              <p className="text-sm font-medium text-foreground">{m.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <ToggleRow label="Automation Enabled" value={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
        <ToggleRow label="Approval Required" value={settings.approval_required} onChange={(v) => setSettings({ ...settings, approval_required: v })} />
        <ToggleRow label="PPV Allowed" value={settings.ppv_allowed} onChange={(v) => setSettings({ ...settings, ppv_allowed: v })} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Quiet Hours Start</label>
            <input type="time" value={settings.quiet_hours_start} onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Quiet Hours End</label>
            <input type="time" value={settings.quiet_hours_end} onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Max Replies Per Hour</label>
            <input type="number" value={settings.max_replies_per_hour} onChange={(e) => setSettings({ ...settings, max_replies_per_hour: parseInt(e.target.value) || 20 })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Min Confidence</label>
            <input type="number" step="0.05" min="0" max="1" value={settings.min_confidence} onChange={(e) => setSettings({ ...settings, min_confidence: parseFloat(e.target.value) || 0.7 })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Max PPV (cents)</label>
          <input type="number" value={settings.max_ppv_cents} onChange={(e) => setSettings({ ...settings, max_ppv_cents: parseInt(e.target.value) || 1000 })}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
        </div>
      </div>

      <button onClick={handleSave} disabled={saving}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        <Save className="h-4 w-4" />
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <button onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}