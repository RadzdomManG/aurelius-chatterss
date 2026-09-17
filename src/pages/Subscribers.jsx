import React from "react";
import { toast } from "sonner";
import { Users, DollarSign } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { fanvueCall, useConnection, money, fmtDate } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";
import CreatorSelector from "@/components/shared/CreatorSelector";

const STATUS_STYLES = {
  active: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
  pending_confirmation: "bg-warning/15 text-warning",
  paused: "bg-muted text-muted-foreground",
};

export default function Subscribers() {
  const { connection, creator, loading: loadingConn } = useConnection();
  const [tab, setTab] = React.useState("subscribers");
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [fanMap, setFanMap] = React.useState({});
  const [syncing, setSyncing] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const op = tab === "subscribers" ? "listSubscribers_v1_experimental" : "listFollowers_v1_experimental";
      const res = await fanvueCall(op, { query: { size: 50 }, creatorProfileId: creator?.id });
      const payload = res?.data || res;
      setRows(payload?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connection, tab]);

  React.useEffect(() => { load(); }, [load]);

  // Load our Fan records (which carry total_spent_cents synced from Fanvue)
  // so each subscriber row shows real spend under their name.
  const reloadFans = React.useCallback(async () => {
    if (!creator?.id) { setFanMap({}); return; }
    let active = true;
    (async () => {
      try {
        const fans = await base44.entities.Fan.filter({ creator_profile_id: creator.id }, "-total_spent_cents", 500);
        if (!active) return;
        const map = {};
        for (const f of (fans || [])) {
          if (f.external_uuid) map[f.external_uuid] = f;
        }
        setFanMap(map);
      } catch (e) {
        if (active) setFanMap({});
      }
    })();
    return () => { active = false; };
  }, [creator?.id]);

  React.useEffect(() => { reloadFans(); }, [reloadFans]);

  const syncSpending = async () => {
    if (!creator?.id) return;
    try {
      setSyncing(true);
      const res = await base44.functions.invoke("sync-fan-spending", { creatorProfileId: creator.id });
      const payload = res?.data || res;
      if (payload?.error) throw new Error(payload.error);
      const count = payload?.fansUpdated || 0;
      toast.success(count > 0 ? `Synced ${count} fan${count === 1 ? "" : "s"}' spending from Fanvue` : "Spending synced — no new data to update");
      await reloadFans();
    } catch (e) {
      toast.error(e?.message || "Failed to sync spending from Fanvue");
    } finally {
      setSyncing(false);
    }
  };

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={Users} title="Connect Fanvue" description="Connect a Fanvue account to view subscribers and followers." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:fan")) return <div className="h-full p-8"><ScopeGate missing={["read:fan"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="font-heading text-3xl text-foreground">Audience</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={syncSpending}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <DollarSign className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync spending"}
            </button>
            <CreatorSelector />
          </div>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">Subscribers and followers</p>

        <div className="mb-4 flex gap-1 rounded-md border border-border p-1 w-fit">
          {[{ id: "subscribers", label: "Subscribers" }, { id: "followers", label: "Followers" }].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-4 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(() => {
          const fans = Object.values(fanMap).filter((f) => (f.total_spent_cents || 0) > 0).sort((a, b) => (b.total_spent_cents || 0) - (a.total_spent_cents || 0));
          const totalSpend = fans.reduce((s, f) => s + (f.total_spent_cents || 0), 0);
          if (fans.length === 0) return null;
          return (
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-heading text-lg text-foreground"><DollarSign className="h-4 w-4 text-success" /> Spenders</h2>
                <span className="text-xs text-muted-foreground">{fans.length} spender{fans.length === 1 ? "" : "s"} · {money(totalSpend)} total</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {fans.slice(0, 3).map((f, i) => (
                  <div key={f.id} className="rounded-md border border-border bg-background p-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-muted-foreground">#{i + 1}</span>
                      <p className="truncate text-sm font-medium text-foreground">{f.display_name || f.handle || "Unknown"}</p>
                    </div>
                    <p className="mt-0.5 text-lg font-heading text-success">{money(f.total_spent_cents)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No {tab} yet.</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r) => {
              const sub = r.subscription || {};
              return (
                <div key={r.uuid} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                  {r.avatarUrl ? (
                    <img src={r.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(r.displayName || "?").charAt(0)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.displayName || r.handle}</p>
                    <p className="text-xs text-muted-foreground">@{r.handle} · {fmtDate(r.firstSubscribedAt || r.registeredAt)}</p>
                  </div>
                  {(() => {
                    const fan = fanMap[r.uuid];
                    const spent = fan?.total_spent_cents || 0;
                    const tier = spent >= 10000 ? "high" : spent >= 3000 ? "mid" : spent > 0 ? "low" : "none";
                    const tierLabel = tier === "high" ? "Top spender" : tier === "mid" ? "Spender" : tier === "low" ? "Light" : "New";
                    const tierStyle = tier === "high" ? "bg-warning/15 text-warning" : tier === "mid" ? "bg-success/15 text-success" : tier === "low" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground";
                    return (spent > 0 || tab === "followers") && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tierStyle}`}>{tierLabel}</span>
                    );
                  })()}
                  {tab === "subscribers" ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{money(sub.amountPaid)} paid</p>
                        <p className="text-xs text-muted-foreground">{money(sub.price)}/mo</p>
                        {(() => { const f = fanMap[r.uuid]; return f?.total_spent_cents ? <p className="text-xs font-medium text-foreground">{money(f.total_spent_cents)} total</p> : null; })()}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status] || "bg-muted text-muted-foreground"}`}>{sub.status || "—"}</span>
                    </div>
                  ) : (
                    <div className="shrink-0 text-right">
                      {(() => { const f = fanMap[r.uuid]; return f?.total_spent_cents ? <p className="text-xs font-medium text-foreground">{money(f.total_spent_cents)} spent</p> : <p className="text-xs text-muted-foreground">$0.00</p>; })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}