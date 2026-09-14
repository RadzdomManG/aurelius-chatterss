// webhook-health-check — scheduled check that monitors webhook signature
// failure rates and unmatched events. Fanvue auto-disables webhook
// subscriptions after repeated HMAC signature failures; this function counts
// recent failures and alerts the operator before the subscription is disabled.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

const ALERT_THRESHOLD = 5; // alert after 5 signature failures in the window
const WINDOW_HOURS = 1;

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);

  let failureCount = 0;
  try {
    const logs = await base44.asServiceRole.entities.ActivityLog.filter(
      { event_type: "webhook.signature_failed" },
      "-created_date",
      50
    );
    const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
    failureCount = logs.filter((l: any) => new Date(l.created_date).getTime() > cutoff).length;
  } catch (e) {}

  let unmatchedCount = 0;
  try {
    const unmatchedLogs = await base44.asServiceRole.entities.ActivityLog.filter(
      { event_type: "webhook.unmatched_creator" },
      "-created_date",
      50
    );
    const cutoff = Date.now() - WINDOW_HOURS * 60 * 60 * 1000;
    unmatchedCount = unmatchedLogs.filter((l: any) => new Date(l.created_date).getTime() > cutoff).length;
  } catch (e) {}

  const healthy = failureCount < ALERT_THRESHOLD;

  if (!healthy) {
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        event_type: "webhook.health_alert",
        status: "error",
        message: `Webhook health alert: ${failureCount} signature failures in the last hour (threshold ${ALERT_THRESHOLD}). Fanvue may auto-disable the subscription — verify FANVUE_WEBHOOK_SECRET.`,
        metadata: { failureCount, threshold: ALERT_THRESHOLD, windowHours: WINDOW_HOURS },
      });
    } catch (e) {}
  }

  if (unmatchedCount >= 3) {
    try {
      await base44.asServiceRole.entities.ActivityLog.create({
        event_type: "webhook.unmatched_alert",
        status: "warning",
        message: `${unmatchedCount} unmatched webhook events in the last hour — events carry creator UUIDs with no mapped connection. Check OAuth connections.`,
        metadata: { unmatchedCount, windowHours: WINDOW_HOURS },
      });
    } catch (e) {}
  }

  return Response.json({ success: true, healthy, failureCount, unmatchedCount, threshold: ALERT_THRESHOLD });
}