// Shared Fanvue OAuth initiate flow — calls the backend function to build
// the OAuth URL server-side (secrets never touch the browser), then breaks
// out of the preview iframe by navigating the top-level window.
import { base44 } from "@/api/base44Client";

export async function initiateFanvueOAuth() {
  const res = await base44.functions.invoke("fanvue-auth", { action: "initiate" });
  if (!res.data?.authUrl) {
    throw new Error(res.data?.error || "Failed to initiate Fanvue OAuth");
  }
  // Break out of the preview iframe — navigate the top-level browser window.
  // Fanvue's auth page sets X-Frame-Options: DENY, so it can't load inside an iframe.
  try {
    window.top.location.href = res.data.authUrl;
  } catch (e) {
    // Sandbox restriction — fall back to opening in a new tab
    window.open(res.data.authUrl, "_blank");
  }
}