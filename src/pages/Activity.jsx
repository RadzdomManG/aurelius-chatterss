import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Activity as ActivityIcon, Bot, Send, MessageSquare, User, RefreshCw,
  AlertCircle, CheckCircle, Clock, Zap, ChevronRight, X, Radio,
} from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

const CATEGORIES = [
  { id: "all", label: "All", icon: ActivityIcon },
  { id: "ai", label: "AI Jobs", icon: Bot },
  { id: "messages", label: "Messages", icon: Send },
  { id: "fans", label: "Fans", icon: User },
  { id: "errors", label: "Errors", icon: AlertCircle },
];

const EVENT_META = {
  "ai.started": { icon: Bot, category: "ai", label: "AI Processing Started", color: "text-warning" },
  "ai.draft.ready": { icon: Bot, category: "ai", label: "AI Draft Ready", color: "text-primary" },
  "ai.draft.requested": { icon: Bot, category: "ai", label: "AI Draft Requested", color: "text-primary" },
  "ai.approved": { icon: CheckCircle, category: "ai", label: "AI Draft Approved", color: "text-success" },
  "ai.rejected": { icon: X, category: "ai", label: "AI Draft Rejected", color: "text-muted-foreground" },
  "ai.completed": { icon: CheckCircle, category: "ai", label: "AI Job Completed", color: "text-success" },
  "ai.failed": { icon: AlertCircle, category: "ai", label: "AI Job Failed", color: "text-destructive" },
  "message.sent.manual": { icon: Send, category: "messages", label: "Message Sent (Manual)", color: "text-primary" },
  "message.sent.fanvue": { icon: Send, category: "messages", label: "Message Sent (Fanvue)", color: "text-success" },
  "message.send.failed": { icon: AlertCircle, category: "messages", label: "Message Send Failed", color: "text-destructive" },
  "fan.message.received": { icon: MessageSquare, category: "fans", label: "Fan Message Received", color: "text-primary" },
  "fan.subscribed": { icon: Zap, category: "fans", label: "New Subscriber", color: "text-success" },
  "sync.started": { icon: RefreshCw, category: "all", label: "Sync Started", color: "text-warning" },
  "sync.completed": { icon: CheckCircle, category: "all", label: "Sync Completed", color: "text-success" },
  "sync.error": { icon: AlertCircle, category: "errors", label: "Sync Error", color: "text-destructive" },
  "fanvue.send.success": { icon: CheckCircle, category: "messages", label: "Fanvue Send Success", color: "text-success" },
  "fanvue.send.error": { icon: AlertCircle, category: "errors", label: "Fanvue Send Error", color: "text-destructive" },
  "mass_message.scheduled": { icon: Send, category: "messages", label: "Mass Message Scheduled", color: "text-primary" },
};

export default function Activity() {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [selected, setSelected] = React.useState(null);
  const [newIds, setNewIds] = React.useState(new Set());
  const [live, setLive] = React.useState(true);

  React.useEffect(() => {
    loadLogs();
    const unsub = base44.entities.ActivityLog.subscribe((event) => {
      if (event.type === "create") {
        setLogs((prev) => [event.data, ...prev].slice(0, 200));
        setNewIds((prev) => new Set(prev).add(event.data.id));
        setLive(true);
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(event.data.id);
            return next;
          });
        }, 2000);
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

  const filtered = React.useMemo(() => {
    if (filter === "all") return logs;
    if (filter === "errors") return logs.filter((l) => l.status === "error");
    return logs.filter((l) => EVENT_META[l.event_type]?.category === filter);
  }, [logs, filter]);

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-6 py-8">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-heading text-3xl text-foreground">
                Activity Feed
                {live && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                    <Radio className="h-3 w-3 animate-pulse" /> Live
                  </span>
                )}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Real-time status of every AI reply, message send, and fan event
              </p>
            </div>
            <button
              onClick={loadLogs}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </button>
          </div>

          {/* Category filters */}
          <div className="mb-4 flex flex-wrap gap-1">
            {CATEGORIES.map((c) => {
              const Icon = c.icon;
              const count = c.id === "all" ? logs.length : c.id === "errors" ? logs.filter((l) => l.status === "error").length : logs.filter((l) => EVENT_META[l.event_type]?.category === c.id).length;
              return (
                <button
                  key={c.id}
                  onClick={() => setFilter(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === c.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {c.label}
                  <span className="ml-1 rounded-full bg-background/30 px-1.5 text-[10px]">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Timeline */}
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ActivityIcon}
              title="No activity yet"
              description="System events — AI replies, message sends, fan messages — will appear here in real time."
            />
          ) : (
            <div className="relative space-y-1.5">
              {/* Timeline line */}
              <div className="absolute bottom-0 left-5 top-2 w-px bg-border" />

              {filtered.map((log) => {
                const meta = EVENT_META[log.event_type] || { icon: ActivityIcon, category: "all", label: log.event_type, color: "text-muted-foreground" };
                const Icon = meta.icon;
                const isNew = newIds.has(log.id);
                const statusVariant = log.status === "success" ? "success" : log.status === "error" ? "error" : log.status === "warning" ? "warning" : "info";

                return (
                  <button
                    key={log.id}
                    onClick={() => setSelected(log)}
                    className={`relative flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary/30 ${
                      isNew ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border"
                    }`}
                  >
                    {/* Timeline dot */}
                    <div className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-card bg-muted ${
                      log.status === "success" ? "bg-success/15" : log.status === "error" ? "bg-destructive/15" : "bg-muted"
                    }`}>
                      <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{meta.label}</span>
                        <StatusBadge variant={statusVariant} label={log.status} dot={false} />
                      </div>
                      {log.message && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{log.message}</p>
                      )}
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(log.created_date).toLocaleString()}
                        </span>
                        <span className="font-mono">{log.event_type}</span>
                      </div>
                    </div>

                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="w-96 shrink-0 border-l border-border bg-card p-6 overflow-y-auto scrollbar-thin">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-heading text-lg text-foreground">Event Details</h3>
            <button onClick={() => setSelected(null)} className="rounded-md p-1 hover:bg-accent">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <DetailRow label="Event Type" value={selected.event_type} mono />
            <DetailRow label="Label" value={EVENT_META[selected.event_type]?.label || selected.event_type} />
            <DetailRow label="Status" value={selected.status} />
            <DetailRow label="Message" value={selected.message || "—"} />
            <DetailRow label="Time" value={new Date(selected.created_date).toLocaleString()} />
            <DetailRow label="Creator ID" value={selected.creator_profile_id || "—"} mono />
            <DetailRow label="Conversation ID" value={selected.conversation_id || "—"} mono />
            <DetailRow label="Event ID" value={selected.id} mono />
            {selected.metadata && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Metadata</p>
                <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
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
      <p className={`text-foreground ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}