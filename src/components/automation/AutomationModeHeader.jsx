import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Square, FileEdit, Play, UserCheck, Loader2 } from "lucide-react";

const MODES = [
  { id: "off", label: "Stopped", icon: Square },
  { id: "draft", label: "Draft", icon: FileEdit },
  { id: "full_auto", label: "Running", icon: Play },
];

export default function AutomationModeHeader() {
  const [creator, setCreator] = React.useState(null);
  const [settings, setSettings] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [hydrating, setHydrating] = React.useState(false);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    try {
      const [creators, settingsList] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 5),
        base44.entities.AutomationSettings.list("-created_date", 10),
      ]);
      const c = creators[0] || null;
      setCreator(c);
      setSettings(settingsList.find((s) => s.creator_profile_id === c?.id) || null);
    } catch (e) { /* ignore */ }
  };

  const handleMode = async (mode) => {
    if (!creator) return;
    setSaving(true);
    try {
      await base44.entities.CreatorProfile.update(creator.id, { automation_mode: mode });
      setCreator((c) => ({ ...c, automation_mode: mode }));
      toast.success(`Automation: ${MODES.find((m) => m.id === mode).label}`);
    } catch (e) {
      toast.error("Failed to update mode");
    } finally {
      setSaving(false);
    }
  };

  const handleHydrate = async () => {
    setHydrating(true);
    try {
      const res = await base44.functions.invoke("fanvue-hydrate-identities", {});
      if (res?.data?.resolved != null) {
        toast.success(`Hydrated ${res.data.resolved} fan identities (${res.data.stillUnknown} still unknown)`);
      } else {
        toast.error(res?.data?.error || "Hydration failed");
      }
    } catch (e) {
      toast.error(e?.response?.data?.error || "Hydration failed");
    } finally {
      setHydrating(false);
    }
  };

  const current = creator?.automation_mode || "off";
  const runner = settings?.runner_status || "stopped";

  return (
    <div className="mb-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">Global Automation Mode{creator ? ` · ${creator.display_name}` : ""}</p>
        <div className="flex gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = current === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleMode(m.id)}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${runner === "running" ? "bg-success/15 text-success" : runner === "paused" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"}`}>
          Runner: {runner}
        </span>
        <button
          onClick={handleHydrate}
          disabled={hydrating}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
          title="Backfill unknown fan identities from Fanvue"
        >
          {hydrating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
          Hydrate unknown fans
        </button>
      </div>
    </div>
  );
}