import React from "react";
import { base44 } from "@/api/base44Client";
import { DollarSign, TrendingUp, Clock, RefreshCw, BarChart3, AlertTriangle } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import CreatorComparisonTable from "@/components/analytics/CreatorComparisonTable";
import PpvConversionAnalytics from "@/components/analytics/PpvConversionAnalytics";
import RevenueTab from "@/components/analytics/RevenueTab";
import { useCreator } from "@/lib/creator-context";
import CreatorSelector from "@/components/shared/CreatorSelector";

const fmtMoney = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : "$0.00");
const fmtSeconds = (s) => (s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function Analytics() {
  const { selectedCreatorId } = useCreator();
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState(30);
  const [tab, setTab] = React.useState("overview");

  const load = React.useCallback(async (selectedDays, creatorId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("analytics-summary", {
        days: selectedDays,
        creatorProfileId: creatorId || null,
      });
      if (res && res.error) throw new Error(res.error);
      setData(res);
    } catch (err) {
      console.error("Analytics load failed:", err);
      setError(err.message || "Failed to load analytics. Please try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(days, selectedCreatorId);
  }, [days, load, selectedCreatorId]);

  // Scope the comparison table to the selected creator (with a full roster
  // view available when none is chosen). Summary cards always reflect the
  // selected creator only so the numbers match the selector.
  const allCreators = data?.creators || [];
  const creators = selectedCreatorId
    ? allCreators.filter((c) => c.creator_profile_id === selectedCreatorId || c.id === selectedCreatorId)
    : allCreators;
  const connectedCreators = allCreators.filter((c) => c.connected);

  const totals = creators.reduce(
    (acc, c) => {
      acc.tips += c.tips_cents || 0;
      acc.ppv += c.ppv_cents || 0;
      acc.earnings += c.total_earnings_cents || 0;
      return acc;
    },
    { tips: 0, ppv: 0, earnings: 0 }
  );

  const responseTimes = creators.map((c) => c.avg_response_seconds).filter((s) => s != null);
  const avgResponse =
    responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : null;

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-md px-6 py-16">
          <div className="rounded-xl border border-destructive/30 bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h2 className="mb-1 font-heading text-lg text-foreground">Couldn't load analytics</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              {error}
            </p>
            <button
              onClick={() => load(days, selectedCreatorId)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (connectedCreators.length === 0) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <EmptyState
            icon={BarChart3}
            title="No analytics yet"
            description="Connect a Fanvue creator account with the read:insights scope to see tips, PPV sales, and response times across your creators."
            actionLabel="Go to Models"
            actionTo="/models"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-1 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">Analytics</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tips, PPV sales & response times — {data?.date_range?.start} to {data?.date_range?.end}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreatorSelector />
            <button
              onClick={() => load(days, selectedCreatorId)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Range selector */}
        <div className="mb-6 mt-4 flex items-center gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                days === r.days
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* View tabs */}
        <div className="mb-6 flex items-center gap-1 border-b border-border">
          {[
            { id: "overview", label: "Overview" },
            { id: "revenue", label: "Revenue" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "revenue" ? (
          <RevenueTab
            selectedCreatorId={selectedCreatorId}
            days={days}
            fanvueStats={allCreators.find(
              (c) => c.creator_profile_id === selectedCreatorId || c.id === selectedCreatorId
            )}
          />
        ) : (
          <>
            {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total Tips" value={fmtMoney(totals.tips)} icon={DollarSign} color="text-success" />
          <SummaryCard label="PPV Sales" value={fmtMoney(totals.ppv)} icon={TrendingUp} color="text-primary" />
          <SummaryCard label="Avg Response Time" value={fmtSeconds(avgResponse)} icon={Clock} color="text-warning" />
          <SummaryCard label="Total Earnings" value={fmtMoney(totals.earnings)} icon={DollarSign} color="text-success" />
        </div>

        {/* Comparison table */}
        <CreatorComparisonTable creators={creators} />

        {/* PPV conversion analytics (item 12) */}
        <PpvConversionAnalytics />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Revenue from Fanvue read:insights · Response time from Aurelius message history
        </p>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-heading text-foreground">{value}</p>
    </div>
  );
}