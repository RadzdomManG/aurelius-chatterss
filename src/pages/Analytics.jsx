import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  BarChart3, MessageSquare, Bot, User, Zap, Clock, TrendingUp, DollarSign,
  Crown, Users, HeartCrack, Gauge, AlertTriangle, Lock,
} from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";

const fmtMoney = (cents) => (cents ? `$${(cents / 100).toFixed(2)}` : "$0.00");
const fmtPct = (n) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function Analytics() {
  const [conn, setConn] = React.useState(null);
  const [creator, setCreator] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [scopeError, setScopeError] = React.useState(null);
  const [summary, setSummary] = React.useState(null);
  const [topSpenders, setTopSpenders] = React.useState([]);
  const [retention, setRetention] = React.useState(null);
  const [unsubscribe, setUnsubscribe] = React.useState(null);
  const [subscribers, setSubscribers] = React.useState([]);
  const [percentile, setPercentile] = React.useState(null);
  const [localMetrics, setLocalMetrics] = React.useState(null);

  React.useEffect(() => {
    loadAll();
  }, []);

  const fetchInsights = async (resource, extra = {}) => {
    try {
      const res = await base44.functions.invoke("fanvue-insights", { resource, ...extra });
      return res;
    } catch (e) {
      const code = e?.response?.data?.code || e?.code;
      if (code === "MISSING_SCOPE") {
        setScopeError(e.response?.data?.missing || ["read:insights"]);
        return null;
      }
      throw e;
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [connections, creators, messages, jobs, conversations, fans] = await Promise.all([
        base44.entities.FanvueConnection.list("-created_date", 10),
        base44.entities.CreatorProfile.list("-created_date", 10),
        base44.entities.Message.list("-created_date", 500),
        base44.entities.AIJob.list("-created_date", 500),
        base44.entities.Conversation.list("-created_date", 200),
        base44.entities.Fan.list("-created_date", 200),
      ]);

      const activeConn = connections.find((c) => c.status === "connected") || null;
      const activeCreator = activeConn
        ? creators.find((c) => c.id === activeConn.creator_profile_id) || creators[0]
        : creators[0] || null;
      setConn(activeConn);
      setCreator(activeCreator);

      // Local Aurelius operational metrics (always available)
      const aiMessages = messages.filter((m) => m.sender_type === "ai");
      const manualMessages = messages.filter((m) => m.sender_type === "creator");
      const fanMessages = messages.filter((m) => m.sender_type === "fan");
      const completedJobs = jobs.filter((j) => j.status === "completed");
      const failedJobs = jobs.filter((j) => j.status === "failed");
      let totalResponseTime = 0, responseCount = 0;
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].sender_type === "fan" && (messages[i + 1].sender_type === "ai" || messages[i + 1].sender_type === "creator")) {
          const diff = new Date(messages[i + 1].created_date) - new Date(messages[i].created_date);
          if (diff > 0 && diff < 3600000) { totalResponseTime += diff; responseCount++; }
        }
      }
      const automationRate = messages.length > 0 ? (aiMessages.length / (aiMessages.length + manualMessages.length || 1)) * 100 : 0;
      setLocalMetrics({
        totalMessages: messages.length,
        aiReplies: aiMessages.length,
        manualReplies: manualMessages.length,
        fanMessages: fanMessages.length,
        conversations: conversations.length,
        fans: fans.length,
        jobsCompleted: completedJobs.length,
        jobsFailed: failedJobs.length,
        automationRate: Math.round(automationRate),
        avgResponseTime: responseCount > 0 ? Math.round(totalResponseTime / responseCount / 1000) : 0,
      });

      // Real Fanvue insights (requires connected account + read:insights)
      if (!activeConn) {
        setLoading(false);
        return;
      }
      const granted = activeConn.granted_scopes || [];
      if (!granted.includes("read:insights")) {
        setScopeError(["read:insights"]);
        setLoading(false);
        return;
      }

      const [sumRes, topRes, retRes, unsubRes, subRes, pctRes] = await Promise.all([
        fetchInsights("summary", { granularity: "day" }),
        fetchInsights("topSpenders", { size: 10 }),
        fetchInsights("retention", { periods: 6 }),
        fetchInsights("unsubscribe"),
        fetchInsights("subscribers", { size: 30 }),
        fetchInsights("percentile"),
      ]);

      if (sumRes?.data) setSummary(sumRes.data);
      if (topRes?.data?.data) setTopSpenders(topRes.data.data);
      if (retRes?.data) setRetention(retRes.data);
      if (unsubRes?.data) setUnsubscribe(unsubRes.data);
      if (subRes?.data?.data) setSubscribers(subRes.data.data);
      if (pctRes?.data) setPercentile(pctRes.data);
    } catch (err) {
      console.error("Failed to load analytics:", err);
      toast.error("Failed to load insights");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  const hasConnection = conn?.status === "connected";

  // Scope gate — permission required state with reconnect CTA
  if (scopeError) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-3xl px-6 py-12">
          <div className="flex flex-col items-center justify-center rounded-lg border border-warning/40 bg-warning/5 px-6 py-10 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
              <Lock className="h-6 w-6 text-warning" />
            </div>
            <h2 className="mb-1 font-heading text-xl text-foreground">Permission required</h2>
            <p className="mb-1 text-sm text-muted-foreground">
              Analytics needs the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{scopeError.join(", ")}</code> scope.
            </p>
            <p className="mb-5 max-w-md text-xs text-muted-foreground">
              Re-authorize your Fanvue account with this scope enabled to unlock real earnings, top spenders, retention and subscriber trends.
            </p>
            <a href="/models" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Go to Models to reconnect
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!hasConnection) {
    return (
      <div className="h-full overflow-y-auto scrollbar-thin">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <EmptyState
            icon={BarChart3}
            title="No Fanvue insights available"
            description="Connect a Fanvue creator account with the read:insights scope to view real revenue, subscribers, top spenders and retention."
            actionLabel="Go to Models"
            actionTo="/models"
          />
        </div>
      </div>
    );
  }

  const overTime = summary?.overTime || [];
  const totals = summary?.totals || {};
  const thisMonth = totals.thisMonth || {};
  const allTime = totals.allTime || {};
  const breakdown = summary?.breakdownBySource || {};
  const latestRet = retention?.snapshots?.[retention.snapshots.length - 1] || null;

  const localCards = localMetrics
    ? [
        { label: "Total Messages", value: localMetrics.totalMessages, icon: MessageSquare, color: "text-primary" },
        { label: "AI Replies", value: localMetrics.aiReplies, icon: Bot, color: "text-success" },
        { label: "Manual Replies", value: localMetrics.manualReplies, icon: User, color: "text-warning" },
        { label: "Conversations", value: localMetrics.conversations, icon: MessageSquare, color: "text-primary" },
        { label: "Fans", value: localMetrics.fans, icon: User, color: "text-primary" },
        { label: "Automation Rate", value: `${localMetrics.automationRate}%`, icon: Zap, color: "text-success" },
        { label: "Avg Response", value: `${localMetrics.avgResponseTime}s`, icon: Clock, color: "text-warning" },
      ]
    : [];

  const earningsCards = [
    { label: "This Month (gross)", value: fmtMoney(thisMonth.gross), icon: DollarSign, color: "text-success", sub: fmtPct(thisMonth.grossChangePercentage) },
    { label: "This Month (net)", value: fmtMoney(thisMonth.net), icon: DollarSign, color: "text-success", sub: fmtPct(thisMonth.netChangePercentage) },
    { label: "All-Time (gross)", value: fmtMoney(allTime.gross), icon: TrendingUp, color: "text-primary" },
    { label: "All-Time (net)", value: fmtMoney(allTime.net), icon: TrendingUp, color: "text-primary" },
    { label: "Earnings Percentile", value: percentile?.percentile != null ? `Top ${Math.max(1, Math.round(100 - percentile.percentile))}%` : "—", icon: Gauge, color: "text-primary" },
    { label: "Active Subscribers", value: subscribers.length ? subscribers[subscribers.length - 1]?.total ?? "—" : "—", icon: Users, color: "text-primary" },
  ];

  const sourceColors = ["#7c5cff", "#36c69a", "#4a9fd6", "#e0a93a", "#e05a6a", "#9b6cf0", "#6b8fb5"];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Analytics</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {creator?.display_name ? `${creator.display_name} · ` : ""}Real Fanvue insights + Aurelius operational metrics
        </p>

        {/* Aurelius metrics */}
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <TrendingUp className="h-4 w-4 text-primary" /> Aurelius Metrics
        </h2>
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {localCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                <p className="mt-2 text-2xl font-heading text-foreground">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Fanvue earnings */}
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <DollarSign className="h-4 w-4 text-success" /> Fanvue Earnings
        </h2>
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {earningsCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                <p className="mt-2 text-2xl font-heading text-foreground">{card.value}</p>
                {card.sub && <p className={`mt-1 text-xs ${card.sub.startsWith("+") ? "text-success" : card.sub.startsWith("-") ? "text-destructive" : "text-muted-foreground"}`}>{card.sub} vs last month</p>}
              </div>
            );
          })}
        </div>

        {/* Earnings over time */}
        {overTime.length > 0 && (
          <div className="mb-8 rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Earnings Over Time</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overTime.map((o) => ({ date: fmtDate(o.periodStart), gross: o.gross / 100, net: o.net / 100 }))}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c5cff" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#7c5cff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} formatter={(v) => `$${v}`} />
                  <Area type="monotone" dataKey="gross" name="Gross" stroke="#7c5cff" strokeWidth={2} fill="url(#grossGrad)" />
                  <Area type="monotone" dataKey="net" name="Net" stroke="#36c69a" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Breakdown by source + Subscriber trend */}
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Breakdown by Source (net)</h3>
            <div className="space-y-2">
              {Object.entries(breakdown).map(([key, val]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{key}</span>
                  <span className="font-medium text-foreground">{fmtMoney(val.net)}</span>
                </div>
              ))}
              {Object.keys(breakdown).length === 0 && <p className="text-xs text-muted-foreground">No breakdown returned.</p>}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-medium text-foreground">Subscriber Trend</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subscribers.map((s) => ({ date: fmtDate(s.date), new: s.newSubscribersCount, cancelled: s.cancelledSubscribersCount }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="new" name="New" fill="#36c69a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cancelled" name="Cancelled" fill="#e05a6a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Top spenders + Retention + Unsubscribe */}
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><Crown className="h-4 w-4 text-warning" /> Top Spenders</h3>
            <div className="space-y-2">
              {topSpenders.slice(0, 8).map((s, i) => (
                <div key={s.user?.uuid || i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    <span className="truncate text-foreground">{s.user?.displayName || s.user?.handle || "Unknown"}</span>
                  </div>
                  <span className="font-medium text-foreground">{fmtMoney(s.gross)}</span>
                </div>
              ))}
              {topSpenders.length === 0 && <p className="text-xs text-muted-foreground">No top-spenders data.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><HeartCrack className="h-4 w-4 text-destructive" /> Retention</h3>
            {latestRet ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Churn rate</span><span className="font-medium text-foreground">{(latestRet.paidFanChurnRate * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Net retention</span><span className="font-medium text-foreground">{(latestRet.paidFanNrr * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">LTV (simple)</span><span className="font-medium text-foreground">{fmtMoney(latestRet.ltvSimple)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">New fans</span><span className="font-medium text-foreground">{latestRet.paidNewFansCount}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reactivated</span><span className="font-medium text-foreground">{latestRet.paidReactivatedFansCount}</span></div>
              </div>
            ) : <p className="text-xs text-muted-foreground">No retention snapshots.</p>}
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-warning" /> Unsubscribe Reasons</h3>
            {unsubscribe?.reasons?.length ? (
              <div className="space-y-2 text-sm">
                {unsubscribe.reasons.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="truncate text-muted-foreground">{r.reason}</span>
                    <span className="font-medium text-foreground">{r.currentWeekCount}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                  <span>This week total</span><span>{unsubscribe.currentWeekTotal}</span>
                </div>
              </div>
            ) : <p className="text-xs text-muted-foreground">No unsubscribe data.</p>}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Insights are live from Fanvue's read:insights endpoints · API version 2025-06-26
        </p>
      </div>
    </div>
  );
}