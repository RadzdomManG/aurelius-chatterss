import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Activity as ActivityIcon, ChevronRight, X } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

export default function Activity() {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [selected, setSelected] = React.useState(null);

  React.useEffect(() => {
    loadLogs();
    // Subscribe to new logs in realtime
    const unsub = base44.entities.ActivityLog.subscribe((event) => {
      if (event.type === "create") {
        setLogs((prev) => [event.data, ...prev].slice(0, 200));
      }
    });
    return unsub;
  }, []);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const list = await base44.entities.ActivityLog.list("-created_date", 200);
      setLogs(list);
    } catch (err) {
      toast.error("Failed to load activity logs");
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === "all" ? logs : logs.filter((l) => l.status === filter);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <h1 className="mb-1 font-heading text-3xl text-foreground">Activity</h1>
          <p className="mb-6 text-sm text-muted-foreground">Real-time system events and automation traces</p>

          <div className="mb-4 flex gap-1">
            {["all", "success", "error", "warning", "info"].map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={ActivityIcon} title="No activity yet" description="System events will appear here once Fanvue is connected and automation is running." />
          ) : (
            <div className="space-y-1.5">
              {filtered.map((log) => (
                <button key={log.id} onClick={() => setSelected(log)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/30">
                  <StatusBadge variant={log.status === "success" ? "success" : log.status === "error" ? "error" : log.status === "warning" ? "warning" : "info"} label={log.status} dot={false} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{log.event_type}</p>
                    {log.message && <p className="text-xs text-muted-foreground">{log.message}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(log.created_date).toLocaleTimeString()}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="w-96 shrink-0 border-l border-border bg-card p-6 overflow-y-auto scrollbar-thin">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg text-foreground">Event Details</h3>
            <button onClick={() => setSelected(null)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
          </div>
          <div className="space-y-3 text-sm">
            <DetailRow label="Event Type" value={selected.event_type} />
            <DetailRow label="Status" value={selected.status} />
            <DetailRow label="Message" value={selected.message || "—"} />
            <DetailRow label="Time" value={new Date(selected.created_date).toLocaleString()} />
            <DetailRow label="Creator ID" value={selected.creator_profile_id || "—"} mono />
            <DetailRow label="Conversation ID" value={selected.conversation_id || "—"} mono />
            <DetailRow label="Event ID" value={selected.id} mono />
            {selected.metadata && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Metadata</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}