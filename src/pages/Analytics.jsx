import React from "react";
import { base44 } from "@/api/base44Client";
import { DollarSign, TrendingUp, Clock, RefreshCw, BarChart3 } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import CreatorComparisonTable from "@/components/analytics/CreatorComparisonTable";

const fmtMoney = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : "$0.00");
const fmtSeconds = (s) => (s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`);

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
];

export default function Analytics() {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [days, setDays] = React.useState(30);

  const load = React.useCallback(async (selectedDays) => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke("analytics-summary", { days: selectedDays });
      setData(res);
    } catch (err) {
      console.error("Analytics load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(days);
  }, [days, load]);

  const creators = data?.creators || [];
  const connectedCreators = creators.filter((c) => c.connected);

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
          <button
            onClick={() => load(days)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
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

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Total Tips" value={fmtMoney(totals.tips)} icon={DollarSign} color="text-success" />
          <SummaryCard label="PPV Sales" value={fmtMoney(totals.ppv)} icon={TrendingUp} color="text-primary" />
          <SummaryCard label="Avg Response Time" value={fmtSeconds(avgResponse)} icon={Clock} color="text-warning" />
          <SummaryCard label="Total Earnings" value={fmtMoney(totals.earnings)} icon={DollarSign} color="text-success" />
        </div>

        {/* Comparison table */}
        <CreatorComparisonTable creators={creators} />

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Revenue from Fanvue read:insights · Response time from Aurelius message history
        </p>
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