import React from "react";
import { base44 } from "@/api/base44Client";
import { Zap, Bot, Plug, MessageSquare, Users, DollarSign } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";

export default function ModelOverview({ creator, persona, connection, autoSettings }) {
  const [stats, setStats] = React.useState({ conversations: 0, fans: 0, messages: 0, revenue: 0 });

  React.useEffect(() => {
    loadStats();
  }, [creator.id]);

  const loadStats = async () => {
    try {
      const [convos, fans, msgs] = await Promise.all([
        base44.entities.Conversation.filter({ creator_profile_id: creator.id }, "-created_date", 1),
        base44.entities.Fan.filter({ creator_profile_id: creator.id }, "-created_date", 200),
        base44.entities.Message.filter({ creator_profile_id: creator.id }, "-created_date", 1),
      ]);
      const revenue = fans.reduce((sum, f) => sum + (f.total_spent_cents || 0), 0);
      setStats({ conversations: convos.length, fans: fans.length, messages: msgs.length, revenue });
    } catch (err) { /* ignore */ }
  };

  const cards = [
    { label: "Conversations", value: stats.conversations, icon: MessageSquare },
    { label: "Fans", value: stats.fans, icon: Users },
    { label: "Messages", value: stats.messages, icon: MessageSquare },
    { label: "Revenue", value: `$${(stats.revenue / 100).toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <span className="text-xs">{card.label}</span>
              </div>
              <p className="mt-2 text-2xl font-heading text-foreground">{card.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Zap className="h-4 w-4 text-primary" /> Automation
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Mode</span><span className="text-foreground">{creator.automation_mode || "off"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Enabled</span><span>{autoSettings?.enabled ? "Yes" : "No"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approval</span><span>{autoSettings?.approval_required ? "Required" : "Auto"}</span></div>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
            <Bot className="h-4 w-4 text-primary" /> Persona
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{persona?.display_name || "Not set"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Active</span>
              <StatusBadge variant={persona?.active ? "success" : "neutral"} label={persona?.active ? "Active" : "Inactive"} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <Plug className="h-4 w-4 text-primary" /> Fanvue Connection
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
            <StatusBadge variant={connection?.status === "connected" ? "success" : "neutral"} label={connection?.status || "disconnected"} />
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fanvue UUID</span><span className="font-mono text-xs">{connection?.external_user_uuid || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last Sync</span><span>{connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"}</span></div>
        </div>
      </div>
    </div>
  );
}