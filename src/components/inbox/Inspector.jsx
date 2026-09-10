import React from "react";
import { User, Brain, Bot } from "lucide-react";

const TABS = [
  { key: "fan", label: "Fan", icon: User },
  { key: "memory", label: "Memory", icon: Brain },
  { key: "ai", label: "AI", icon: Bot },
];

export default function Inspector({ fan, memories, conversation, creator, aiState }) {
  const [tab, setTab] = React.useState("fan");

  return (
    <div className="hidden h-full w-80 shrink-0 flex-col border-l border-border bg-card xl:flex">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-lg text-foreground">Inspector</h3>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-3 py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {tab === "fan" && <FanTab fan={fan} conversation={conversation} />}
        {tab === "memory" && <MemoryTab memories={memories} />}
        {tab === "ai" && <AITab aiState={aiState} creator={creator} conversation={conversation} />}
      </div>
    </div>
  );
}

function FanTab({ fan, conversation }) {
  if (!fan) {
    return <EmptyInspector text="Select a conversation to view fan details" />;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center">
        {fan.avatar_url ? (
          <img src={fan.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-xl font-medium text-primary">
            {fan.display_name?.charAt(0)}
          </div>
        )}
        <h4 className="mt-2 font-medium text-foreground">{fan.display_name}</h4>
        <p className="text-sm text-muted-foreground">@{fan.handle}</p>
      </div>

      {/* Details */}
      <div className="space-y-2">
        <DetailRow label="Subscription" value={fan.subscription_status || "Unknown"} />
        <DetailRow
          label="Total Spent"
          value={`$${(fan.total_spent_cents / 100).toFixed(2)}`}
        />
        <DetailRow
          label="AI Paused"
          value={fan.automation_paused ? "Yes" : "No"}
          valueClass={fan.automation_paused ? "text-warning" : "text-foreground"}
        />
        <DetailRow label="Unread" value={conversation?.unread_count || 0} />
      </div>
    </div>
  );
}

function MemoryTab({ memories }) {
  if (!memories || memories.length === 0) {
    return <EmptyInspector text="No fan memories yet" />;
  }

  return (
    <div className="space-y-2 p-4">
      {memories.map((m) => (
        <div key={m.id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {m.memory_key}
            </span>
            {m.confidence && (
              <span className="text-xs text-muted-foreground/60">
                {Math.round(m.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-foreground">{m.memory_value}</p>
        </div>
      ))}
    </div>
  );
}

function AITab({ aiState, creator, conversation }) {
  const mode = conversation?.automation_mode_override || creator?.automation_mode || "off";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Automation
        </h4>
        <div className="space-y-2">
          <DetailRow label="Mode" value={mode.toUpperCase()} />
          <DetailRow
            label="State"
            value={aiState?.state || "idle"}
            valueClass={
              aiState?.state === "processing" ? "text-warning" : "text-foreground"
            }
          />
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Last Analysis
        </h4>
        <div className="space-y-2">
          <DetailRow label="Intent" value={aiState?.intent || "—"} />
          <DetailRow label="Sentiment" value={aiState?.sentiment || "—"} />
          <DetailRow
            label="Confidence"
            value={aiState?.confidence ? `${Math.round(aiState.confidence * 100)}%` : "—"}
          />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, valueClass }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${valueClass || "text-foreground"}`}>{value}</span>
    </div>
  );
}

function EmptyInspector({ text }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}