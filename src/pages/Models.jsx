import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { Plus, Users, Plug, Zap, Clock, ArrowRight } from "lucide-react";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { initiateFanvueOAuth } from "@/lib/fanvue-oauth";
import { useCreator } from "@/lib/creator-context";

export default function Models() {
  const [creators, setCreators] = React.useState([]);
  const [connections, setConnections] = React.useState({});
  const [loading, setLoading] = React.useState(true);
  const [connecting, setConnecting] = React.useState(false);
  const { reloadCreators } = useCreator();

  React.useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Keep the app-level creator selector in sync so a newly connected
    // account appears everywhere (inbox/automation/content) without a reload.
    reloadCreators();
    try {
      setLoading(true);
      const [creatorList, connList] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 50),
        base44.entities.FanvueConnection.list("-created_date", 50),
      ]);
      const connMap = {};
      connList.forEach((c) => { connMap[c.creator_profile_id] = c; });
      setCreators(creatorList);
      setConnections(connMap);
    } catch (err) {
      toast.error("Failed to load models");
    } finally {
      setLoading(false);
    }
  };

const handleConnectFanvue = async () => {
    try {
      setConnecting(true);
      await initiateFanvueOAuth();
    } catch (err) {
      toast.error("Failed to initiate Fanvue OAuth: " + (err.message || "Unknown error"));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl text-foreground">Models</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage connected Fanvue creator accounts, personas, and automation
            </p>
          </div>
          <button
            onClick={handleConnectFanvue}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {connecting ? "Connecting..." : "Connect Fanvue"}
          </button>
        </div>

        {/* Creator cards */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-lg border border-border bg-card" />
            ))}
          </div>
        ) : creators.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Plug className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-1.5 font-heading text-lg text-foreground">No models connected</h3>
            <p className="mb-4 max-w-xs text-sm text-muted-foreground">
              Connect your first Fanvue creator account to start managing conversations, personas, and automation.
            </p>
            <button
              onClick={handleConnectFanvue}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {connecting ? "Connecting..." : "Connect Fanvue"}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {creators.map((creator) => {
              const conn = connections[creator.id];
              const isConnected = conn?.status === "connected";
              return (
                <Link
                  key={creator.id}
                  to={`/models/${creator.id}`}
                  className="group rounded-lg border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-lg font-heading text-primary">
                        {creator.display_name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <h3 className="font-medium text-foreground">{creator.display_name}</h3>
                        <p className="text-sm text-muted-foreground">@{creator.username || "unknown"}</p>
                      </div>
                    </div>
                    <StatusBadge
                      variant={isConnected ? "success" : "neutral"}
                      label={isConnected ? "Connected" : "No Fanvue"}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="h-3.5 w-3.5" />
                      {creator.automation_mode || "off"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {creator.timezone || "UTC"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Model
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {isConnected ? "Manage workspace" : "Set up Fanvue connection"}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}