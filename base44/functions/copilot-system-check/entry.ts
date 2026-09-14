// copilot-system-check — agent tool that aggregates system health: connection
// status, missing OAuth scopes, webhook signature failures, recent AI errors,
// circuit-breaker state, and global pause flag. Returns a single snapshot.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

const REQUIRED_SCOPES = ["read:insights", "read:media", "write:chat", "write:post", "read:chat", "read:fan"];

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try { body = await req.json(); } catch (e) {}

  try {
    const base44 = createClientFromRequest(req);
    try { await base44.auth.me(); } catch (e) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { creatorProfileId } = body;

    // --- Connections ---
    const allConns = creatorProfileId
      ? await base44.asServiceRole.entities.FanvueConnection.filter({ creator_profile_id: creatorProfileId }, "-created_date", 10)
      : await base44.asServiceRole.entities.FanvueConnection.list("-created_date", 50);
    const connections = (allConns || [])
      .filter((c: any) => c.status === "connected")
      .map((c: any) => {
        const granted = c.granted_scopes || [];
        const missing = REQUIRED_SCOPES.filter((s: string) => !granted.includes(s));
        return {
          creatorProfileId: c.creator_profile_id,
          status: c.status,
          scopesGranted: granted.length,
          missingScopes: missing,
          lastSyncAt: c.last_sync_at,
          syncStatus: c.sync_status,
        };
      });

    // --- Webhook health (signature failures in the last hour) ---
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const sigFailLogs = await base44.asServiceRole.entities.ActivityLog.filter({ event_type: "webhook.signature_failed" }, "-created_date", 20);
    const recentSigFailures = (sigFailLogs || []).filter((l: any) => l.created_date > oneHourAgo).length;
    const unmatchedLogs = await base44.asServiceRole.entities.ActivityLog.filter({ event_type: "webhook.unmatched_creator" }, "-created_date", 20);
    const recentUnmatched = (unmatchedLogs || []).filter((l: any) => l.created_date > oneHourAgo).length;

    // --- Recent AI errors ---
    const aiErrors = await base44.asServiceRole.entities.ActivityLog.filter({ event_type: "ai.failed", status: "error" }, "-created_date", 10);
    const recentAiErrors = (aiErrors || []).slice(0, 5).map((l: any) => ({
      message: (l.message || "").slice(0, 200),
      createdDate: l.created_date,
    }));

    // --- Automation + circuit breaker per creator ---
    let automation = [];
    const creatorIds = creatorProfileId
      ? [creatorProfileId]
      : connections.map((c: any) => c.creatorProfileId);
    for (const cpid of creatorIds.slice(0, 10)) {
      const [creators, settings] = await Promise.all([
        base44.asServiceRole.entities.CreatorProfile.filter({ id: cpid }, "-created_date", 1),
        base44.asServiceRole.entities.AutomationSettings.filter({ creator_profile_id: cpid }, "-created_date", 1),
      ]);
      const cr = creators[0];
      const st = settings[0] || {};
      automation.push({
        creatorProfileId: cpid,
        displayName: cr?.display_name,
        automationMode: cr?.automation_mode,
        status: cr?.status,
        circuitBreakerFailures: st.consecutive_send_failures || 0,
        circuitBreakerThreshold: st.circuit_breaker_threshold || 5,
        ppvAllowed: st.ppv_allowed,
        activeHoursEnabled: st.active_hours_enabled,
        runnerStatus: st.runner_status,
        runnerLastRunAt: st.runner_last_run_at,
      });
    }

    // --- Global pause ---
    const appConfigs = await base44.asServiceRole.entities.AppConfig.list("-created_date", 1);
    const globalPaused = appConfigs[0]?.paused === true;

    return Response.json({
      success: true,
      connections,
      webhookHealth: {
        recentSignatureFailures: recentSigFailures,
        recentUnmatchedEvents: recentUnmatched,
        healthy: recentSigFailures < 5 && recentUnmatched < 5,
      },
      recentAIErrors: recentAiErrors,
      automation,
      globalPaused,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}