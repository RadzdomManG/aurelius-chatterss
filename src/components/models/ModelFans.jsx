import React from "react";
import { base44 } from "@/api/base44Client";
import { Search, DollarSign, User, Star } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "subscribers", label: "Subscribers" },
  { id: "top_spenders", label: "Top Spenders" },
];

export default function ModelFans({ creator }) {
  const [fans, setFans] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState("all");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    loadFans();
  }, [creator.id]);

  const loadFans = async () => {
    try {
      setLoading(true);
      const list = await base44.entities.Fan.filter({ creator_profile_id: creator.id }, "-created_date", 200);
      setFans(list);
    } catch (err) {
      console.error("Failed to load fans:", err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = React.useMemo(() => {
    let result = fans;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.display_name?.toLowerCase().includes(q) || f.handle?.toLowerCase().includes(q));
    }
    if (filter === "subscribers") result = result.filter((f) => f.subscription_status === "active");
    if (filter === "top_spenders") result = [...result].sort((a, b) => (b.total_spent_cents || 0) - (a.total_spent_cents || 0)).slice(0, 20);
    return result;
  }, [fans, search, filter]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search fans..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-md px-3 py-2 text-xs font-medium ${filter === f.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={User} title="No fans found" description="Fans will appear here after syncing from Fanvue." />
      ) : (
        <div className="space-y-2">
          {filtered.map((fan) => (
            <div key={fan.id} className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                {fan.display_name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{fan.display_name}</p>
                <p className="text-xs text-muted-foreground">@{fan.handle || "unknown"}</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {fan.subscription_status === "active" && (
                  <span className="inline-flex items-center gap-1 text-success"><Star className="h-3 w-3" /> Subscribed</span>
                )}
                {fan.total_spent_cents > 0 && (
                  <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> {(fan.total_spent_cents / 100).toFixed(2)}</span>
                )}
                {fan.automation_paused && <span className="text-warning">AI Paused</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}