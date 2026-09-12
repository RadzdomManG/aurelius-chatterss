import React from "react";
import { toast } from "sonner";
import { Users } from "lucide-react";
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

  const load = React.useCallback(async () => {
    if (!connection) return;
    try {
      setLoading(true);
      const op = tab === "subscribers" ? "listSubscribers_v1_experimental" : "listFollowers_v1_experimental";
      const res = await fanvueCall(op, { query: { size: 50 }, creatorProfileId: creator?.id });
      setRows(res?.data?.data || []);
    } catch (e) {
      if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [connection, tab]);

  React.useEffect(() => { load(); }, [load]);

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={Users} title="Connect Fanvue" description="Connect a Fanvue account to view subscribers and followers." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:fan")) return <div className="h-full p-8"><ScopeGate missing={["read:fan"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h1 className="font-heading text-3xl text-foreground">Audience</h1>
          <CreatorSelector />
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
                  {tab === "subscribers" ? (
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{money(sub.amountPaid)} paid</p>
                        <p className="text-xs text-muted-foreground">{money(sub.price)}/mo</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[sub.status] || "bg-muted text-muted-foreground"}`}>{sub.status || "—"}</span>
                    </div>
                  ) : (
                    r.isTopSpender && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">Top spender</span>
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