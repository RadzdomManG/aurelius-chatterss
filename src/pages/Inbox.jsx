import React from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { generateDraft } from "@/lib/ai-service";
import ConversationList from "@/components/inbox/ConversationList";
import ChatThread from "@/components/inbox/ChatThread";
import Inspector from "@/components/inbox/Inspector";
import EmptyState from "@/components/shared/EmptyState";
import ErrorBoundary from "@/components/ErrorBoundary";
import CreatorSelector from "@/components/shared/CreatorSelector";
import { useCreator } from "@/lib/creator-context";
import { MessageSquare, Plug, AlertCircle } from "lucide-react";

function PanelFallback({ error, reset }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <AlertCircle className="h-6 w-6 text-destructive" />
      <p className="text-sm text-muted-foreground">This panel crashed. Try reloading.</p>
      {reset && (
        <button onClick={reset} className="text-xs text-primary hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export default function Inbox() {
  const { selectedCreatorId, selectedCreator, selectedConnection, isConnected } = useCreator();
  const creator = selectedCreator;
  const connection = selectedConnection;
  const hasConnection = isConnected;
  const [conversations, setConversations] = React.useState([]);
  const [fans, setFans] = React.useState({});
  const [memories, setMemories] = React.useState([]);
  const [persona, setPersona] = React.useState(null);
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
  const [automationSettings, setAutomationSettings] = React.useState(null);
  // All conversation ids belonging to the currently selected fan. A new
  // message can land in a DUPLICATE conversation record for the same fan
  // (ingest upserts by fan_id, but old sync-created duplicates persist).
  // Tracking the full set lets realtime + polling surface every message
  // in the thread regardless of which record it was stored against.
  const activeConvIdsRef = React.useRef([]);
  // Request token so a stale (older) loadMessages can never overwrite the
  // current view after the operator switches conversations.
  const loadTokenRef = React.useRef(0);

  // Keep a ref of the fans map so async callbacks (realtime, ensureFan) can
  // check membership without stale-closure issues.
  const fansRef = React.useRef({});
  React.useEffect(() => { fansRef.current = fans; }, [fans]);

  // Lazily fetch a fan record that isn't in the local map yet (e.g. a fan
  // created by a webhook after initial load, or one beyond the initial
  // page). Prevents "Unknown / @unknown" when Fanvue actually has identity.
  const ensureFan = React.useCallback(async (fanId) => {
    if (!fanId) return;
    if (fansRef.current[fanId]) return;
    fansRef.current = { ...fansRef.current, [fanId]: { _loading: true } };
    try {
      const fan = await base44.entities.Fan.get(fanId);
      setFans((prev) => ({ ...prev, [fanId]: fan }));
    } catch (e) {
      // leave placeholder so we don't hammer the API on every render
    }
  }, []);

  // Load data scoped to the selected creator. Re-runs when the operator
  // switches model via the shared selector.
  React.useEffect(() => {
    if (!selectedCreatorId) {
      setConversations([]);
      setFans({});
      setSelectedId(null);
      setMessages([]);
      setLoadingConvos(false);
      return;
    }
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCreatorId]);

  const loadInitialData = async () => {
    try {
      setLoadingConvos(true);
      setSelectedId(null);
      setMessages([]);
      activeConvIdsRef.current = [];
      // Use allSettled so one failed fetch doesn't blank the whole inbox.
      const settled = await Promise.allSettled([
        base44.entities.Conversation.filter({ creator_profile_id: selectedCreatorId }, "-last_message_at", 250),
        base44.entities.Fan.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 500),
        base44.entities.PersonaProfile.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 20),
        base44.entities.AutomationSettings.filter({ creator_profile_id: selectedCreatorId }, "-created_date", 5),
      ]);

      const convos = settled[0].status === "fulfilled" ? settled[0].value : [];
      const fanList = settled[1].status === "fulfilled" ? settled[1].value : [];
      const personas = settled[2].status === "fulfilled" ? settled[2].value : [];
      const settingsList = settled[3].status === "fulfilled" ? settled[3].value : [];

      // Log any failures for debugging without blocking the UI
      settled.forEach((r, i) => {
        if (r.status === "rejected") console.warn(`Inbox fetch ${i} failed:`, r.reason);
      });

      const fanMap = {};
      fanList.forEach((f) => { fanMap[f.id] = f; });
      setFans(fanMap);
      setConversations(convos);

      setPersona(personas.find((p) => p.active) || personas[0] || null);
      setAutomationSettings(settingsList[0] || null);

      if (convos.length > 0) setSelectedId(convos[0].id);

      if (settled[0].status === "rejected") {
        toast.error("Failed to load conversations — retrying...");
      }
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
        if (event.type === "create" && activeConvIdsRef.current.includes(event.data.conversation_id)) {
          setMessages((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            // Dedup by id AND external_uuid so a webhook-created record (real
            // uuid) can't double up with an optimistic local record (null uuid)
            // — the root cause of phantom duplicate bubbles.
            if (list.some((m) => m.id === event.data.id)) return prev;
            if (event.data.external_uuid && list.some((m) => m.external_uuid === event.data.external_uuid)) {
              // Patch the existing optimistic record with the real id/uuid.
              return list.map((m) =>
                m.external_uuid === event.data.external_uuid ? { ...m, ...event.data } : m
              );
            }
            return [...list, event.data];
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
          // Fetch the fan for any conversation whose fan isn't loaded yet
          // (covers brand-new webhook-created fans and fans beyond the
          // initial page — both previously rendered as "Unknown").
          if (event.data?.fan_id) ensureFan(event.data.fan_id);
        }
      });
      setRealtimeStatus("live");
    } catch (err) {
      console.error("Realtime subscription failed:", err);
      setRealtimeStatus("reconnecting");
    }

    // 3-second polling fallback — reconciles BOTH the conversation list AND
    // new messages in the currently open thread (incremental, dedup by id).
    // This is the safety net for when the live subscription misses a
    // service-role-created record (common for webhook-ingested messages).
    const interval = setInterval(async () => {
      try {
        const convIds = activeConvIdsRef.current;
        const [updated, recentMsgs] = await Promise.all([
          selectedCreatorId
            ? base44.entities.Conversation.filter({ creator_profile_id: selectedCreatorId }, "-updated_date", 50)
            : Promise.resolve([]),
          convIds.length > 0
            ? Promise.allSettled(convIds.map((cid) => base44.entities.Message.filter({ conversation_id: cid }, "created_date", 100)))
            : Promise.resolve([]),
        ]);

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

        // Merge any new messages into the open thread (dedup by id AND
        // external_uuid — matches the realtime path; a Fanvue-uuid record
        // patches an optimistic local placeholder instead of stacking).
        const allMsgs = [];
        if (Array.isArray(recentMsgs)) {
          recentMsgs.forEach((r) => { if (r.status === "fulfilled" && Array.isArray(r.value)) allMsgs.push(...r.value); });
        }
        if (allMsgs.length > 0) {
          setMessages((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const map = new Map(list.map((m) => [m.id, m]));
            const uuidIndex = new Map(list.filter((m) => m.external_uuid).map((m) => [m.external_uuid, m.id]));
            let changed = false;
            allMsgs.forEach((m) => {
              const existingByUuid = m.external_uuid ? uuidIndex.get(m.external_uuid) : null;
              if (existingByUuid) {
                const cur = map.get(existingByUuid);
                if (cur && JSON.stringify(cur) !== JSON.stringify(m)) {
                  map.set(existingByUuid, { ...cur, ...m, id: existingByUuid });
                  changed = true;
                }
                return;
              }
              if (!map.has(m.id)) { map.set(m.id, m); changed = true; }
            });
            if (!changed) return prev;
            return Array.from(map.values()).sort(
              (a, b) => new Date(a.created_date) - new Date(b.created_date)
            );
          });
        }

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
  }, [selectedId, selectedCreatorId]);

  // Load messages + memories + persona when conversation selected
  React.useEffect(() => {
    if (!selectedId) return;
    // Clear immediately so the realtime subscription + 3s poll can't merge the
    // previous conversation's messages into the new thread while loadMessages
    // is in flight.
    activeConvIdsRef.current = [];
    setMessages([]);
    loadMessages(selectedId);
    loadMemories(selectedId);
  }, [selectedId]);

  // Always make sure the selected conversation's fan is in the local map.
  // Derive from selectedId here (selectedConversation is declared below, so we
  // can't reference it in the dependency array without hitting the temporal
  // dead zone — which would crash the whole app on render).
  React.useEffect(() => {
    const conv = conversations.find((c) => c.id === selectedId);
    if (conv?.fan_id) ensureFan(conv.fan_id);
  }, [selectedId, conversations]);

  const loadMessages = async (convId) => {
    const myToken = ++loadTokenRef.current;
    try {
      setLoadingMessages(true);
      const conv = conversations.find((c) => c.id === convId);

      // Load messages across ALL conversation records for this fan. A new
      // message can be ingested into a duplicate conversation record for the
      // same fan (ingest upserts by fan_id but old sync-created duplicates
      // persist), which is why the inbox showed a new message badge while the
      // thread loaded an old conversation. Merging the full set fixes this.
      // Sort newest-first so the active record (where new messages land) is
      // always included even when many duplicate records exist.
      let convIds = [convId];
      if (conv?.fan_id && conv?.creator_profile_id) {
        try {
          const allConvos = await base44.entities.Conversation.filter(
            { creator_profile_id: conv.creator_profile_id, fan_id: conv.fan_id },
            "-created_date",
            100
          );
          if (allConvos && allConvos.length) convIds = allConvos.map((c) => c.id);
        } catch (e) {}
      }
      // Bail if the operator switched away from this conversation during the
      // awaits — a stale fetch must never overwrite the current view.
      if (myToken !== loadTokenRef.current) return;
      activeConvIdsRef.current = convIds;

      const msgResults = await Promise.allSettled(
        convIds.map((cid) => base44.entities.Message.filter({ conversation_id: cid }, "created_date", 100))
      );
      if (myToken !== loadTokenRef.current) return;
      const merged = new Map();
      msgResults.forEach((r) => {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          r.value.forEach((m) => {
            const key = m.external_uuid ? `u:${m.external_uuid}` : `i:${m.id}`;
            if (!merged.has(key)) merged.set(key, m);
          });
        }
      });
      const msgs = Array.from(merged.values()).sort(
        (a, b) => new Date(a.created_date) - new Date(b.created_date)
      );
      setMessages(msgs);

      // Load pending AI draft for review (from auto-processing) — check
      // across the fan's conversations so a draft on a duplicate record still
      // surfaces.
      const pendingResults = await Promise.allSettled(
        convIds.map((cid) => base44.entities.AIJob.filter({ conversation_id: cid, status: "needs_approval" }, "-created_date", 1))
      );
      if (myToken !== loadTokenRef.current) return;
      let pendingJob = null;
      pendingResults.forEach((r) => { if (r.status === "fulfilled" && r.value[0] && !pendingJob) pendingJob = r.value[0]; });
      if (pendingJob?.reply_text) {
        setDraft({
          reply: pendingJob.reply_text,
          confidence: pendingJob.confidence,
          jobId: pendingJob.id,
          ppvCents: pendingJob.ppv_cents || null,
          mediaUuids: Array.isArray(pendingJob.attached_media_uuids) && pendingJob.attached_media_uuids.length
            ? pendingJob.attached_media_uuids
            : null,
          contentSetId: pendingJob.content_set_id || null,
        });
      } else {
        setDraft(null);
      }

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
    } catch (err) {
      console.error("Failed to load memories:", err);
    }
  };

  const selectedConversation = conversations.find((c) => c.id === selectedId);
  const selectedFan = selectedConversation ? fans[selectedConversation.fan_id] : null;

  const handleSend = async ({ ppvCents, mediaUuids, mediaPreviewUuid } = {}) => {
    if ((!composerValue.trim() && !mediaUuids?.length) || !selectedId) return;
    const body = composerValue.trim();
    setComposerValue("");
    setDraft(null);

    try {
      setSending(true);

      // Optimistic send: store as "pending" so the bubble shows a sending
      // state, then flip to "sent" on Fanvue confirm or "failed" (with a
      // Retry button) on error — never a silent phantom sent bubble.
      const msg = await base44.entities.Message.create({
        creator_profile_id: selectedConversation.creator_profile_id,
        conversation_id: selectedId,
        sender_type: "creator",
        body,
        media: mediaUuids || null,
        ppv_cents: ppvCents || null,
        source: "manual",
        send_status: "pending",
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

      // Attempt Fanvue delivery via backend function — patch the exact record
      // by messageId so the outbound webhook doesn't duplicate it.
      try {
        await base44.functions.invoke("send-message", {
          conversationId: selectedId,
          body,
          ppvCents: ppvCents || null,
          mediaUuids: mediaUuids || null,
          mediaPreviewUuid: mediaPreviewUuid || null,
          messageId: msg.id,
        });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "sent" } : m)));
        toast.success("Message sent to Fanvue");
      } catch (fnErr) {
        await base44.entities.Message.update(msg.id, { send_status: "failed" }).catch(() => {});
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "failed" } : m)));
        toast.error("Fanvue delivery failed — tap Retry on the message");
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
    // Carry the AI's locked content + price so approving a draft actually
    // delivers a PPV, not a free text bubble.
    const draftPpvCents = draft.ppvCents || null;
    const draftMediaUuids = draft.mediaUuids || null;

    // PPV cooldown gate (manual approve path): mirror the AI processor's
    // send-time re-check so approving a PPV draft shortly after an auto PPV
    // never sends two offers back-to-back. Block the PPV but still send the
    // conversational text so the chat stays alive.
    if (draftPpvCents && draftPpvCents > 0 && conv?.last_ppv_offer_at) {
      const minMinutes = Math.max(automationSettings?.ppv_min_minutes_between_offers || 10, 10);
      const minutesSince = (Date.now() - new Date(conv.last_ppv_offer_at).getTime()) / 60000;
      if (minutesSince < minMinutes) {
        toast.error(`PPV on cooldown — last offer ${minutesSince.toFixed(0)} min ago (min ${minMinutes}). Sending text only.`);
        // Send as a free conversational message instead.
        try {
          setSending(true);
          const msg = await base44.entities.Message.create({
            creator_profile_id: conv.creator_profile_id,
            conversation_id: selectedId,
            sender_type: "creator",
            body: reply,
            media: null,
            ppv_cents: null,
            source: "ai",
            send_status: "pending",
          });
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          const nowIso = new Date().toISOString();
          await base44.entities.Conversation.update(selectedId, {
            last_message_at: nowIso,
            last_message_preview: reply,
            last_sender_type: "creator",
          });
          setConversations((prev) => prev.map((c) => c.id === selectedId ? { ...c, last_message_at: nowIso, last_message_preview: reply, last_sender_type: "creator" } : c));
          if (jobId) await base44.entities.AIJob.update(jobId, { status: "completed" }).catch(() => {});
          try {
            await base44.functions.invoke("send-message", { conversationId: selectedId, body: reply, ppvCents: null, mediaUuids: null, mediaPreviewUuid: null, messageId: msg.id });
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "sent" } : m)));
          } catch (fnErr) {
            await base44.entities.Message.update(msg.id, { send_status: "failed" }).catch(() => {});
            setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "failed" } : m)));
          }
        } finally {
          setSending(false);
        }
        setDraft(null);
        setComposerValue("");
        return;
      }
    }

    setDraft(null);
    setComposerValue("");

    try {
      setSending(true);

      const msg = await base44.entities.Message.create({
        creator_profile_id: conv.creator_profile_id,
        conversation_id: selectedId,
        sender_type: "creator",
        body: reply,
        media: draftMediaUuids || null,
        ppv_cents: draftPpvCents || null,
        source: "ai",
        send_status: "pending",
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
        await base44.functions.invoke("send-message", {
          conversationId: selectedId,
          body: reply,
          ppvCents: draftPpvCents,
          mediaUuids: draftMediaUuids,
          mediaPreviewUuid: draftMediaUuids ? draftMediaUuids[0] : null,
          messageId: msg.id,
        });
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "sent" } : m)));
        toast.success("AI draft sent to Fanvue");
      } catch (fnErr) {
        await base44.entities.Message.update(msg.id, { send_status: "failed" }).catch(() => {});
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, send_status: "failed" } : m)));
        toast.error("Fanvue delivery failed — tap Retry on the message");
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

  const handleRetryMessage = async (message) => {
    try {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, send_status: "pending" } : m)));
      await base44.entities.Message.update(message.id, { send_status: "pending" }).catch(() => {});
      await base44.functions.invoke("send-message", {
        conversationId: message.conversation_id,
        body: message.body,
        ppvCents: message.ppv_cents || null,
        mediaUuids: Array.isArray(message.media) && message.media.length ? message.media : null,
        mediaPreviewUuid: Array.isArray(message.media) && message.media.length ? message.media[0] : null,
        messageId: message.id,
      });
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, send_status: "sent" } : m)));
      toast.success("Message sent to Fanvue");
    } catch (fnErr) {
      await base44.entities.Message.update(message.id, { send_status: "failed" }).catch(() => {});
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, send_status: "failed" } : m)));
      toast.error("Fanvue delivery failed");
    }
  };

  return (
    <div className="flex h-full">
      <ErrorBoundary fallback={({ error, reset }) => <PanelFallback error={error} reset={reset} />}>
        <ConversationList
          conversations={conversations}
          fans={fans}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loadingConvos}
          hasConnection={hasConnection}
          realtimeStatus={realtimeStatus}
        />
      </ErrorBoundary>
      {selectedConversation ? (
        <>
          <ErrorBoundary fallback={({ error, reset }) => <PanelFallback error={error} reset={reset} />}>
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
            onRetryMessage={handleRetryMessage}
            generating={generating}
            sending={sending}
            loading={loadingMessages}
            ppvDefaultCents={automationSettings?.default_ppv_cents || 1200}
          />
          </ErrorBoundary>
          <ErrorBoundary fallback={({ error, reset }) => <PanelFallback error={error} reset={reset} />}>
            <Inspector
              fan={selectedFan}
              memories={memories}
              conversation={selectedConversation}
              creator={creator}
              aiState={aiState}
            />
          </ErrorBoundary>
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