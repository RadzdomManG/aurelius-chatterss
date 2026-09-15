import React from "react";
import { Search, Filter, DollarSign } from "lucide-react";
import ConversationRow from "@/components/inbox/ConversationRow";
import CreatorSelector from "@/components/shared/CreatorSelector";

const FILTERS = ["All", "Unread", "AI", "Paused"];

// Fanvue "suggested creator" promo blasts look like a profile link in the
// form fanvue.com/<handle>/fv-<n>. These junk chats clutter the inbox — hide
// them unless the operator explicitly shows empty conversations.
const PROMO_LINK_RE = /fanvue\.com\/[\w.-]+\/fv-\d+/i;
function isPromoPreview(preview) {
  if (!preview || typeof preview !== "string") return false;
  return PROMO_LINK_RE.test(preview);
}

export default function ConversationList({
  conversations,
  fans,
  selectedId,
  onSelect,
  loading,
  hasConnection,
  realtimeStatus,
  onRefreshSpend,
  refreshingSpend,
}) {
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState("All");
  const [showEmpty, setShowEmpty] = React.useState(false);

  const filtered = React.useMemo(() => {
    // UI-level dedup by fan_id (safety net even with clean data).
    // Keep the most recent conversation per fan_id.
    const byFan = new Map();
    for (const c of conversations) {
      const existing = byFan.get(c.fan_id);
      if (!existing) {
        byFan.set(c.fan_id, c);
      } else {
        const aT = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        const bT = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
        if (aT > bT) byFan.set(c.fan_id, c);
      }
    }
    let result = Array.from(byFan.values());

    // Hide empty or promo-spam conversations (no real last_message_at, or a
    // last_message_preview that is a Fanvue promo/suggested-creator link)
    // unless the operator explicitly toggled "Show empty".
    if (!showEmpty) {
      result = result.filter((c) => {
        if (!c.last_message_preview && !c.last_message_at) return false;
        if (isPromoPreview(c.last_message_preview)) return false;
        return true;
      });
    }

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
      result = result.filter((c) => c.last_sender_type === "ai" || c.last_sender_type === "creator");
    }

    // Sort by last_message_at descending (real messages first, empty last)
    result.sort((a, b) => {
      const aT = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bT = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bT - aT;
    });

    return result;
  }, [conversations, fans, search, filter, showEmpty]);

  const emptyCount = conversations.filter((c) => (!c.last_message_preview && !c.last_message_at) || isPromoPreview(c.last_message_preview)).length;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-heading text-xl text-foreground">Inbox</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshSpend}
            disabled={refreshingSpend || !hasConnection}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground hover:bg-accent disabled:opacity-50"
            title="Sync fan lifetime spend from Fanvue"
          >
            <DollarSign className={`h-3.5 w-3.5 ${refreshingSpend ? "animate-spin" : "text-success"}`} />
            {refreshingSpend ? "Syncing…" : "Refresh spend"}
          </button>
          <CreatorSelector />
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

      {/* Filters + Empty toggle */}
      <div className="flex items-center justify-between gap-1 px-3 pb-2">
        <div className="flex gap-1">
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
        {emptyCount > 0 && (
          <button
            onClick={() => setShowEmpty((v) => !v)}
            className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              showEmpty
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Toggle empty conversations"
          >
            {showEmpty ? "Hide" : "Show"} empty ({emptyCount})
          </button>
        )}
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