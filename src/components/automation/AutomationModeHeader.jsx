import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Square, FileEdit, Play, UserCheck, Loader2, Pause, PlayCircle, ChevronDown, Check } from "lucide-react";

const MODES = [
  { id: "off", label: "Stopped", icon: Square },
  { id: "draft", label: "Draft", icon: FileEdit },
  { id: "full_auto", label: "Running", icon: Play },
];

export default function AutomationModeHeader() {
  const [creators, setCreators] = React.useState([]);
  const [selectedCreatorId, setSelectedCreatorId] = React.useState(null);
  const [settingsByCreator, setSettingsByCreator] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [hydrating, setHydrating] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [togglingPause, setTogglingPause] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    try {
      const [creatorList, settingsList, pauseStatus] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 100),
        base44.entities.AutomationSettings.list("-created_date", 50),
        base44.functions.invoke("toggle-pause", { action: "status" }).catch(() => null),
      ]);
      setCreators(Array.isArray(creatorList) ? creatorList : []);
      const sMap = {};
      (settingsList || []).forEach((s) => { sMap[s.creator_profile_id] = s; });
      setSettingsByCreator(sMap);
      if (pauseStatus) setPaused(!!pauseStatus.paused);
      // Keep a valid selection: first load auto-picks the first creator;
      // later loads preserve the current selection if it still exists.
      setSelectedCreatorId((prev) => {
        if (prev && creatorList.some((c) => c.id === prev)) return prev;
        return creatorList[0]?.id || null;
      });
    } catch (e) { /* ignore */ }
  };

  const selectedCreator = creators.find((c) => c.id === selectedCreatorId) || null;

  const handleMode = async (mode) => {
    if (!selectedCreator) return;
    setSaving(true);
    try {
      await base44.entities.CreatorProfile.update(selectedCreator.id, { automation_mode: mode });
      setCreators((prev) => prev.map((c) => (c.id === selectedCreator.id ? { ...c, automation_mode: mode } : c)));
      toast.success(`${selectedCreator.display_name}: ${MODES.find((m) => m.id === mode).label}`);
    } catch (e) {
      toast.error("Failed to update mode");
    } finally {
      setSaving(false);
    }
  };

  // Per-creator pause/resume: "Pause" snapshots the current mode into
  // prior_automation_mode then sets off; "Resume" restores that saved mode
  // (falling back to full_auto) and clears the snapshot — mirroring how the
  // global Resume All restores from AppConfig.paused_modes.
  const handleCreatorPauseResume = async () => {
    if (!selectedCreator) return;
    const currentMode = selectedCreator.automation_mode || "off";
    setSaving(true);
    try {
      if (currentMode === "off") {
        const restoreMode = selectedCreator.prior_automation_mode === "draft" || selectedCreator.prior_automation_mode === "full_auto"
          ? selectedCreator.prior_automation_mode
          : "full_auto";
        await base44.entities.CreatorProfile.update(selectedCreator.id, {
          automation_mode: restoreMode,
          prior_automation_mode: null,
        });
        setCreators((prev) => prev.map((c) => (c.id === selectedCreator.id ? { ...c, automation_mode: restoreMode, prior_automation_mode: null } : c)));
        toast.success(`${selectedCreator.display_name}: bot resumed (${MODES.find((m) => m.id === restoreMode).label})`);
      } else {
        await base44.entities.CreatorProfile.update(selectedCreator.id, {
          automation_mode: "off",
          prior_automation_mode: currentMode,
        });
        setCreators((prev) => prev.map((c) => (c.id === selectedCreator.id ? { ...c, automation_mode: "off", prior_automation_mode: currentMode } : c)));
        toast.success(`${selectedCreator.display_name}: bot paused (Stopped)`);
      }
    } catch (e) {
      toast.error("Failed to toggle bot");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    setTogglingPause(true);
    try {
      const action = paused ? "resume" : "pause";
      const res = await base44.functions.invoke("toggle-pause", { action });
      setPaused(action === "pause");
      if (action === "pause") {
        toast.success(`Paused all — ${res.pausedCreators || 0} creator(s) off, ${res.jobsCancelled || 0} job(s) cancelled`);
      } else {
        toast.success(`Resumed all — restored ${res.restored || 0} creator(s)`);
      }
      load();
    } catch (e) {
      toast.error("Failed to toggle pause");
    } finally {
      setTogglingPause(false);
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

  const current = selectedCreator?.automation_mode || "off";
  const runner = (selectedCreator && settingsByCreator[selectedCreator.id]?.runner_status) || "stopped";

  return (
    <div className="mb-6 space-y-3">
      {/* Global pause banner */}
      {paused && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          <Pause className="h-4 w-4 shrink-0" />
          <span className="font-medium">System paused</span>
          <span className="text-warning/80">— all bots, webhooks, and background workflows are halted. Click Resume All to restart.</span>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          {/* Creator selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Creator:</span>
            <div className="relative">
              <button
                onClick={() => setPickerOpen((o) => !o)}
                disabled={creators.length === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50"
              >
                {selectedCreator ? selectedCreator.display_name : "No creators"}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              {pickerOpen && creators.length > 0 && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg scrollbar-thin">
                    {creators.map((c) => {
                      const mode = c.automation_mode || "off";
                      const modeLabel = MODES.find((m) => m.id === mode)?.label || "Stopped";
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setSelectedCreatorId(c.id);
                            setPickerOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="flex flex-col">
                            <span className="font-medium text-foreground">{c.display_name}</span>
                            <span className="text-xs text-muted-foreground">@{c.username || "unknown"} · {modeLabel}</span>
                          </span>
                          {c.id === selectedCreatorId && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mode buttons — control the selected creator */}
          <div className="flex gap-2">
            {MODES.map((m) => {
              const Icon = m.icon;
              const active = current === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => handleMode(m.id)}
                  disabled={saving || paused || !selectedCreator}
                  title={paused ? "System is paused — Resume All to change mode" : !selectedCreator ? "No creator selected" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                    active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {m.label}
                </button>
              );
            })}
            {/* Per-creator quick pause/resume */}
            <button
              onClick={handleCreatorPauseResume}
              disabled={saving || paused || !selectedCreator}
              title={paused ? "System is paused — Resume All first" : current === "off" ? `Resume bot for ${selectedCreator?.display_name}` : `Pause bot for ${selectedCreator?.display_name}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                current === "off"
                  ? "border-success/50 text-success hover:bg-success/10"
                  : "border-warning/50 text-warning hover:bg-warning/10"
              }`}
            >
              {current === "off" ? <PlayCircle className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {current === "off" ? "Resume bot" : "Pause bot"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Global Pause All / Resume All — affects every creator */}
          <button
            onClick={handleTogglePause}
            disabled={togglingPause}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              paused
                ? "bg-success text-success-foreground hover:bg-success/90"
                : "bg-warning text-warning-foreground hover:bg-warning/90"
            }`}
          >
            {togglingPause ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <PlayCircle className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume All" : "Pause All"}
          </button>
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
    </div>
  );
}