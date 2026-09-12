import React from "react";
import { base44 } from "@/api/base44Client";
import { initiateFanvueOAuth } from "@/lib/fanvue-oauth";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw } from "lucide-react";

// Item 6 — app-wide banner that surfaces when any Fanvue connection is
// expired, errored, or disconnected, prompting the operator to re-OAuth.
// Automation silently no-ops for unhealthy accounts; this makes it visible.
export default function ReconnectBanner() {
  const [unhealthy, setUnhealthy] = React.useState([]);
  const [connecting, setConnecting] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const conns = await base44.entities.FanvueConnection.list("-created_date", 50);
      setUnhealthy((conns || []).filter((c) => c.status === "expired" || c.status === "error" || c.status === "disconnected"));
    } catch (e) {}
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  if (unhealthy.length === 0) return null;

  const reconnect = async () => {
    try {
      setConnecting(true);
      await initiateFanvueOAuth();
    } catch (e) {
      toast.error("Failed to start reconnect");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2.5 text-sm">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <span className="text-warning">
        {unhealthy.length} Fanvue connection{unhealthy.length > 1 ? "s" : ""} need attention
        {unhealthy.length === 1 ? ` (${unhealthy[0].status})` : ""} — automation is paused for these accounts.
      </span>
      <button
        onClick={reconnect}
        disabled={connecting}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1 text-xs font-medium text-warning-foreground hover:bg-warning/90 disabled:opacity-50"
      >
        {connecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Reconnect
      </button>
    </div>
  );
}