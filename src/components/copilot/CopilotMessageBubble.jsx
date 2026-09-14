import React from "react";
import ReactMarkdown from "react-markdown";
import { Check, X, Loader2, ChevronDown, ChevronRight, Wrench } from "lucide-react";

function ToolCallCard({ toolCall }) {
  const [expanded, setExpanded] = React.useState(false);
  const rawArgs = toolCall?.arguments_string || "";
  let parsedArgs = rawArgs;
  try { parsedArgs = JSON.parse(rawArgs); } catch (e) { /* keep raw */ }

  const rawResult = toolCall?.results;
  let parsedResult = rawResult;
  if (typeof rawResult === "string") {
    try { parsedResult = JSON.parse(rawResult); } catch (e) { /* keep raw */ }
  }

  const status = toolCall?.status || "";
  const failed = status === "failed" || status === "error" ||
    (typeof rawResult === "string" && /error|failed/i.test(rawResult)) ||
    (parsedResult && typeof parsedResult === "object" && parsedResult.success === false);

  const hide = toolCall?.display_projection?.hide_details && toolCall?.display_projection?.details_redacted;
  const label = failed
    ? (toolCall?.display_projection?.error_label || "Failed")
    : (status === "pending" || status === "running" || status === "in_progress"
      ? (toolCall?.display_projection?.active_label || "Executing...")
      : (toolCall?.display_projection?.label || "Executed"));

  const name = toolCall?.name || "tool";

  return (
    <div className="mt-1.5 rounded-lg border border-border bg-muted/40 text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/60"
      >
        {failed ? (
          <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : status === "pending" || status === "running" || status === "in_progress" ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        ) : (
          <Check className="h-3.5 w-3.5 shrink-0 text-success" />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="font-medium text-foreground">{name}</span>
        <span className={failed ? "text-destructive" : "text-muted-foreground"}>— {label}</span>
        {!hide && (
          <span className="ml-auto">
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </span>
        )}
      </button>
      {!hide && expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2">
          {rawArgs && (
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Parameters</p>
              <pre className="overflow-x-auto rounded bg-background p-2 text-[11px] text-foreground">{typeof parsedArgs === "string" ? parsedArgs : JSON.stringify(parsedArgs, null, 2)}</pre>
            </div>
          )}
          {rawResult != null && (
            <div>
              <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Result</p>
              <pre className="overflow-x-auto rounded bg-background p-2 text-[11px] text-foreground">{typeof parsedResult === "string" ? parsedResult : JSON.stringify(parsedResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CopilotMessageBubble({ message }) {
  const isUser = message?.role === "user";

  // Strip the context preamble from user messages for display
  let displayContent = message?.content || "";
  let attachedImages = [];
  if (isUser && Array.isArray(message?.file_urls) && message.file_urls.length > 0) {
    attachedImages = message.file_urls.filter((u) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u));
  }
  // Remove the [Managing creator: ...] and [Attached vault media: ...] preamble lines
  if (isUser) {
    displayContent = displayContent
      .replace(/^\[Managing creator:[\s\S]*?\]\s*/i, "")
      .replace(/^\[Attached vault media[^\]]*\]\s*/i, "")
      .trim();
  }

  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div className={`max-w-[88%] ${isUser ? "ml-auto" : "mr-auto"}`}>
        {displayContent && (
          isUser ? (
            <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
              {displayContent.split("\n").map((line, i) => <p key={i}>{line}</p>)}
            </div>
          ) : (
            <div className="rounded-2xl rounded-bl-sm bg-card border border-border px-3.5 py-2 text-sm text-foreground">
              <ReactMarkdown className="text-sm leading-relaxed [&>*]:my-1 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold">{displayContent}</ReactMarkdown>
            </div>
          )
        )}
        {attachedImages.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {attachedImages.map((url, i) => (
              <img key={i} src={url} alt="upload" className="h-20 w-20 rounded-lg border border-border object-cover" />
            ))}
          </div>
        )}
        {message?.tool_calls?.map((tc, idx) => (
          <ToolCallCard key={idx} toolCall={tc} />
        ))}
      </div>
    </div>
  );
}