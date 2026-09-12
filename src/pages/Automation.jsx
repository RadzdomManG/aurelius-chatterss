import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Bot, Clock, AlertTriangle, Send, ListChecks, RotateCcw, MessageSquare, Zap } from "lucide-react";
import MassMessaging from "@/components/automation/MassMessaging";
import RulesManager from "@/components/automation/RulesManager";
import AutomationModeHeader from "@/components/automation/AutomationModeHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useCreator } from "@/lib/creator-context";

const TABS = [
  { id: "queue", label: "Queue", icon: Clock },
  { id: "failed", label: "Failed Jobs", icon: AlertTriangle },
  { id: "scheduled", label: "Scheduled", icon: Send },
  { id: "mass", label: "Mass Messaging", icon: Send },
  { id: "rules", label: "Rules", icon: Zap },
];

export default function Automation() {
  const { selectedCreatorId } = useCreator();
  const [tab, setTab] = React.useState("queue");
  const [jobs, setJobs] = React.useState([]);
  const [scheduled, setScheduled] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [selectedCreatorId]);

  const loadData = async () => {
    if (!selectedCreatorId) { setJobs([]); setScheduled([]); setLoading(false); return; }
    try {
      const [jobList, schedList] = await Promise.all([
        selectedCreatorId
          ? base44.entities.AIJob.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 100)
          : base44.entities.AIJob.list("-created_date", 100),
        selectedCreatorId
          ? base44.entities.ScheduledAction.filter({ creator_profile_id: selectedCreatorId }, "-scheduled_for", 50)
          : base44.entities.ScheduledAction.list("-scheduled_for", 50),
      ]);
      setJobs(jobList || []);
      setScheduled(schedList || []);
    } catch (err) { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleRetry = async (jobId) => {
    try {
      await base44.entities.AIJob.update(jobId, { status: "pending", last_error: null, attempts: 0, locked_at: null, locked_by: null });
      toast.success("Job queued for retry");
      loadData();
    } catch (err) {
      toast.error("Failed to retry job");
    }
  };

  const pending = jobs.filter((j) => j.status === "pending");
  const processing = jobs.filter((j) => j.status === "processing");
  const failed = jobs.filter((j) => j.status === "failed");
  const completed = jobs.filter((j) => j.status === "completed");
  const needsApproval = jobs.filter((j) => j.status === "needs_approval");

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Automation</h1>
        <p className="mb-6 text-sm text-muted-foreground">AI job queue, failed jobs, and scheduled actions</p>

        <AutomationModeHeader />

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <StatCard label="Pending" value={pending.length} variant="info" />
          <StatCard label="Processing" value={processing.length} variant="warning" />
          <StatCard label="Needs Approval" value={needsApproval.length} variant="warning" />
          <StatCard label="Completed" value={completed.length} variant="success" />
          <StatCard label="Failed" value={failed.length} variant="error" />
        </div>

        {/* Tabs */}
        <div className="mb-4 flex gap-1 border-b border-border">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${tab === t.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
        ) : !selectedCreatorId ? (
          <EmptyState icon={Bot} title="No creator selected" description="Select a creator at the top to view its automation queue, failed jobs, and scheduled actions." />
        ) : tab === "queue" ? (
          <JobList jobs={[...pending, ...processing, ...needsApproval]} emptyIcon={Clock} onRetry={handleRetry} />
        ) : tab === "failed" ? (
          <JobList jobs={failed} emptyIcon={AlertTriangle} onRetry={handleRetry} showRetry />
        ) : tab === "scheduled" ? (
          <ScheduledList items={scheduled} />
        ) : tab === "mass" ? (
          <MassMessaging />
        ) : tab === "rules" ? (
          <RulesManager />
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ label, value, variant }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-heading text-foreground">{value}</p>
    </div>
  );
}

function JobList({ jobs, emptyIcon, onRetry, showRetry }) {
  if (jobs.length === 0) {
    return <EmptyState icon={emptyIcon || Clock} title="No jobs" description="AI automation jobs will appear here when fans send messages." />;
  }
  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div key={job.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <StatusBadge variant={job.status === "pending" ? "info" : job.status === "processing" ? "warning" : job.status === "failed" ? "error" : job.status === "completed" ? "success" : "warning"} label={job.status} />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Job {job.id.slice(0, 8)}</p>
            <p className="text-xs text-muted-foreground">
              Conversation: {job.conversation_id?.slice(0, 8)} • Attempts: {job.attempts || 0}
              {job.last_error && <span className="text-destructive"> • {job.last_error}</span>}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">{new Date(job.created_date).toLocaleTimeString()}</span>
          {showRetry && (
            <button onClick={() => onRetry(job.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent">
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function ScheduledList({ items }) {
  if (items.length === 0) {
    return <EmptyState icon={Send} title="No scheduled actions" description="Scheduled mass messages and actions will appear here." />;
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
          <StatusBadge variant={item.status === "pending" ? "info" : item.status === "sent" ? "success" : "error"} label={item.status} />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{item.action_type}</p>
            <p className="text-xs text-muted-foreground">Scheduled for: {new Date(item.scheduled_for).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}