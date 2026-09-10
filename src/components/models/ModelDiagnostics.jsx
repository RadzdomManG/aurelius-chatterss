import React from "react";
import { base44 } from "@/api/base44Client";
import { Activity, Clock, AlertTriangle, CheckCircle, XCircle, Bot, Cpu } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

export default function ModelDiagnostics({ creator, connection }) {
  const [jobs, setJobs] = React.useState([]);
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadDiagnostics();
    const interval = setInterval(loadDiagnostics, 5000);
    return () => clearInterval(interval);
  }, [creator.id]);

  const loadDiagnostics = async () => {
    try {
      const [allJobs, recentLogs] = await Promise.all([
        base44.entities.AIJob.filter({ creator_profile_id: creator.id }, "-created_date", 50),
        base44.entities.ActivityLog.filter({ creator_profile_id: creator.id }, "-created_date", 20),
      ]);
      setJobs(allJobs);
      setLogs(recentLogs);
    } catch (err) { /* ignore */ }
    finally { setLoading(false); }
  };

  const pending = jobs.filter((j) => j.status === "pending");
  const processing = jobs.filter((j) => j.status === "processing");
  const failed = jobs.filter((j) => j.status === "failed");
  const completed = jobs.filter((j) => j.status === "completed");
  const oldestPending = pending[0];
  const oldestPendingAge = oldestPending ? Date.now() - new Date(oldestPending.created_date).getTime() : 0;

  const lastIncoming = logs.find((l) => l.event_type === "fan.message.received");
  const lastAI = logs.find((l) => l.event_type === "ai.completed" || l.event_type === "ai.started");
  const lastSend = logs.find((l) => l.event_type === "fanvue.send.success");

  const checks = [
    { label: "Fanvue", status: connection?.status === "connected" ? "healthy" : "error", value: connection?.status === "connected" ? "Connected" : "Disconnected" },
    { label: "Fanvue Webhook", status: "info", value: "Pending setup" },
    { label: "Database", status: "success", value: "Healthy" },
    { label: "Realtime", status: "success", value: "Live" },
    { label: "3s Fallback", status: "success", value: "Healthy" },
    { label: "Automation", status: creator.automation_mode === "off" ? "neutral" : "info", value: creator.automation_mode || "off" },
    { label: "Worker", status: pending.length > 3 && oldestPendingAge > 60000 ? "warning" : pending.length > 0 ? "info" : "success", value: pending.length > 3 && oldestPendingAge > 60000 ? "Delayed" : "Healthy" },
    { label: "Grok", status: "neutral", value: "Pending config" },
  ];

  const metrics = [
    { label: "Pending Jobs", value: pending.length, icon: Clock },
    { label: "Processing", value: processing.length, icon: Cpu },
    { label: "Failed", value: failed.length, icon: XCircle },
    { label: "Completed", value: completed.length, icon: CheckCircle },
  ];

  const timestamps = [
    { label: "Last Incoming", value: lastIncoming?.created_date },
    { label: "Last AI Generation", value: lastAI?.created_date },
    { label: "Last Fanvue Send", value: lastSend?.created_date },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Health checks */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-foreground">System Health</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {checks.map((check) => (
            <div key={check.label} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{check.label}</span>
              <StatusBadge variant={check.status} label={check.value} />
            </div>
          ))}
        </div>
      </div>

      {/* Job metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div key={m.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-4 w-4" /><span className="text-xs">{m.label}</span></div>
              <p className="mt-2 text-2xl font-heading text-foreground">{m.value}</p>
            </div>
          );
        })}
      </div>

      {/* Timestamps */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-medium text-foreground">Activity Timestamps</h3>
        <div className="space-y-2 text-sm">
          {timestamps.map((t) => (
            <div key={t.label} className="flex justify-between">
              <span className="text-muted-foreground">{t.label}</span>
              <span className="text-foreground">{t.value ? new Date(t.value).toLocaleString() : "Never"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Oldest pending */}
      {oldestPending && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="h-4 w-4" /> Oldest pending job: {Math.round(oldestPendingAge / 1000)}s ago
          </p>
        </div>
      )}

      {/* Recent activity */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><Activity className="h-4 w-4" /> Recent Activity</h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {logs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center gap-3 text-sm">
                <StatusBadge variant={log.status === "success" ? "success" : log.status === "error" ? "error" : log.status === "warning" ? "warning" : "info"} label={log.status} dot={false} />
                <span className="text-foreground">{log.event_type}</span>
                <span className="ml-auto text-xs text-muted-foreground">{new Date(log.created_date).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}