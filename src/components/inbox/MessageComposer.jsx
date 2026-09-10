import React from "react";
import { Paperclip, Lock, Sparkles, Send, RefreshCw, Check, DollarSign } from "lucide-react";

export default function MessageComposer({
  value,
  onChange,
  onSend,
  onGenerateDraft,
  draft,
  onUseDraft,
  onApproveAndSend,
  onRegenerateDraft,
  onClearDraft,
  generating,
  sending,
}) {
  const [ppvMode, setPpvMode] = React.useState(false);
  const [ppvAmount, setPpvAmount] = React.useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!value.trim() || sending) return;
    onSend({ ppvCents: ppvMode && ppvAmount ? parseInt(ppvAmount) * 100 : null });
    setPpvMode(false);
    setPpvAmount("");
  };

  return (
    <div className="border-t border-border bg-card">
      {/* AI Draft banner */}
      {draft && (
        <div className="border-b border-primary/15 bg-primary/5 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-medium text-primary">AI Draft</span>
              {draft.confidence && (
                <span className="text-xs text-muted-foreground">
                  · {Math.round(draft.confidence * 100)}% confidence
                </span>
              )}
            </div>
            <button
              onClick={onClearDraft}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          <p className="mb-2 text-sm text-foreground">{draft.reply}</p>
          <div className="flex gap-2">
            <button
              onClick={onUseDraft}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <Check className="h-3.5 w-3.5" />
              Use Draft
            </button>
            {onApproveAndSend && (
              <button
                onClick={onApproveAndSend}
                disabled={sending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                Approve & Send
              </button>
            )}
            <button
              onClick={onRegenerateDraft}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
              Regenerate
            </button>
          </div>
        </div>
      )}

      {/* PPV input */}
      {ppvMode && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Lock className="h-4 w-4 text-warning" />
          <span className="text-sm text-muted-foreground">PPV amount:</span>
          <div className="relative">
            <DollarSign className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              value={ppvAmount}
              onChange={(e) => setPpvAmount(e.target.value)}
              placeholder="0.00"
              className="w-24 rounded-md border border-input bg-background py-1 pl-7 pr-2 text-sm focus:border-ring focus:outline-none"
            />
          </div>
          <button
            onClick={() => setPpvMode(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Composer */}
      <div className="flex items-end gap-2 px-4 py-3">
        <button
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Attach media"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <button
          onClick={() => setPpvMode(!ppvMode)}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-accent ${
            ppvMode ? "text-warning" : "text-muted-foreground hover:text-foreground"
          }`}
          title="PPV message"
        >
          <Lock className="h-4 w-4" />
        </button>
        <button
          onClick={onGenerateDraft}
          disabled={generating}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          title="Generate AI draft"
        >
          <Sparkles className={`h-4 w-4 ${generating ? "animate-pulse" : ""}`} />
          <span className="hidden sm:inline">Draft</span>
        </button>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="max-h-32 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          style={{ minHeight: "36px" }}
        />

        <button
          onClick={handleSend}
          disabled={!value.trim() || sending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          title="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}