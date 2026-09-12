import React from "react";
import { format } from "date-fns";
import { Bot, Lock, AlertCircle, RefreshCw } from "lucide-react";
import MessageMedia from "@/components/inbox/MessageMedia";

export default function MessageBubble({ message, creatorProfileId, onRetry }) {
  const isFan = message.sender_type === "fan";
  const isSystem = message.sender_type === "system";
  // AI origin is signaled by source === "ai" (the processor stores AI replies
  // as sender_type "creator" so Fanvue sees them as the creator, with source
  // "ai" as the operator cue). Detecting via sender_type === "ai" never matched.
  const isAI = message.source === "ai";
  const isFailed = message.send_status === "failed";
  const isPending = message.send_status === "pending";
  const hasMedia = Array.isArray(message.media) && message.media.length > 0;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.body}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isFan ? "justify-start" : "justify-end"} px-4 py-1`}>
      <div className={`flex max-w-[75%] flex-col gap-1 ${isFan ? "items-start" : "items-end"}`}>
        {/* Header label */}
        {(isAI || isPending) && (
          <div className={`flex items-center gap-1.5 px-1 ${isFan ? "" : "flex-row-reverse"}`}>
            {isAI && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                <Bot className="h-3 w-3" />
                AI
              </span>
            )}
            {isPending && (
              <span className="text-[10px] text-muted-foreground/60">sending…</span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            isFan
              ? "rounded-bl-md bg-secondary text-secondary-foreground"
              : isAI
              ? `rounded-br-md border bg-primary/5 text-foreground ${
                  isFailed ? "border-destructive/50" : "border-primary/20"
                }`
              : `rounded-br-md bg-primary text-primary-foreground ${
                  isFailed ? "ring-1 ring-destructive/50" : ""
                }`
          }`}
        >
          {/* PPV lock indicator */}
          {message.ppv_cents > 0 && (
            <div
              className={`mb-1 flex items-center gap-1 text-xs font-medium ${
                isFan ? "text-warning" : "opacity-80"
              }`}
            >
              <Lock className="h-3 w-3" />
              PPV ${(message.ppv_cents / 100).toFixed(2)}
            </div>
          )}

          {/* Media thumbnails */}
          {hasMedia && (
            <MessageMedia mediaUuids={message.media} creatorProfileId={creatorProfileId} />
          )}

          {message.body && (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          )}
          {hasMedia && !message.body && (
            <p className="text-xs italic opacity-60">[media only]</p>
          )}

          {/* Failed-send footer */}
          {isFailed && (
            <div className="mt-2 flex items-center gap-2 border-t border-destructive/30 pt-1.5">
              <span className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertCircle className="h-3 w-3" />
                Failed to send
              </span>
              {onRetry && (
                <button
                  onClick={() => onRetry(message)}
                  className="flex items-center gap-1 rounded text-[11px] font-medium text-destructive hover:underline"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="px-1 text-[10px] text-muted-foreground/60">
          {message.created_date
            ? format(new Date(message.created_date), "MMM d, h:mm a")
            : ""}
        </span>
      </div>
    </div>
  );
}