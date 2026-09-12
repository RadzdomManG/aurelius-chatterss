import React from "react";
import { MoreHorizontal, Pause, User as UserIcon, Bot, Zap, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import MessageBubble from "@/components/inbox/MessageBubble";
import MessageComposer from "@/components/inbox/MessageComposer";

const MODE_OPTIONS = [
  { value: "off", label: "Off", icon: UserIcon },
  { value: "draft", label: "Draft", icon: Bot },
  { value: "full_auto", label: "Auto", icon: Zap },
];

export default function ChatThread({
  conversation,
  fan,
  creator,
  messages,
  composerValue,
  onComposerChange,
  onSend,
  onGenerateDraft,
  draft,
  onUseDraft,
  onApproveAndSend,
  onRegenerateDraft,
  onClearDraft,
  onModeChange,
  onTogglePause,
  onRetryMessage,
  generating,
  sending,
  loading,
  ppvDefaultCents,
}) {
  const scrollRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [triggeringAI, setTriggeringAI] = React.useState(false);

  // Check if last message is from fan with no creator/AI reply after it
  const lastMsg = messages[messages.length - 1];
  const needsAIReply = lastMsg?.sender_type === "fan" && !generating && !triggeringAI;

  const handleTriggerAI = async () => {
    if (!conversation?.id) return;
    try {
      setTriggeringAI(true);
      const res = await base44.functions.invoke("process-ai-job", {
        conversationId: conversation.id,
      });
      if (res.data?.success || res.data?.skipped) {
        toast.success(res.data?.skipped ? `AI skipped: ${res.data.reason}` : "AI triggered");
      } else {
        toast.error(res.data?.error || "AI trigger failed");
      }
    } catch (err) {
      toast.error("AI trigger failed: " + (err?.response?.data?.error || err.message));
    } finally {
      setTriggeringAI(false);
    }
  };

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const currentMode = conversation?.automation_mode_override || creator?.automation_mode || "off";

  if (!conversation) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-heading text-2xl text-muted-foreground">No conversation selected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a conversation from the list to view messages
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-background">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          {fan?.avatar_url ? (
            <img src={fan.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary">
              {fan?.display_name?.charAt(0) || "?"}
            </div>
          )}
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {fan?.display_name || "Unknown"}
            </h3>
            <p className="text-xs text-muted-foreground">
              @{fan?.handle || "unknown"} · {creator?.display_name || "No creator"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode selector */}
          <div className="flex rounded-md border border-border">
            {MODE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = currentMode === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onModeChange(opt.value)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  } ${opt.value === "off" ? "rounded-l-md" : ""} ${opt.value === "full_auto" ? "rounded-r-md" : ""} ${opt.value === "draft" ? "border-x border-border" : ""}`}
                  title={`Automation: ${opt.label}`}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={onTogglePause}
            className={`flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent ${
              fan?.automation_paused ? "text-warning" : "text-muted-foreground hover:text-foreground"
            }`}
            title={fan?.automation_paused ? "Resume AI" : "Pause AI for this fan"}
          >
            <Pause className="h-4 w-4" />
          </button>

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-md border border-border bg-popover py-1 shadow-md">
                  <button className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent">
                    Fan details
                  </button>
                  <button className="w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent">
                    Mark as read
                  </button>
                  <button className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-accent">
                    Archive conversation
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin py-4">
        {loading ? (
          <div className="space-y-3 px-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                <div className="h-12 w-48 animate-pulse rounded-2xl bg-muted" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">No messages yet</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              creatorProfileId={conversation?.creator_profile_id}
              onRetry={onRetryMessage}
            />
          ))
        )}
      </div>

      {/* Trigger AI Reply banner — manual fallback when webhook misses */}
      {needsAIReply && (
        <div className="flex items-center justify-between gap-2 border-t border-warning/20 bg-warning/5 px-4 py-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-warning" />
            Last message from fan — no AI reply yet
          </span>
          <button
            onClick={handleTriggerAI}
            disabled={triggeringAI}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Sparkles className={`h-3.5 w-3.5 ${triggeringAI ? "animate-pulse" : ""}`} />
            {triggeringAI ? "Triggering..." : "Trigger AI Reply"}
          </button>
        </div>
      )}

      {/* Composer */}
      <MessageComposer
        value={composerValue}
        onChange={onComposerChange}
        onSend={onSend}
        onGenerateDraft={onGenerateDraft}
        onApproveAndSend={onApproveAndSend}
        draft={draft}
        onUseDraft={onUseDraft}
        onRegenerateDraft={onRegenerateDraft}
        onClearDraft={onClearDraft}
        generating={generating}
        sending={sending}
        ppvDefaultCents={ppvDefaultCents}
        creatorProfileId={conversation?.creator_profile_id}
      />
    </div>
  );
}