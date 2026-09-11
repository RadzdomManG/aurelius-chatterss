import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Bot, Pause } from "lucide-react";

export default function ConversationRow({ conversation, fan, isSelected, onClick }) {
  // Timestamp guard: null/epoch < year 2000 → "New"
  let time = "New";
  if (conversation.last_message_at) {
    const d = new Date(conversation.last_message_at);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2000) {
      time = formatDistanceToNow(d, { addSuffix: false });
    }
  }

  // AI status indicator: check if last message is from fan with no reply
  const lastIsFan = conversation.last_sender_type === "fan";
  const aiStatus = lastIsFan ? "pending" : "replied";

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 border-l-2 px-3 py-3 text-left transition-colors ${
        isSelected
          ? "border-primary bg-accent/50"
          : "border-transparent hover:bg-accent/30"
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {fan?.avatar_url ? (
          <img
            src={fan.avatar_url}
            alt=""
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-sm font-medium text-primary">
            {fan?.display_name?.charAt(0) || "?"}
          </div>
        )}
        {fan?.automation_paused && (
          <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-warning border border-card">
            <Pause className="h-2.5 w-2.5 text-warning-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {fan?.display_name || "Unknown"}
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {aiStatus === "pending" && (
              <span
                className="h-1.5 w-1.5 rounded-full bg-warning animate-pulse"
                title="Awaiting AI reply"
              />
            )}
            <span className="text-xs text-muted-foreground">{time}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {conversation.last_sender_type === "ai" && (
            <Bot className="h-3 w-3 shrink-0 text-primary" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {conversation.last_message_preview || "No messages yet"}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground/70">
            @{fan?.handle || "unknown"}
          </span>
          {fan?.total_spent_cents > 0 && (
            <span className="text-xs text-success">
              ${(fan.total_spent_cents / 100).toFixed(0)}
            </span>
          )}
          {conversation.unread_count > 0 && (
            <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}