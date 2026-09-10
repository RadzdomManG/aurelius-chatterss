import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  Activity,
  Webhook,
  Plug,
  Bot,
  RefreshCw,
  Copy,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  UserSearch,
  Send,
} from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";

const WEBHOOK_URL = "https://aurelius-chat-core.base44.app/functions/fanvue-webhook";

export default function Diagnostics() {
  const [logs, setLogs] = React.useState([]);
  const [connection, setConnection] = React.useState(null);
  const [creator, setCreator] = React.useState(null);
  const [aiStats, setAiStats] = React.useState({ pending: 0, completed: 0, failed: 0, needs_approval: 0 });
  const [loading, setLoading] = React.useState(true);
  const [backfilling, setBackfilling] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [allLogs, conns, creators, jobs] = await Promise.all([
        base44.entities.ActivityLog.list("-created_date", 50),
        base44.entities.FanvueConnection.list("-created_date", 10),
        base44.entities.CreatorProfile.list("-created_date", 10),
        base44.entities.AIJob.list("-created_date", 200),
      ]);
      const webhookLogs = allLogs.filter((l) => (l.event_type || "").startsWith("webhook"));
      setLogs(webhookLogs);
      setConnection(conns.find((c) => c.status === "connected") || conns[0] || null);
      setCreator(creators[0] || null);
      setAiStats({
        pending: jobs.filter((j) => j.status === "pending" || j.status === "processing").length,
        completed: jobs.filter((j) => j.status === "completed").length,
        failed: jobs.filter((j) => j.status === "failed").length,
        needs_approval: jobs.filter((j) => j.status === "needs_approval").length,
      });
    } catch (err) {
      toast.error("Failed to load diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // Auto-refresh every 5s so a Fanvue Test event appears live
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(WEBHOOK_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.error("Copy failed");
    }
  };

  const runBackfill = async () => {
    try {
      setBackfilling(true);
      const res = await base44.functions.invoke("fanvue-hydrate-identities", { dryRun: false });
      toast.success(`Identity backfill: ${res.resolved || 0} resolved, ${res.stillUnknown || 0} still unknown`);
      load();
    } catch (err) {
      toast.error("Backfill failed: " + (err.message || "unknown error"));
    } finally {
      setBackfilling(false);
    }
  };

  const latestRequest = logs.find((l) => l.event_type === "webhook.request");
  const latestHeaders = latestRequest?.metadata?.headers || [];
  const signaturePresent = latestRequest?.metadata?.signaturePresent;
  const lastDelivery = logs[0];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-foreground">Diagnostics</h1>
          <p className="text-sm text-muted-foreground">Webhook, connection, and AI pipeline health — refreshes every 5s.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HealthCard
          icon={Plug}
          title="Fanvue Connection"
          status={connection?.status || "none"}
          rows={[
            ["Status", connection?.status || "Not connected"],
            ["Sync", connection?.sync_status || "—"],
            ["Last sync", connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"],
            ["Creator", creator?.display_name || "—"],
          ]}
        />
        <HealthCard
          icon={Webhook}
          title="Webhook Endpoint"
          status={signaturePresent === undefined ? "unknown" : signaturePresent ? "ok" : "unsigned"}
          rows={[
            ["URL", WEBHOOK_URL.replace("https://", "")],
            ["Last event", lastDelivery ? new Date(lastDelivery.created_date).toLocaleTimeString() : "None"],
            ["Signature", signaturePresent === undefined ? "No requests yet" : signaturePresent ? "Present ✓" : "MISSING ✗"],
          ]}
          footer={
            <button
              onClick={copyUrl}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy webhook URL"}
            </button>
          }
        />
        <HealthCard
          icon={Bot}
          title="AI Pipeline"
          status={aiStats.failed > 0 ? "error" : "ok"}
          rows={[
            ["Pending", String(aiStats.pending)],
            ["Needs approval", String(aiStats.needs_approval)],
            ["Completed", String(aiStats.completed)],
            ["Failed", String(aiStats.failed)],
          ]}
          footer={
            <button
              onClick={runBackfill}
              disabled={backfilling}
              className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
            >
              <UserSearch className={`h-3.5 w-3.5 ${backfilling ? "animate-spin" : ""}`} />
              {backfilling ? "Backfilling…" : "Run identity backfill"}
            </button>
          }
        />
      </div>

      {/* Setup checklist */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-heading text-lg text-foreground">Webhook Setup Checklist</h2>
        <ol className="space-y-2.5 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">1</span>
            <span>Copy the webhook URL above.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">2</span>
            <span>In the Fanvue Developer Area → your app → <b>Events</b> tab → <b>Add Webhook</b>, paste the URL and select <code className="rounded bg-muted px-1">creator.message.received</code>.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">3</span>
            <span>Click <b>View Signing Secret</b> in the Events tab and ensure it matches the secret configured for this app. If it differs, update it via your app settings.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">4</span>
            <span>Click <b>Test</b> on the webhook. The latest request below should show <span className="text-success">Signature: Present ✓</span>. If it still shows MISSING, the header dump reveals exactly what Fanvue sent.</span>
          </li>
        </ol>
      </div>

      {/* Latest request header dump — the key diagnostic */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg text-foreground">
          <Send className="h-4 w-4" />
          Latest Webhook Request
        </h2>
        {latestRequest ? (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge
                variant={signaturePresent ? "success" : "warning"}
                label={signaturePresent ? "Signature present" : "Signature missing"}
              />
              <span className="text-muted-foreground">{latestRequest.message}</span>
              <span className="text-xs text-muted-foreground">{new Date(latestRequest.created_date).toLocaleString()}</span>
            </div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Received Headers
            </div>
            <pre className="mb-4 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground scrollbar-thin">
              {latestHeaders.length > 0 ? latestHeaders.join("\n") : "(no headers captured)"}
            </pre>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Body Preview
            </div>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs text-foreground scrollbar-thin">
              {latestRequest.metadata?.bodyPreview || "(empty)"}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No webhook requests received yet. Click <b>Test</b> in the Fanvue Events tab — it will appear here within 5 seconds.
          </p>
        )}
      </div>

      {/* Recent webhook activity log */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 font-heading text-lg text-foreground">
          <Activity className="h-4 w-4" />
          Recent Webhook Activity
        </h2>
        {logs.length === 0 ? (
          <EmptyState icon={Webhook} title="No webhook activity" description="Webhook events will be logged here as they arrive." />
        ) : (
          <div className="divide-y divide-border">
            {logs.slice(0, 12).map((log) => (
              <div key={log.id} className="flex items-center gap-3 py-2.5">
                {log.status === "success" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : log.status === "error" ? (
                  <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                ) : log.status === "warning" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                ) : (
                  <Activity className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="text-xs font-mono text-muted-foreground">{log.event_type}</span>
                <span className="flex-1 truncate text-sm text-foreground">{log.message}</span>
                <span className="text-xs text-muted-foreground">{new Date(log.created_date).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HealthCard({ icon: Icon, title, status, rows, footer }) {
  const variant =
    status === "connected" || status === "ok" || status === "completed" || status === "idle"
      ? "success"
      : status === "error" || status === "failed" || status === "unsigned"
      ? "error"
      : "neutral";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-medium text-foreground">{title}</h3>
        </div>
        <StatusBadge variant={variant} label={status} />
      </div>
      <div className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{k}</span>
            <span className="max-w-[55%] truncate text-foreground" title={typeof v === "string" ? v : undefined}>{v}</span>
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
}