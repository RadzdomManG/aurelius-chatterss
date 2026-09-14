// process-rescue-offers — RETIRED.
// The persona now owns ALL re-offers and discounts (the fixed ladder/rescue
// system was retired in favor of persona-owned, negotiable pricing). This
// function is kept as a no-op so any lingering scheduled workflow invocation
// doesn't error; the "PPV Rescue" workflow should be deactivated separately.
import { createClientFromRequest } from "npm:@base44/sdk@0.8.48";

export default async function (req: Request): Promise<Response> {
  const _base44 = createClientFromRequest(req);
  return Response.json({ success: true, retired: true, skipped: true });
}