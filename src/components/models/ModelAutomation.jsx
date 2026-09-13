import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Save, Square, FileEdit, Play } from "lucide-react";

const MODES = [
  { id: "off", label: "Stopped", icon: Square, description: "No AI responses. Fan messages still sync and appear in the Inbox." },
  { id: "draft", label: "Draft", icon: FileEdit, description: "AI generates reply drafts for your approval before sending." },
  { id: "full_auto", label: "Running", icon: Play, description: "AI replies automatically — no approval needed. Use with a reviewed persona." },
];

const PPV_TIERS = [1200, 1500, 2500, 5000, 8000, 15000, 25000, 30000, 40000];
const fmtTier = (c) => `$${(c / 100).toFixed(0)}`;

export default function ModelAutomation({ creator, autoSettings, onSaved }) {
  const [mode, setMode] = React.useState(creator.automation_mode || "off");
  const [settings, setSettings] = React.useState({
    enabled: autoSettings?.enabled ?? true,
    approval_required: autoSettings?.approval_required ?? true,
    max_replies_per_hour: autoSettings?.max_replies_per_hour ?? 20,
    min_confidence: autoSettings?.min_confidence ?? 0.7,
    ppv_allowed: autoSettings?.ppv_allowed ?? true,
    max_ppv_cents: autoSettings?.max_ppv_cents ?? 40000,
    default_ppv_cents: autoSettings?.default_ppv_cents ?? 1200,
    ppv_ladder_enabled: autoSettings?.ppv_ladder_enabled ?? [...PPV_TIERS],
    ppv_min_messages_between_offers: autoSettings?.ppv_min_messages_between_offers ?? 5,
    ppv_min_minutes_between_offers: autoSettings?.ppv_min_minutes_between_offers ?? 10,
    ppv_warmup_messages: autoSettings?.ppv_warmup_messages ?? 3,
    ppv_reoffer_days: autoSettings?.ppv_reoffer_days ?? 2,
    ppv_source: autoSettings?.ppv_source ?? "curated_sets",
    vault_media_per_offer: autoSettings?.vault_media_per_offer ?? 3,
    active_hours_enabled: autoSettings?.active_hours_enabled ?? false,
    active_hours_start: autoSettings?.active_hours_start ?? "09:00",
    active_hours_end: autoSettings?.active_hours_end ?? "23:00",
    rescue_enabled: autoSettings?.rescue_enabled ?? true,
    rescue_discount_cents: autoSettings?.rescue_discount_cents ?? 500,
    rescue_min_delay_minutes: autoSettings?.rescue_min_delay_minutes ?? 5,
    rescue_max_delay_minutes: autoSettings?.rescue_max_delay_minutes ?? 10,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setMode(creator.automation_mode || "off");
    if (autoSettings) {
      setSettings({
        enabled: autoSettings.enabled ?? true,
        approval_required: autoSettings.approval_required ?? true,
        max_replies_per_hour: autoSettings.max_replies_per_hour || 20,
        min_confidence: autoSettings.min_confidence || 0.7,
        ppv_allowed: autoSettings.ppv_allowed ?? true,
        max_ppv_cents: autoSettings.max_ppv_cents || 40000,
        default_ppv_cents: autoSettings.default_ppv_cents || 1200,
        ppv_ladder_enabled: autoSettings.ppv_ladder_enabled ?? [...PPV_TIERS],
        ppv_min_messages_between_offers: autoSettings.ppv_min_messages_between_offers ?? 5,
        ppv_min_minutes_between_offers: autoSettings.ppv_min_minutes_between_offers ?? 10,
        ppv_warmup_messages: autoSettings.ppv_warmup_messages ?? 3,
        ppv_reoffer_days: autoSettings.ppv_reoffer_days ?? 2,
        ppv_source: autoSettings.ppv_source ?? "curated_sets",
        vault_media_per_offer: autoSettings.vault_media_per_offer ?? 3,
        active_hours_enabled: autoSettings.active_hours_enabled ?? false,
        active_hours_start: autoSettings.active_hours_start ?? "09:00",
        active_hours_end: autoSettings.active_hours_end ?? "23:00",
        rescue_enabled: autoSettings.rescue_enabled ?? true,
        rescue_discount_cents: autoSettings.rescue_discount_cents ?? 500,
        rescue_min_delay_minutes: autoSettings.rescue_min_delay_minutes ?? 5,
        rescue_max_delay_minutes: autoSettings.rescue_max_delay_minutes ?? 10,
      });
    }
  }, [creator, autoSettings]);

  const toggleTier = (cents) => {
    setSettings((s) => {
      const has = (s.ppv_ladder_enabled || []).includes(cents);
      let next = has ? (s.ppv_ladder_enabled || []).filter((c) => c !== cents) : [...(s.ppv_ladder_enabled || []), cents];
      next.sort((a, b) => a - b);
      if (next.length === 0) next = [1200]; // never empty — $12 is the floor
      return { ...s, ppv_ladder_enabled: next };
    });
  };

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
          {MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`rounded-lg border p-4 text-left transition-all ${
                  mode === m.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${mode === m.id ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium text-foreground">{m.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Settings */}
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        <ToggleRow label="Approval Required (Draft mode)" value={settings.approval_required} onChange={(v) => setSettings({ ...settings, approval_required: v })} />
        <ToggleRow label="PPV Allowed" value={settings.ppv_allowed} onChange={(v) => setSettings({ ...settings, ppv_allowed: v })} />

        {settings.ppv_allowed && (
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 text-xs font-medium text-foreground">PPV Content Source</p>
            <p className="mb-2.5 text-xs text-muted-foreground">
              {settings.ppv_source === "auto_vault"
                ? "Automatic Vault — the AI picks an approved folder and the system auto-attaches unseen locked media. Zero manual approval. Sync & approve folders on the PPV Content page."
                : "Curated Sets — you build locked content bundles on the PPV Content page; the AI picks the best match."}
            </p>
            <div className="flex gap-2">
              {[
                { id: "curated_sets", label: "Curated Sets" },
                { id: "auto_vault", label: "Automatic Vault" },
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSettings({ ...settings, ppv_source: src.id })}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    settings.ppv_source === src.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>
            {settings.ppv_source === "auto_vault" && (
              <div className="mt-3">
                <label className="mb-1 block text-xs text-muted-foreground">Media per offer (1–5)</label>
                <input type="number" min={1} max={5} value={settings.vault_media_per_offer}
                  onChange={(e) => setSettings({ ...settings, vault_media_per_offer: Math.max(1, Math.min(5, parseInt(e.target.value) || 3)) })}
                  className="w-32 rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Max Replies Per Hour</label>
            <input type="number" value={settings.max_replies_per_hour} onChange={(e) => setSettings({ ...settings, max_replies_per_hour: parseInt(e.target.value) || 20 })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Min Confidence (0–1)</label>
            <input type="number" step="0.05" min="0" max="1" value={settings.min_confidence} onChange={(e) => setSettings({ ...settings, min_confidence: parseFloat(e.target.value) || 0.7 })}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          </div>
        </div>

        {/* Active hours (item 23) */}
        <div className="rounded-md border border-border p-3">
          <ToggleRow label="Active Hours (creator timezone)" value={settings.active_hours_enabled} onChange={(v) => setSettings({ ...settings, active_hours_enabled: v })} />
          {settings.active_hours_enabled && (
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Start (local)</label>
                <input type="time" value={settings.active_hours_start} onChange={(e) => setSettings({ ...settings, active_hours_start: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">End (local)</label>
                <input type="time" value={settings.active_hours_end} onChange={(e) => setSettings({ ...settings, active_hours_end: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
          )}
        </div>

        {settings.ppv_allowed && (
          <>
          <div className="rounded-md border border-border p-3">
            <p className="mb-1 text-xs font-medium text-foreground">PPV Ladder</p>
            <p className="mb-2.5 text-xs text-muted-foreground">Official base ladder. The fan's level determines every base offer price — the AI never sets the price. $12 is the floor (always on); $400 is the ceiling.</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {PPV_TIERS.map((c, i) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {fmtTier(c)}
                  {i < PPV_TIERS.length - 1 && <span className="text-muted-foreground/60">→</span>}
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Default PPV (cents)</label>
                <input type="number" min={1200} step={100} value={settings.default_ppv_cents} onChange={(e) => setSettings({ ...settings, default_ppv_cents: Math.max(1200, parseInt(e.target.value) || 1200) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Max PPV (cents)</label>
                <input type="number" min={1200} max={40000} step={100} value={settings.max_ppv_cents} onChange={(e) => setSettings({ ...settings, max_ppv_cents: Math.min(40000, Math.max(1200, parseInt(e.target.value) || 40000)) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Min Messages Between Offers</label>
                <input type="number" min={1} value={settings.ppv_min_messages_between_offers} onChange={(e) => setSettings({ ...settings, ppv_min_messages_between_offers: Math.max(1, parseInt(e.target.value) || 5) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Min Minutes Between Offers</label>
                <input type="number" min={10} value={settings.ppv_min_minutes_between_offers} onChange={(e) => setSettings({ ...settings, ppv_min_minutes_between_offers: Math.max(10, parseInt(e.target.value) || 10) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Warm-up Messages</label>
                <input type="number" min={1} value={settings.ppv_warmup_messages} onChange={(e) => setSettings({ ...settings, ppv_warmup_messages: Math.max(1, parseInt(e.target.value) || 3) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Re-offer Cooldown (days)</label>
                <input type="number" min={0} value={settings.ppv_reoffer_days} onChange={(e) => setSettings({ ...settings, ppv_reoffer_days: Math.max(0, parseInt(e.target.value) || 2) })}
                  className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-border p-3">
            <ToggleRow label="Automatic Failed-Offer Discount (Rescue)" value={settings.rescue_enabled} onChange={(v) => setSettings({ ...settings, rescue_enabled: v })} />
            {settings.rescue_enabled && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  <span>Discount: <strong className="text-foreground">−$5</strong> (fixed)</span>
                  <span>·</span>
                  <span>Rescue delay: <strong className="text-foreground">Random 5–10 min</strong></span>
                  <span>·</span>
                  <span>Only one rescue: <strong className="text-success">ON</strong></span>
                  <span>·</span>
                  <span>Keep locked: <strong className="text-success">ALWAYS</strong></span>
                </div>
                <p className="text-xs text-muted-foreground">
                  When a fan doesn't unlock a base PPV, the system re-offers the SAME locked content once at −$5 after a random 5–10 min. Full-price purchase advances the fan one level; discount purchase keeps the level; if both fail, the next offer drops one level. Rescue prices may go below $12 (down to $7) but never lower.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Rescue Min Delay (min)</label>
                    <input type="number" min={1} value={settings.rescue_min_delay_minutes} onChange={(e) => setSettings({ ...settings, rescue_min_delay_minutes: Math.max(1, parseInt(e.target.value) || 5) })}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Rescue Max Delay (min)</label>
                    <input type="number" min={2} value={settings.rescue_max_delay_minutes} onChange={(e) => setSettings({ ...settings, rescue_max_delay_minutes: Math.max(2, parseInt(e.target.value) || 10) })}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
                  </div>
                </div>
              </div>
            )}
          </div>
          </>
        )}
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