import React from "react";
import { MoreHorizontal, Pause, User as UserIcon, Bot, Zap } from "lucide-react";
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
  onRegenerateDraft,
  onClearDraft,
  onModeChange,
  onTogglePause,
  generating,
  sending,
  loading,
}) {
  const scrollRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);

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
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      {/* Composer */}
      <MessageComposer
        value={composerValue}
        onChange={onComposerChange}
        onSend={onSend}
        onGenerateDraft={onGenerateDraft}
        draft={draft}
        onUseDraft={onUseDraft}
        onRegenerateDraft={onRegenerateDraft}
        onClearDraft={onClearDraft}
        generating={generating}
        sending={sending}
      />
    </div>
  );
}