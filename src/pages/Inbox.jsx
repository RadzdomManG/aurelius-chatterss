import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import ConversationList from "@/components/inbox/ConversationList";
import ChatThread from "@/components/inbox/ChatThread";
import Inspector from "@/components/inbox/Inspector";

export default function Inbox() {
  const [conversations, setConversations] = React.useState([]);
  const [fans, setFans] = React.useState({});
  const [memories, setMemories] = React.useState([]);
  const [creator, setCreator] = React.useState(null);
  const [selectedId, setSelectedId] = React.useState(null);
  const [messages, setMessages] = React.useState([]);
  const [loadingConvos, setLoadingConvos] = React.useState(true);
  const [loadingMessages, setLoadingMessages] = React.useState(false);
  const [composerValue, setComposerValue] = React.useState("");
  const [draft, setDraft] = React.useState(null);
  const [generating, setGenerating] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [aiState, setAiState] = React.useState(null);

  // Load conversations + fans + creator on mount
  React.useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoadingConvos(true);
      const [convos, fanList, creators] = await Promise.all([
        base44.entities.Conversation.list("-last_message_at", 100),
        base44.entities.Fan.list("-created_date", 200),
        base44.entities.CreatorProfile.list("-created_date", 10),
      ]);

      const fanMap = {};
      fanList.forEach((f) => {
        fanMap[f.id] = f;
      });
      setFans(fanMap);
      setConversations(convos);
      if (creators.length > 0) setCreator(creators[0]);

      if (convos.length > 0) {
        setSelectedId(convos[0].id);
      }
    } catch (err) {
      console.error("Failed to load inbox data:", err);
      toast.error("Failed to load conversations");
    } finally {
      setLoadingConvos(false);
    }
  };

  // Load messages when conversation selected
  React.useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    loadMemories(selectedId);
  }, [selectedId]);

  const loadMessages = async (convId) => {
    try {
      setLoadingMessages(true);
      const msgs = await base44.entities.Message.filter(
        { conversation_id: convId },
        "created_date",
        100
      );
      setMessages(msgs);

      // Mark as read
      const conv = conversations.find((c) => c.id === convId);
      if (conv && conv.unread_count > 0) {
        await base44.entities.Conversation.update(convId, { unread_count: 0 });
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unread_count: 0 } : c))
        );
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
      const mems = await base44.entities.FanMemory.filter(
        { fan_id: conv.fan_id },
        "-created_date",
        50
      );
      setMemories(mems);
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
      const msg = await base44.entities.Message.create({
        organization_id: selectedConversation.organization_id,
        creator_profile_id: selectedConversation.creator_profile_id,
        conversation_id: selectedId,
        sender_type: "creator",
        body,
        ppv_cents: ppvCents || null,
        source: "manual",
      });

      setMessages((prev) => [...prev, msg]);

      // Update conversation
      const now = new Date().toISOString();
      await base44.entities.Conversation.update(selectedId, {
        last_message_at: now,
        last_message_preview: body,
        last_sender_type: "creator",
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId
            ? { ...c, last_message_at: now, last_message_preview: body, last_sender_type: "creator" }
            : c
        )
      );

      // Log activity
      await base44.entities.ActivityLog.create({
        organization_id: selectedConversation.organization_id,
        creator_profile_id: selectedConversation.creator_profile_id,
        conversation_id: selectedId,
        event_type: "message.sent.manual",
        status: "success",
        message: "Manual message sent",
      });

      toast.success("Message sent");
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

      // TODO: Replace with real AIService.generateDraft() call
      // For now, use a mock deterministic response
      await new Promise((r) => setTimeout(r, 800));

      const lastFanMessage = [...messages].reverse().find((m) => m.sender_type === "fan");
      const mockReplies = [
        `Hey ${selectedFan.display_name?.split(" ")[0] || "there"}! Thanks for reaching out 😊 What can I do for you today?`,
        "I appreciate your message! Tell me more about what you're looking for.",
        "That's so sweet of you! I'd love to hear more about what you enjoy.",
      ];
      const reply = mockReplies[messages.length % mockReplies.length];
      const confidence = 0.72 + (messages.length % 3) * 0.05;

      const generatedDraft = {
        reply,
        confidence,
        intent: "conversation",
        sentiment: "positive",
      };

      setDraft(generatedDraft);
      setAiState({
        state: "idle",
        intent: generatedDraft.intent,
        sentiment: generatedDraft.sentiment,
        confidence: generatedDraft.confidence,
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

  const handleUseDraft = () => {
    if (!draft) return;
    setComposerValue(draft.reply);
    setDraft(null);
  };

  const handleModeChange = async (mode) => {
    if (!selectedId) return;
    try {
      await base44.entities.Conversation.update(selectedId, {
        automation_mode_override: mode,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, automation_mode_override: mode } : c
        )
      );
      toast.success(`Automation mode: ${mode}`);
    } catch (err) {
      console.error("Failed to update mode:", err);
      toast.error("Failed to update automation mode");
    }
  };

  const handleTogglePause = async () => {
    if (!selectedFan) return;
    try {
      const newPaused = !selectedFan.automation_paused;
      await base44.entities.Fan.update(selectedFan.id, {
        automation_paused: newPaused,
      });
      setFans((prev) => ({
        ...prev,
        [selectedFan.id]: { ...prev[selectedFan.id], automation_paused: newPaused },
      }));
      toast.success(newPaused ? "AI paused for this fan" : "AI resumed for this fan");
    } catch (err) {
      console.error("Failed to toggle pause:", err);
      toast.error("Failed to update fan pause status");
    }
  };

  return (
    <div className="flex h-full">
      <ConversationList
        conversations={conversations}
        fans={fans}
        selectedId={selectedId}
        onSelect={setSelectedId}
        loading={loadingConvos}
      />
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
    </div>
  );
}