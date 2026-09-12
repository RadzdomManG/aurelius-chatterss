import React from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { fanvueCall, useConnection, fmtDate } from "@/lib/fanvue-gateway";
import ScopeGate from "@/components/shared/ScopeGate";
import EmptyState from "@/components/shared/EmptyState";

// Best-effort mapping of Fanvue numeric event types to labels (subset).
const EVENT_LABELS = {
  1: "New subscriber", 2: "Subscription renewed", 3: "Subscription cancelled", 4: "Subscription expired",
  5: "New tip", 6: "New purchase", 7: "New message", 8: "New follow", 9: "Post liked",
  10: "Post commented", 11: "Payment succeeded", 12: "Refund created", 13: "Dispute flagged",
};

export default function Notifications() {
  const { connection, loading: loadingConn } = useConnection();
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      if (!connection) return;
      try {
        setLoading(true);
        const res = await fanvueCall("listNotifications", { query: { limit: 50 } });
        // Coerce to a real array — Fanvue can return a wrapped/paginated
        // object here, and `|| []` won't catch a truthy non-array (crashes map).
        const list = res?.data?.data;
        setItems(Array.isArray(list) ? list : Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        if (e?.code !== "MISSING_SCOPE") toast.error(e?.error || "Failed to load notifications");
      } finally {
        setLoading(false);
      }
    })();
  }, [connection]);

  if (loadingConn) return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  if (!connection) return <div className="h-full p-8"><EmptyState icon={Bell} title="Connect Fanvue" description="Connect a Fanvue account to view notifications." actionLabel="Go to Models" actionTo="/models" /></div>;
  if (!(connection.granted_scopes || []).includes("read:self")) return <div className="h-full p-8"><ScopeGate missing={["read:self"]} /></div>;

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Notifications</h1>
        <p className="mb-6 text-sm text-muted-foreground">Live Fanvue account notifications</p>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No notifications.</div>
        ) : (
          <div className="space-y-1.5">
            {items.map((n) => {
              const o = n.originator || {};
              const label = EVENT_LABELS[n.eventType] || `Event #${n.eventType}`;
              return (
                <div key={n.uuid} className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${n.isRead ? "border-border opacity-70" : "border-primary/30"}`}>
                  {o.avatarUrl ? (
                    <img src={o.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">{(o.displayName || "?").charAt(0)}</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground"><span className="font-medium">{o.displayName || o.handle || "Someone"}</span> · {label}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(n.createdAt)}</p>
                  </div>
                  {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}