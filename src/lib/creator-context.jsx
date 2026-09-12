import React from "react";
import { base44 } from "@/api/base44Client";

// App-level selected-creator state. Every creator-scoped page reads from this
// so the "choose model" choice carries across navigation instead of each page
// defaulting independently. The default resolver prefers the first creator
// whose FanvueConnection is 'connected' so the app never silently lands on a
// disconnected creator (the root cause of the empty PPV vault bug).

const LS_KEY = "aurelius.selectedCreatorId";
const CreatorContext = React.createContext(null);

export function CreatorProvider({ children }) {
  const [creators, setCreators] = React.useState([]);
  const [connections, setConnections] = React.useState([]);
  const [selectedId, setSelectedId] = React.useState(() => {
    try { return localStorage.getItem(LS_KEY) || null; } catch (e) { return null; }
  });
  const [loaded, setLoaded] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [creatorList, connList] = await Promise.all([
        base44.entities.CreatorProfile.list("-created_date", 50),
        base44.entities.FanvueConnection.list("-created_date", 50),
      ]);
      setCreators(Array.isArray(creatorList) ? creatorList : []);
      setConnections(Array.isArray(connList) ? connList : []);
    } catch (e) {
      setCreators([]);
      setConnections([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // One connection per creator — prefer a 'connected' one if multiple exist.
  const connByCreator = React.useMemo(() => {
    const map = {};
    for (const c of connections) {
      const existing = map[c.creator_profile_id];
      if (!existing || (c.status === "connected" && existing.status !== "connected")) {
        map[c.creator_profile_id] = c;
      }
    }
    return map;
  }, [connections]);

  // Default-to-connected resolver:
  //   persisted choice (if still valid) → first connected creator → newest creator
  const effectiveId = React.useMemo(() => {
    if (selectedId && creators.some((c) => c.id === selectedId)) return selectedId;
    const firstConnected = creators.find((c) => connByCreator[c.id]?.status === "connected");
    if (firstConnected) return firstConnected.id;
    return creators[0]?.id || null;
  }, [selectedId, creators, connByCreator]);

  const selectCreator = React.useCallback((id) => {
    setSelectedId(id);
    try { localStorage.setItem(LS_KEY, id || ""); } catch (e) {}
  }, []);

  const selectedCreator = creators.find((c) => c.id === effectiveId) || null;
  const selectedConnection = selectedCreator ? connByCreator[selectedCreator.id] || null : null;
  const isConnected = selectedConnection?.status === "connected";

  const value = {
    creators,
    connections,
    connByCreator,
    selectedCreator,
    selectedCreatorId: effectiveId,
    selectedConnection,
    isConnected,
    selectCreator,
    reloadCreators: load,
    loaded,
  };

  return <CreatorContext.Provider value={value}>{children}</CreatorContext.Provider>;
}

export function useCreator() {
  const ctx = React.useContext(CreatorContext);
  if (!ctx) {
    // Graceful fallback if a page renders outside the provider — never crash.
    return {
      creators: [], connections: [], connByCreator: {},
      selectedCreator: null, selectedCreatorId: null, selectedConnection: null,
      isConnected: false, selectCreator: () => {}, reloadCreators: async () => {}, loaded: false,
    };
  }
  return ctx;
}