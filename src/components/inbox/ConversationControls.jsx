import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { UserX, UserCheck, Hand, Bot } from "lucide-react";

// Items 24 & 27 — per-fan and per-conversation automation controls shown in the
// Inspector. "Pause bot for this fan" flips Fan.automation_paused; "Human
// takeover" sets Conversation.automation_mode_override to "off" so the AI
// stops replying until the operator releases it.
export default function ConversationControls({ fan, conversation }) {
  const [busy, setBusy] = React.useState(false);

  if (!fan) return null;

  const fanPaused = !!fan.automation_paused;
  const takeover = conversation?.automation_mode_override === "off";

  const toggleFanPause = async () => {
    setBusy(true);
    try {
      await base44.entities.Fan.update(fan.id, { automation_paused: !fanPaused });
      toast.success(!fanPaused ? "Bot paused for this fan" : "Bot resumed for this fan");
    } catch (e) {
      toast.error("Failed to update fan");
    } finally {
      setBusy(false);
    }
  };

  const toggleTakeover = async () => {
    if (!conversation) return;
    setBusy(true);
    try {
      await base44.entities.Conversation.update(conversation.id, {
        automation_mode_override: takeover ? null : "off",
      });
      toast.success(takeover ? "AI resumed for this conversation" : "Human takeover — AI paused");
    } catch (e) {
      toast.error("Failed to update conversation");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <h4 className="mb-2 text-sm font-semibold text-foreground">Automation controls</h4>
      <div className="space-y-2">
        <button
          onClick={toggleFanPause}
          disabled={busy}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
            fanPaused ? "border-warning/40 bg-warning/10 text-warning" : "border-border hover:bg-accent"
          }`}
        >
          <span className="flex items-center gap-2">
            {fanPaused ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
            Bot for this fan
          </span>
          <span className="text-xs font-medium">{fanPaused ? "Paused" : "Active"}</span>
        </button>
        <button
          onClick={toggleTakeover}
          disabled={busy || !conversation}
          className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
            takeover ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-accent"
          }`}
        >
          <span className="flex items-center gap-2">
            {takeover ? <Hand className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            Human takeover
          </span>
          <span className="text-xs font-medium">{takeover ? "On" : "Off"}</span>
        </button>
      </div>
    </div>
  );
}