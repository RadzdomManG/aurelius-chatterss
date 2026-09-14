import React from "react";
import { base44 } from "@/api/base44Client";
import { useCreator } from "@/lib/creator-context";
import { toast } from "sonner";
import { X, Sparkles, Bot, AlertTriangle } from "lucide-react";
import CopilotMessageBubble from "./CopilotMessageBubble";
import CopilotComposer from "./CopilotComposer";

const AGENT_NAME = "copilot";
const LS_KEY = "aurelius.copilot.conversationId";

export default function CopilotPanel({ open, onClose }) {
  const { selectedCreator, isConnected } = useCreator();
  const [conversation, setConversation] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const scrollRef = React.useRef(null);
  const subscribedRef = React.useRef(null);

  // Load or create conversation when panel opens
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let convId = null;
        try { convId = localStorage.getItem(LS_KEY); } catch (e) {}
        let conv = null;
        if (convId) {
          try { conv = await base44.agents.getConversation(convId); } catch (e) { conv = null; }
        }
        if (!conv || !conv.id) {
          conv = await base44.agents.createConversation({
            agent_name: AGENT_NAME,
            metadata: { name: "Copilot" },
          });
          try { localStorage.setItem(LS_KEY, conv.id); } catch (e) {}
        }
        if (cancelled) return;
        setConversation(conv);
        setMessages(conv.messages || []);
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to start Copilot");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Subscribe to conversation updates
  React.useEffect(() => {
    if (!conversation?.id) return;
    if (subscribedRef.current === conversation.id) return;
    subscribedRef.current = conversation.id;
    const unsubscribe = base44.agents.subscribeToConversation(conversation.id, (data) => {
      setMessages(data.messages || []);
    });
    return () => { subscribedRef.current = null; unsubscribe(); };
  }, [conversation?.id]);

  // Auto-scroll to bottom on new messages
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (text, fileUrls, vaultUuids) => {
    if (!conversation) return;
    if (!text && !fileUrls?.length && !vaultUuids?.length) return;

    // Build message with creator context so the agent knows which creator to act on
    const creatorLine = selectedCreator
      ? `[Managing creator: ${selectedCreator.display_name} | ID: ${selectedCreator.id} | Connection: ${isConnected ? "connected" : "disconnected"}]`
      : `[No creator selected — ask the operator to select a creator first]`;
    let content = creatorLine;
    if (vaultUuids?.length) {
      content += `\n[Attached vault media UUIDs: ${vaultUuids.join(", ")}]`;
    }
    if (text) content += `\n${text}`;

    try {
      await base44.agents.addMessage(conversation, {
        role: "user",
        content,
        ...(fileUrls?.length ? { file_urls: fileUrls } : {}),
      });
    } catch (e) {
      toast.error(e.message || "Failed to send message");
    }
  };

  const isThinking = React.useMemo(() => {
    if (!messages.length) return false;
    const last = messages[messages.length - 1];
    if (last.role === "user") return true;
    // Also show thinking if any tool call is still running
    if (last.tool_calls?.some((tc) => tc.status === "pending" || tc.status === "running" || tc.status === "in_progress")) {
      return true;
    }
    return false;
  }, [messages]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] transition-opacity" onClick={onClose} />
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[420px] flex-col bg-background shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Copilot</h2>
              <p className="text-[10px] text-muted-foreground">
                {selectedCreator ? selectedCreator.display_name : "No creator"} · {isConnected ? "connected" : "disconnected"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto scrollbar-thin p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">Make sure the Copilot agent is configured and you have access.</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Hey, I'm your Copilot</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tell me what to do — I'll post pictures, mass message your fans, or DM everyone online.
                </p>
              </div>
              <div className="space-y-1.5 text-left">
                {[
                  "Post a lingerie teaser from my vault at $10",
                  "Mass message all my subscribers a 20% off PPV link",
                  "Message everyone online right now",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s, [], [])}
                    className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  >
                    "{s}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <CopilotMessageBubble key={msg.id || i} message={msg} />
              ))}
              {isThinking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "0ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "150ms" }} />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span>Working on it…</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Composer */}
        {error ? null : (
          <CopilotComposer onSend={handleSend} disabled={loading || !conversation} />
        )}
      </div>
    </>
  );
}