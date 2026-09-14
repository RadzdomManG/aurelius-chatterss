import React from "react";
import { base44 } from "@/api/base44Client";

// Plan context — loads the current user's org, plan tier, and usage from the
// get-my-plan backend function. Provides a single hook (usePlan) that pages
// and components use to gate features (e.g. "can I connect another creator?")
// and show upgrade prompts.

const PlanContext = React.createContext(null);

export function PlanProvider({ children }) {
  const [planData, setPlanData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await base44.functions.invoke("get-my-plan", {});
      setPlanData(res);
      setError(null);
    } catch (e) {
      setError(e.message || "Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const value = React.useMemo(() => ({
    ...planData,
    loading,
    error,
    reload: load,
    // Convenience flags
    planTier: planData?.organization?.planTier || "free",
    planStatus: planData?.organization?.planStatus || "active",
    isPlatformAdmin: planData?.isPlatformAdmin || false,
    isSuspended: planData?.organization?.planStatus === "suspended",
    isTrial: planData?.organization?.planStatus === "trial",
    canConnectMoreCreators: (planData?.usage?.creatorsConnected || 0) < (planData?.plan?.maxCreators || 1),
    canUseCopilotBulk: planData?.plan?.copilotBulkScheduling || false,
    aiUsagePercent: planData?.usage?.aiUsagePercent || 0,
    aiMessagesRemaining: Math.max(0, (planData?.plan?.maxAiMessagesPerMonth || 0) - (planData?.usage?.aiJobsProcessed || 0)),
  }), [planData, loading, error]);

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = React.useContext(PlanContext);
  if (!ctx) {
    return {
      loading: true, error: null, organization: null, plan: null, usage: null,
      planTier: "free", planStatus: "active", isPlatformAdmin: false,
      isSuspended: false, isTrial: false,
      canConnectMoreCreators: false, canUseCopilotBulk: false,
      aiUsagePercent: 0, aiMessagesRemaining: 0, reload: async () => {},
    };
  }
  return ctx;
}