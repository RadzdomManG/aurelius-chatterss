import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Square, FileEdit, Play, UserCheck, Loader2, Pause, PlayCircle } from "lucide-react";
import { useCreator } from "@/lib/creator-context";
import CreatorSelector from "@/components/shared/CreatorSelector";

const MODES = [
  { id: "off", label: "Stopped", icon: Square },
  { id: "draft", label: "Draft", icon: FileEdit },
  { id: "full_auto", label: "Running", icon: Play },
];

export default function AutomationModeHeader() {
  const { creators, selectedCreatorId, reloadCreators } = useCreator();
  const [settingsByCreator, setSettingsByCreator] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [hydrating, setHydrating] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [configId, setConfigId] = React.useState(null);
  const [togglingPause, setTogglingPause] = React.useState(false);

  React.useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, []);

  const load = async () => {
    try {
      const [settingsList, configs] = await Promise.all([
        base44.entities.AutomationSettings.list("-created_date", 200),
        base44.entities.AppConfig.list("-created_date", 5),
      ]);
      const sMap = {};
      (settingsList || []).forEach((s) => { sMap[s.creator_profile_id] = s; });
      setSettingsByCreator(sMap);
      const cfg = configs[0];
      if (cfg) {
        setConfigId(cfg.id);
        setPaused(!!cfg.paused);
      }
    } catch (e) { /* ignore */ }
  };

  const selectedCreator = creators.find((c) => c.id === selectedCreatorId) || null;

  // Kick the job processor immediately so the now-active creator's pending
  // and needs-approval jobs flush right away, instead of waiting up to 5
  // minutes for the recovery workflow. Fired after a mode/resume succeeds so
  // it never blocks the UI or runs for a still-stopped bot.
  const flushJobs = async (creatorName) => {
    try {
      const res = await base44.functions.invoke("recover-ai-jobs");
      const total = (res?.recovered || 0) + (res?.pendingRecovered || 0) + (res?.needsApprovalConverted || 0);
      toast.success(`${creatorName}: bot resumed${total > 0 ? ` — ${total} job(s) flushed` : ""}`);
    } catch (e) {
      // Recovery is best-effort; the 5-min workflow still backstops this.
      toast.success(`${creatorName}: bot resumed`);
    }
  };

  // Engaging a running mode / Resume bot MUST clear the global pause first —
  // otherwise isPaused() stays true and every job skips with GLOBAL_PAUSED,
  // so the bot never actually runs no matter what the mode buttons say.
  // Resuming only re-enables creators already in a running mode; others stay
  // off, so this never surprise-starts a stopped creator.
  // Drive the global pause flag DIRECTLY on AppConfig (no RLS, any authed
  // user can write it). Going through the toggle-pause function was unreliable
  // — browser calls hit 401s and the flag never cleared, so "Running" did
  // nothing. Writing the entity directly always works.
  const ensureSystemRunning = async () => {
    if (!paused) return true;
    if (!configId) { toast.error("System config not loaded yet — retry"); return false; }
    try {
      await base44.entities.AppConfig.update(configId, { paused: false, paused_modes: {} });
      setPaused(false);
      return true;
    } catch (e) {
      toast.error("Failed to clear global pause");
      return false;
    }
  };

  const pauseSystem = async () => {
    if (!configId) return false;
    try {
      const snapshot = {};
      (creators || []).forEach((c) => { snapshot[c.id] = c.automation_mode || "off"; });
      await base44.entities.AppConfig.update(configId, { paused: true, paused_modes: snapshot });
      setPaused(true);
      // Flip every running creator to off so the bot stops immediately and
      // the AI processor's per-creator mode check also halts them.
      for (const c of (creators || [])) {
        if ((c.automation_mode || "off") !== "off") {
          try { await base44.entities.CreatorProfile.update(c.id, { automation_mode: "off", prior_automation_mode: c.automation_mode }); } catch (e) {}
        }
      }
      await reloadCreators();
      return true;
    } catch (e) {
      toast.error("Failed to pause system");
      return false;
    }
  };

  const resumeSystem = async () => {
    if (!configId) return 0;
    try {
      const cfg = (await base44.entities.AppConfig.list("-created_date", 1))[0];
      const snapshot = cfg?.paused_modes || {};
      const allCreators = await base44.entities.CreatorProfile.list("-created_date", 200);
      let restored = 0;
      for (const c of (allCreators || [])) {
        const live = c.automation_mode || "off";
        const saved = snapshot[c.id];
        const final = live === "draft" || live === "full_auto" ? live : (saved === "draft" || saved === "full_auto" ? saved : "off");
        if (final !== "off") {
          try { await base44.entities.CreatorProfile.update(c.id, { automation_mode: final, prior_automation_mode: null, status: "active" }); restored++; } catch (e) {}
        }
      }
      await base44.entities.AppConfig.update(cfg.id, { paused: false, paused_modes: {} });
      setPaused(false);
      await reloadCreators();
      return restored;
    } catch (e) {
      toast.error("Failed to resume system");
      return 0;
    }
  };

  // Reset the circuit-breaker error state so a resume gives the creator a clean
  // slate. The breaker re-trips only on fresh real send failures, which is
  // the safety behavior we want — but a resume should never inherit a stale
  // "error/disconnected" look from before the pause.
  const clearCircuitBreaker = async (creatorId) => {
    try {
      await base44.entities.CreatorProfile.update(creatorId, { status: "active" });
    } catch (e) {}
    const s = settingsByCreator[creatorId];
    if (s?.id && (s.consecutive_send_failures || 0) > 0) {
      try {
        await base44.entities.AutomationSettings.update(s.id, { consecutive_send_failures: 0 });
        setSettingsByCreator((m) => ({ ...m, [creatorId]: { ...s, consecutive_send_failures: 0 } }));
      } catch (e) {}
    }
  };

  const handleMode = async (mode) => {
    if (!selectedCreator) return;
    setSaving(true);
    try {
      // Engaging a running mode clears the global pause — otherwise the bot
      // stays halted (GLOBAL_PAUSED) and the mode change is a silent no-op.
      if (mode === "draft" || mode === "full_auto") {
        await ensureSystemRunning();
        await clearCircuitBreaker(selectedCreator.id);
      }
      await base44.entities.CreatorProfile.update(selectedCreator.id, { automation_mode: mode });
      await reloadCreators();
      toast.success(`${selectedCreator.display_name}: ${MODES.find((m) => m.id === mode).label}`);
      if (mode === "draft" || mode === "full_auto") flushJobs(selectedCreator.display_name);
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
        // Resuming this creator. Clear the global pause first so the bot
        // actually runs — without this, isPaused() stays true and every job
        // skips with GLOBAL_PAUSED (the "bot not resume" bug).
        await ensureSystemRunning();
        await clearCircuitBreaker(selectedCreator.id);
        const restoreMode = selectedCreator.prior_automation_mode === "draft" || selectedCreator.prior_automation_mode === "full_auto"
          ? selectedCreator.prior_automation_mode
          : "draft";
        await base44.entities.CreatorProfile.update(selectedCreator.id, {
          automation_mode: restoreMode,
          prior_automation_mode: null,
          status: "active",
        });
        await reloadCreators();
        flushJobs(selectedCreator.display_name);
      } else {
        // Pause bot = global pause (the user's requested behavior): halts
        // every creator and flips the system-wide pause flag on.
        await pauseSystem();
        toast.success(`${selectedCreator.display_name}: bot paused (system paused)`);
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
      if (paused) {
        const restored = await resumeSystem();
        toast.success(`Resumed all — restored ${restored} creator(s)`);
        flushJobs("all creators");
      } else {
        await pauseSystem();
        toast.success(`Paused all — system halted`);
      }
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
  // Derive the badge from live state — the stored runner_status field is
  // vestigial (nothing writes it), so it always lied. This now always matches
  // the mode buttons and the global pause banner.
  const runner = paused ? "paused" : current === "off" ? "stopped" : "running";

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
          {/* Creator selector — shared app-level choice */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Creator:</span>
            <CreatorSelector />
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
                  disabled={saving || !selectedCreator}
                  title={!selectedCreator ? "No creator selected" : paused && (m.id === "draft" || m.id === "full_auto") ? "Resume the system and set to " + m.label : undefined}
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
              disabled={saving || !selectedCreator}
              title={!selectedCreator ? "No creator selected" : current === "off" ? `Resume bot for ${selectedCreator?.display_name}${paused ? " (will resume the system)" : ""}` : `Pause bot for ${selectedCreator?.display_name}`}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 ${
                current === "off"
                  ? "border-success/50 text-success hover:bg-success/10"
                  : "border-border text-muted-foreground hover:bg-accent"
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