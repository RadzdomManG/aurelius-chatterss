import React from "react";
import { base44 } from "@/api/base44Client";
import { BarChart3, MessageSquare, Bot, User, Zap, Clock, TrendingUp, DollarSign } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";

export default function Analytics() {
  const [metrics, setMetrics] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [hasConnection, setHasConnection] = React.useState(false);

  React.useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      const [messages, jobs, conversations, fans, connections] = await Promise.all([
        base44.entities.Message.list("-created_date", 500),
        base44.entities.AIJob.list("-created_date", 500),
        base44.entities.Conversation.list("-created_date", 200),
        base44.entities.Fan.list("-created_date", 200),
        base44.entities.FanvueConnection.list("-created_date", 10),
      ]);

      setHasConnection(connections.some((c) => c.status === "connected"));

      const aiMessages = messages.filter((m) => m.sender_type === "ai");
      const manualMessages = messages.filter((m) => m.sender_type === "creator");
      const fanMessages = messages.filter((m) => m.sender_type === "fan");
      const completedJobs = jobs.filter((j) => j.status === "completed");
      const failedJobs = jobs.filter((j) => j.status === "failed");
      const totalRevenue = fans.reduce((sum, f) => sum + (f.total_spent_cents || 0), 0);
      const automationRate = messages.length > 0 ? (aiMessages.length / (aiMessages.length + manualMessages.length || 1)) * 100 : 0;

      // Response time (avg time between fan message and next ai/creator reply)
      let totalResponseTime = 0;
      let responseCount = 0;
      for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].sender_type === "fan" && (messages[i + 1].sender_type === "ai" || messages[i + 1].sender_type === "creator")) {
          const diff = new Date(messages[i + 1].created_date) - new Date(messages[i].created_date);
          if (diff > 0 && diff < 3600000) { totalResponseTime += diff; responseCount++; }
        }
      }
      const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount / 1000 : 0;

      setMetrics({
        totalMessages: messages.length,
        aiReplies: aiMessages.length,
        manualReplies: manualMessages.length,
        fanMessages: fanMessages.length,
        conversations: conversations.length,
        fans: fans.length,
        jobsCompleted: completedJobs.length,
        jobsFailed: failedJobs.length,
        automationRate: Math.round(automationRate),
        avgResponseTime: Math.round(avgResponseTime),
        totalRevenue,
      });
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" /></div>;
  }

  const cards = [
    { label: "Total Messages", value: metrics.totalMessages, icon: MessageSquare, color: "text-primary" },
    { label: "AI Replies", value: metrics.aiReplies, icon: Bot, color: "text-success" },
    { label: "Manual Replies", value: metrics.manualReplies, icon: User, color: "text-warning" },
    { label: "Conversations", value: metrics.conversations, icon: MessageSquare, color: "text-primary" },
    { label: "Fans", value: metrics.fans, icon: User, color: "text-primary" },
    { label: "Automation Rate", value: `${metrics.automationRate}%`, icon: Zap, color: "text-success" },
    { label: "Avg Response Time", value: `${metrics.avgResponseTime}s`, icon: Clock, color: "text-warning" },
    { label: "Revenue (synced)", value: `$${(metrics.totalRevenue / 100).toFixed(2)}`, icon: DollarSign, color: "text-success" },
  ];

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 font-heading text-3xl text-foreground">Analytics</h1>
        <p className="mb-6 text-sm text-muted-foreground">Aurelius operational metrics and Fanvue insights</p>

        {/* Aurelius metrics */}
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><TrendingUp className="h-4 w-4 text-primary" /> Aurelius Metrics</h2>
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${card.color}`} /><span className="text-xs text-muted-foreground">{card.label}</span></div>
                <p className="mt-2 text-2xl font-heading text-foreground">{card.value}</p>
              </div>
            );
          })}
        </div>

        {/* Fanvue insights */}
        <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground"><BarChart3 className="h-4 w-4 text-primary" /> Fanvue Insights</h2>
        {hasConnection ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">Fanvue insights are loaded from the Fanvue API (read:insights scope).</p>
            <p className="mt-2 text-xs text-muted-foreground">Backend function required to fetch insights data (Builder+ plan).</p>
          </div>
        ) : (
          <EmptyState icon={BarChart3} title="No Fanvue insights available" description="Connect a Fanvue creator account with read:insights scope to view revenue, subscribers, and earnings data." actionLabel="Go to Models" actionTo="/models" />
        )}
      </div>
    </div>
  );
}