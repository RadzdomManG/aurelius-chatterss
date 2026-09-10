import React from "react";
import { Search, Filter } from "lucide-react";
import ConversationRow from "@/components/inbox/ConversationRow";

const FILTERS = ["All", "Unread", "AI", "Paused"];

export default function ConversationList({
  conversations,
  fans,
  selectedId,
  onSelect,
  loading,
  hasConnection,
  realtimeStatus,
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("All");

  const filtered = React.useMemo(() => {
    let result = conversations;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => {
        const fan = fans[c.fan_id];
        return (
          fan?.display_name?.toLowerCase().includes(q) ||
          fan?.handle?.toLowerCase().includes(q)
        );
      });
    }

    if (filter === "Unread") {
      result = result.filter((c) => c.unread_count > 0);
    } else if (filter === "Paused") {
      result = result.filter((c) => fans[c.fan_id]?.automation_paused);
    } else if (filter === "AI") {
      result = result.filter((c) => c.last_sender_type === "ai");
    }

    return result;
  }, [conversations, fans, search, filter]);

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-xl text-foreground">Inbox</h2>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === "live" ? "bg-success" : "bg-warning animate-pulse"}`} />
            <span className={realtimeStatus === "live" ? "text-success" : "text-warning"}>{realtimeStatus === "live" ? "Live" : "Reconnecting"}</span>
          </span>
          <span className="text-xs text-muted-foreground">{filtered.length}</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search fans..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 px-3 pb-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === f
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 rounded-lg p-2">
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
            {hasConnection ? (
              <>
                <Filter className="mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No conversations found</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Connect Fanvue to begin</p>
                <a href="/models" className="mt-2 text-xs text-primary hover:underline">Go to Models →</a>
              </>
            )}
          </div>
        ) : (
          filtered.map((conv) => (
            <ConversationRow
              key={conv.id}
              conversation={conv}
              fan={fans[conv.fan_id]}
              isSelected={conv.id === selectedId}
              onClick={() => onSelect(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}