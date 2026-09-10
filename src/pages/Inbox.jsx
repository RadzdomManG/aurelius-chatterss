import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { generateDraft } from "@/lib/ai-service";
import ConversationList from "@/components/inbox/ConversationList";
import ChatThread from "@/components/inbox/ChatThread";
import Inspector from "@/components/inbox/Inspector";
import EmptyState from "@/components/shared/EmptyState";
import { MessageSquare, Plug } from "lucide-react";

export default function Inbox() {
  const [conversations, setConversations] = React.useState([]);
  const [fans, setFans] = React.useState({});
  const [memories, setMemories] = React.useState([]);
  const [creator, setCreator] = React.useState(null);
  const [persona, setPersona] = React.useState(null);
  const [connection, setConnection] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [loadingConvos, setLoadingConvos] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [generating, setGenerating] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [aiState, setAiState] = React.useState(null);
  const [realtimeStatus, setRealtimeStatus] = React.useState("live");

  // Load initial data
  React.useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingConvos(true);
      const [convos, fanList, creators, connections, personas] = await Promise.all([
        base44.entities.Conversation.list("-last_message_at", 100),
        base44.entities.Fan.list("-created_date", 200),
        base44.entities.CreatorProfile.list("-created_date", 10),
        base44.entities.FanvueConnection.list("-created_date", 10),
        base44.entities.PersonaProfile.list("-created_date", 20),
      ]);

      const fanMap = {};
      fanList.forEach((f) => { fanMap[f.id] = f; });
      setFans(fanMap);
      setConversations(convos);

      const activeCreator = creators[0] || null;
      setCreator(activeCreator);
      setConnection(connections.find((c) => c.creator_profile_id === activeCreator?.id) || null);
      setPersona(personas.find((p) => p.creator_profile_id === activeCreator?.id && p.active) || null);

      if (convos.length > 0) setSelectedId(convos[0].id);
    } catch (err) {
      console.error("Failed to load inbox:", err);
      toast.error("Failed to load conversations");
    } finally {
      setLoadingConvos(false);
    }
  };

  // Realtime subscriptions + 3-second fallback
  React.useEffect(() => {
    let unsubMessages, unsubConvos;

    try {
      unsubMessages = base44.entities.Message.subscribe((event) => {
        if (event.type === "create" && event.data.conversation_id === selectedId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.data.id)) return prev;
            return [...prev, event.data];
          });
        }
      });
      unsubConvos = base44.entities.Conversation.subscribe((event) => {
        if (event.type === "create" || event.type === "update") {
          setConversations((prev) => {
            const idx = prev.findIndex((c) => c.id === event.data.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = event.data;
              return updated;
            }
            return [event.data, ...prev];
          });
        }
      });
      setRealtimeStatus("live");
    } catch (err) {
      console.error("Realtime subscription failed:", err);
      setRealtimeStatus("reconnecting");
    }

    // 3-second polling fallback
    const interval = setInterval(async () => {
      try {
        const updated = await base44.entities.Conversation.list("-updated_date", 50);
        setConversations((prev) => {
          const map = new Map(prev.map((c) => [c.id, c]));
          let changed = false;
          updated.forEach((c) => {
            const existing = map.get(c.id);
            if (!existing || new Date(c.updated_date) > new Date(existing.updated_date)) {
              map.set(c.id, c);
              changed = true;
            }
          });
          if (!changed) return prev;
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.last_message_at || b.updated_date) - new Date(a.last_message_at || a.updated_date)
          );
        });
        setRealtimeStatus("live");
      } catch (err) {
        setRealtimeStatus("reconnecting");
      }
    }, 3000);

    return () => {
      if (unsubMessages) unsubMessages();
      if (unsubConvos) unsubConvos();
      clearInterval(interval);
    };
  }, [selectedId]);

  // Load messages + memories + persona when conversation selected
  React.useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    loadMemories(selectedId);
  }, [selectedId]);

  const loadMessages = async (convId) => {
    try {
      setLoadingMessages(true);
      const msgs = await base44.entities.Message.filter({ conversation_id: convId }, "created_date", 100);
      setMessages(msgs);

      // Load pending AI draft for review (from auto-processing)
      const pendingJobs = await base44.entities.AIJob.filter(
        { conversation_id: convId, status: "needs_approval" },
        "-created_date",
        1
      );
      if (pendingJobs[0]?.reply_text) {
        setDraft({
          reply: pendingJobs[0].reply_text,
          confidence: pendingJobs[0].confidence,
          jobId: pendingJobs[0].id,
        });
      } else {
        setDraft(null);
      }

      const conv = conversations.find((c) => c.id === convId);
      if (conv && conv.unread_count > 0) {
        await base44.entities.Conversation.update(convId, { unread_count: 0 });
        setConversations((prev) => prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c)));
      }
    } catch (err) {
      console.error("Failed to load messages:", err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadMemories = async (convId) => {
    try {
      const conv = conversations.find((c) => c.id === convId);
      if (!conv) return;
      const mems = await base44.entities.FanMemory.filter({ fan_id: conv.fan_id }, "-created_date", 50);
      setMemories(mems);

      // Load persona for this creator if not already loaded
      if (conv.creator_profile_id && conv.creator_profile_id !== creator?.id) {
        const personas = await base44.entities.PersonaProfile.filter({ creator_profile_id: conv.creator_profile_id }, "-created_date", 5);
        setPersona(personas.find((p) => p.active) || personas[0] || null);
      }
    } catch (err) {
      console.error("Failed to load memories:", err);
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId);
  const selectedFan = selectedConversation ? fans[selectedConversation.fan_id] : null;

  const handleSend = async ({ ppvCents }) => {
    if (!composerValue.trim() || !selectedId) return;
    const body = composerValue.trim();
    setComposerValue("");
    setDraft(null);

    try {
      setSending(true);

      // Store message in database
      const msg = await base44.entities.Message.create({
        creator_profile_id: selectedConversation.creator_profile_id,
        conversation_id: selectedId,
        sender_type: "creator",
        body,
        ppv_cents: ppvCents || null,
        source: "manual",
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      const now = new Date().toISOString();
      await base44.entities.Conversation.update(selectedId, {
        last_message_at: now,
        last_message_preview: body,
        last_sender_type: "creator",
      });
      setConversations((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, last_message_at: now, last_message_preview: body, last_sender_type: "creator" } : c)
      );

      // Attempt Fanvue delivery via backend function
      try {
        await base44.functions.invoke("send-message", {
          conversationId: selectedId,
          body,
          ppvCents: ppvCents || null,
        });
        toast.success("Message sent to Fanvue");
      } catch (fnErr) {
        toast.error("Fanvue delivery failed — message saved locally: " + (fnErr.response?.data?.error || fnErr.message || "Unknown error"));
      }

      await base44.entities.ActivityLog.create({
        creator_profile_id: selectedConversation.creator_profile_id,
        conversation_id: selectedId,
        event_type: "message.sent.manual",
        status: "success",
        message: "Manual message sent",
      });
    } catch (err) {
      console.error("Failed to send:", err);
      toast.error("Error sending message");
      setComposerValue(body);
    } finally {
      setSending(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!selectedId || !selectedFan) return;
    try {
      setGenerating(true);
      setAiState({ state: "processing" });

      const conv = conversations.find((c) => c.id === selectedId);
      await base44.entities.ActivityLog.create({
        creator_profile_id: conv?.creator_profile_id,
        conversation_id: selectedId,
        event_type: "ai.draft.requested",
        status: "info",
        message: "Manual AI draft requested",
      });

      const lastFanMessage = [...messages].reverse().find((m) => m.sender_type === "fan");
      const memoryText = memories.map((m) => `${m.memory_key}: ${m.memory_value}`).join("\n");

      const result = await generateDraft({
        personaInstructions: persona?.instructions,
        fanDisplayName: selectedFan.display_name,
        fanMemory: memoryText,
        recentMessages: messages.slice(-15).map((m) => ({ sender: m.sender_type, text: m.body })),
        newMessage: lastFanMessage?.body || "",
      });

      if (result.error) {
        toast.error(result.error);
        setAiState({ state: "error" });
        return;
      }

      setDraft(result);
      setAiState({
        state: "idle",
        intent: result.intent,
        sentiment: result.sentiment,
        confidence: result.confidence,
      });
      toast.success("Draft generated");
    } catch (err) {
      console.error("Draft generation failed:", err);
      toast.error("Failed to generate draft");
      setAiState({ state: "error" });
    } finally {
      setGenerating(false);
    }
  };

  const handleUseDraft = async () => {
    if (!draft) return;
    setComposerValue(draft.reply);
    setDraft(null);
    const conv = conversations.find((c) => c.id === selectedId);
    if (draft.jobId) {
      await base44.entities.AIJob.update(draft.jobId, { status: "completed" });
    }
    await base44.entities.ActivityLog.create({
      creator_profile_id: conv?.creator_profile_id,
      conversation_id: selectedId,
      event_type: "ai.approved",
      status: "success",
      message: "AI draft approved and loaded into composer",
      metadata: { job_id: draft.jobId, confidence: draft.confidence },
    });
  };

  const handleApproveAndSend = async () => {
    if (!draft || !selectedId) return;
    const reply = draft.reply;
    const conv = conversations.find((c) => c.id === selectedId);
    const jobId = draft.jobId;
    setDraft(null);
    setComposerValue("");

    try {
      setSending(true);

      const msg = await base44.entities.Message.create({
        creator_profile_id: conv.creator_profile_id,
        conversation_id: selectedId,
        sender_type: "creator",
        body: reply,
        source: "ai",
      });
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      const now = new Date().toISOString();
      await base44.entities.Conversation.update(selectedId, {
        last_message_at: now,
        last_message_preview: reply,
        last_sender_type: "creator",
      });
      setConversations((prev) =>
        prev.map((c) => c.id === selectedId ? { ...c, last_message_at: now, last_message_preview: reply, last_sender_type: "creator" } : c)
      );

      if (jobId) {
        await base44.entities.AIJob.update(jobId, { status: "completed" });
      }

      try {
        await base44.functions.invoke("send-message", { conversationId: selectedId, body: reply });
        toast.success("AI draft sent to Fanvue");
      } catch (fnErr) {
        toast.error("Fanvue delivery failed — message saved locally");
      }

      await base44.entities.ActivityLog.create({
        creator_profile_id: conv.creator_profile_id,
        conversation_id: selectedId,
        event_type: "ai.approved_sent",
        status: "success",
        message: "AI draft approved and sent",
        metadata: { job_id: jobId, confidence: draft.confidence },
      });
    } catch (err) {
      console.error("Failed to send draft:", err);
      toast.error("Error sending AI draft");
    } finally {
      setSending(false);
    }
  };

  const handleModeChange = async (mode) => {
    if (!selectedId) return;
    try {
      await base44.entities.Conversation.update(selectedId, { automation_mode_override: mode });
      setConversations((prev) => prev.map((c) => c.id === selectedId ? { ...c, automation_mode_override: mode } : c));
      toast.success(`Automation mode: ${mode}`);
    } catch (err) {
      toast.error("Failed to update automation mode");
    }
  };

  const handleTogglePause = async () => {
    if (!selectedFan) return;
    try {
      const newPaused = !selectedFan.automation_paused;
      await base44.entities.Fan.update(selectedFan.id, { automation_paused: newPaused });
      setFans((prev) => ({ ...prev, [selectedFan.id]: { ...prev[selectedFan.id], automation_paused: newPaused } }));
      toast.success(newPaused ? "AI paused for this fan" : "AI resumed for this fan");
    } catch (err) {
      toast.error("Failed to update fan pause status");
    }
  };

  const hasConnection = connection?.status === "connected";

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        fans={fans}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loadingConvos}
        hasConnection={hasConnection}
        realtimeStatus={realtimeStatus}
      />
      {selectedConversation ? (
        <>
          <ChatThread
            conversation={selectedConversation}
            fan={selectedFan}
            creator={creator}
            messages={messages}
            composerValue={composerValue}
            onComposerChange={setComposerValue}
            onSend={handleSend}
            onGenerateDraft={handleGenerateDraft}
            draft={draft}
            onUseDraft={handleUseDraft}
            onApproveAndSend={handleApproveAndSend}
            onRegenerateDraft={handleGenerateDraft}
            onClearDraft={() => setDraft(null)}
            onModeChange={handleModeChange}
            onTogglePause={handleTogglePause}
            generating={generating}
            sending={sending}
            loading={loadingMessages}
          />
          <Inspector
            fan={selectedFan}
            memories={memories}
            conversation={selectedConversation}
            creator={creator}
            aiState={aiState}
          />
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          {hasConnection ? (
            <EmptyState
              icon={MessageSquare}
              title="No conversations yet"
              description="Conversations will appear here once fans message your connected creator account."
            />
          ) : (
            <EmptyState
              icon={Plug}
              title="Connect Fanvue to begin"
              description="Connect a Fanvue creator account to start receiving and managing fan conversations."
              actionLabel="Go to Models"
              actionTo="/models"
            />
          )}
        </div>
      )}
    </div>
  );
}