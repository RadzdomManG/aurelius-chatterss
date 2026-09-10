import React from "react";
import { base44 } from "@/api/base44Client";
import { Bell, MessageSquare, Bot, Send, Zap, AlertCircle, CheckCircle, X } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

const EVENT_ICONS = {
  "message.sent.manual": Send,
  "message.sent.fanvue": Send,
  "fan.message.received": MessageSquare,
  "ai.started": Bot,
  "ai.draft.ready": Bot,
  "ai.completed": Bot,
  "ai.failed": AlertCircle,
  "fanvue.send.success": CheckCircle,
  "fanvue.send.error": AlertCircle,
  "fan.subscribed": Zap,
  "sync.started": Zap,
  "sync.completed": CheckCircle,
  "sync.error": AlertCircle,
};

export default function LiveActivityBell() {
  const [open, setOpen] = React.useState(false);
  const [logs, setLogs] = React.useState([]);
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    loadInitial();
    const unsub = base44.entities.ActivityLog.subscribe((event) => {
      if (event.type === "create") {
        setLogs((prev) => [event.data, ...prev].slice(0, 20));
        setUnread((n) => n + 1);
      }
    });
    return unsub;
  }, []);

  const loadInitial = async () => {
    try {
      const list = await base44.entities.ActivityLog.list("-created_date", 20);
      setLogs(list);
    } catch (err) { /* ignore */ }
  };

  const handleOpen = () => {
    setOpen(!open);
    if (!open) setUnread(0);
  };

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Activity feed"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-lg border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">Live Activity</h3>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              {logs.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">No activity yet</p>
              ) : (
                logs.map((log) => {
                  const Icon = EVENT_ICONS[log.event_type] || Bell;
                  return (
                    <div key={log.id} className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-0">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-medium text-foreground">{log.event_type}</span>
                          <StatusBadge variant={log.status === "success" ? "success" : log.status === "error" ? "error" : log.status === "warning" ? "warning" : "info"} label={log.status} dot={false} />
                        </div>
                        {log.message && <p className="mt-0.5 truncate text-xs text-muted-foreground">{log.message}</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(log.created_date).toLocaleTimeString()}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            <a href="/activity" className="block border-t border-border px-4 py-2.5 text-center text-xs text-primary hover:bg-accent">
              View all activity →
            </a>
          </div>
        </>
      )}
    </div>
  );
}