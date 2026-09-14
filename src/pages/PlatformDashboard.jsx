import React from "react";
import { base44 } from "@/api/base44Client";
import { usePlan } from "@/lib/plan-context";
import PlatformStats from "@/components/platform/PlatformStats";
import CustomerTable from "@/components/platform/CustomerTable";
import { Building2, RefreshCw, Loader2 } from "lucide-react";

// SaaS Owner Dashboard — platform_admin only. Shows all customers, MRR,
// active/suspended counts, platform-wide usage, and a customer table with
// drill-down plan management (assign tier, suspend/reactivate, set MRR).
export default function PlatformDashboard() {
  const { isPlatformAdmin, loading: planLoading } = usePlan();
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await base44.functions.invoke("platform-admin-data", {});
      setData(res);
    } catch (e) {
      setError(e.message || "Failed to load platform data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (isPlatformAdmin) load();
  }, [isPlatformAdmin, load]);

  // Gate: only platform admins see this page.
  if (planLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isPlatformAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="font-heading text-lg text-foreground">Access restricted</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This dashboard is for platform administrators only.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button onClick={load} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const customers = data?.customers || [];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">Platform Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              All customers, revenue, and usage across the platform. Billing month: {data?.month || "—"}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6">
          <PlatformStats stats={stats} />
        </div>

        {/* Plan distribution */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <PlanTierCard tier="free" count={stats.customersByTier?.free || 0} total={stats.totalCustomers || 0} />
          <PlanTierCard tier="pro" count={stats.customersByTier?.pro || 0} total={stats.totalCustomers || 0} />
          <PlanTierCard tier="agency" count={stats.customersByTier?.agency || 0} total={stats.totalCustomers || 0} />
        </div>

        {/* Customer table */}
        <div className="mb-4">
          <h2 className="mb-3 font-heading text-xl text-foreground">Customers</h2>
          <CustomerTable customers={customers} onPlanChanged={load} />
        </div>
      </div>
    </div>
  );
}

function PlanTierCard({ tier, count, total }) {
  const STYLES = {
    free: { border: "border-muted", bg: "bg-muted/20", text: "text-muted-foreground" },
    pro: { border: "border-primary/30", bg: "bg-primary/5", text: "text-primary" },
    agency: { border: "border-accent", bg: "bg-accent/30", text: "text-accent-foreground" },
  };
  const LABELS = { free: "Free", pro: "Pro", agency: "Agency" };
  const s = STYLES[tier];
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className={`rounded-lg border ${s.border} ${s.bg} p-4`}>
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${s.text}`}>{LABELS[tier]}</span>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-1 font-heading text-3xl text-foreground">{count}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tier === "pro" ? "bg-primary" : tier === "agency" ? "bg-accent-foreground" : "bg-muted-foreground"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}