import React from "react";
import { format } from "date-fns";
import { Bot, Lock, DollarSign } from "lucide-react";

export default function MessageBubble({ message }) {
  const isFan = message.sender_type === "fan";
  const isAI = message.sender_type === "ai";
  const isSystem = message.sender_type === "system";

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
      <div className={`max-w-[75%] ${isFan ? "items-start" : "items-end"} flex flex-col gap-1`}>
        {/* Header label */}
        <div className={`flex items-center gap-1.5 px-1 ${isFan ? "" : "flex-row-reverse"}`}>
          {isAI && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
              <Bot className="h-3 w-3" />
              AI
            </span>
          )}
          {isAI && message.source === "ai" && !message.body?.startsWith("[") && (
            <span className="text-[10px] text-muted-foreground/60">draft</span>
          )}
        </div>

        {/* Bubble */}
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm ${
            isFan
              ? "rounded-bl-md bg-secondary text-secondary-foreground"
              : isAI
              ? "rounded-br-md border border-primary/20 bg-primary/5 text-foreground"
              : "rounded-br-md bg-primary text-primary-foreground"
          }`}
        >
          {message.ppv_cents > 0 && (
            <div className="mb-1 flex items-center gap-1 text-xs font-medium opacity-80">
              <Lock className="h-3 w-3" />
              PPV ${(message.ppv_cents / 100).toFixed(2)}
            </div>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
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