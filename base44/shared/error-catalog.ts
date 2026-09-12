// Structured error catalog — standardized error codes so the UI can show
// actionable messages instead of raw stack traces. Every backend function
// and shared module maps its thrown errors through catalogError() before
// persisting to AIJob.last_error / ActivityLog so the inbox and automation
// screens can render a human label + suggested fix.

export type ErrorCode =
  | "FANVUE_RATE_LIMIT"
  | "FANVUE_AUTH_FAILED"
  | "FANVUE_TOKEN_EXPIRED"
  | "FANVUE_SEND_FAILED"
  | "FANVUE_NOT_CONNECTED"
  | "PERSONA_MISSING"
  | "PERSONA_INVALID"
  | "AUTOMATION_STOPPED"
  | "GLOBAL_PAUSED"
  | "FAN_PAUSED"
  | "CONVERSATION_PAUSED"
  | "NO_FAN_MESSAGE"
  | "LATEST_MESSAGE_IS_CREATOR"
  | "DUPLICATE_JOB"
  | "CONVERSATION_LOCKED"
  | "CIRCUIT_BREAKER_TRIPPED"
  | "AI_GENERATION_FAILED"
  | "AI_INVALID_REPLY"
  | "PPV_NO_CONTENT_SET"
  | "PPV_COOLDOWN"
  | "RATE_LIMITED"
  | "UNKNOWN";

interface CatalogEntry {
  label: string;
  fix: string;
  severity: "error" | "warning" | "info";
}

const CATALOG: Record<ErrorCode, CatalogEntry> = {
  FANVUE_RATE_LIMIT: { label: "Fanvue is rate-limiting sends", fix: "Waits and retries automatically; if it persists, slow down automation.", severity: "warning" },
  FANVUE_AUTH_FAILED: { label: "Fanvue rejected the request", fix: "Reconnect the Fanvue account in Models.", severity: "error" },
  FANVUE_TOKEN_EXPIRED: { label: "Fanvue access token expired", fix: "Token auto-refreshes; if it keeps failing, reconnect.", severity: "warning" },
  FANVUE_SEND_FAILED: { label: "Message failed to send on Fanvue", fix: "Retried automatically; check Fanvue status if persistent.", severity: "error" },
  FANVUE_NOT_CONNECTED: { label: "Fanvue account not connected", fix: "Connect the creator's Fanvue account in Models.", severity: "error" },
  PERSONA_MISSING: { label: "No active persona for this creator", fix: "Create a persona in the Model Workspace.", severity: "error" },
  PERSONA_INVALID: { label: "Persona instructions are invalid", fix: "Edit the persona and save valid instructions.", severity: "error" },
  AUTOMATION_STOPPED: { label: "Automation is off for this creator", fix: "Set the creator to Draft or Running.", severity: "info" },
  GLOBAL_PAUSED: { label: "System is paused", fix: "Click Resume All in the Automation header.", severity: "info" },
  FAN_PAUSED: { label: "This fan is paused", fix: "Resume the fan in the inspector.", severity: "info" },
  CONVERSATION_PAUSED: { label: "Conversation is archived", fix: "Unarchive the conversation.", severity: "info" },
  NO_FAN_MESSAGE: { label: "No fan message to reply to", fix: "Nothing to do — ignored.", severity: "info" },
  LATEST_MESSAGE_IS_CREATOR: { label: "Already replied to this fan", fix: "Nothing to do — ignored.", severity: "info" },
  DUPLICATE_JOB: { label: "Duplicate automation job", fix: "Nothing to do — ignored.", severity: "info" },
  CONVERSATION_LOCKED: { label: "Conversation is being processed", fix: "Will retry automatically.", severity: "warning" },
  CIRCUIT_BREAKER_TRIPPED: { label: "Circuit breaker tripped (too many send failures)", fix: "Check Fanvue connection; the bot auto-paused for safety.", severity: "error" },
  AI_GENERATION_FAILED: { label: "AI failed to generate a reply", fix: "Retries automatically; check Grok key if persistent.", severity: "error" },
  AI_INVALID_REPLY: { label: "AI returned an invalid reply", fix: "Retries automatically; check persona instructions.", severity: "warning" },
  PPV_NO_CONTENT_SET: { label: "No PPV content set available", fix: "Add a content set on the PPV Content page.", severity: "warning" },
  PPV_COOLDOWN: { label: "PPV offer dropped (cooldown)", fix: "Conversation continues without an offer.", severity: "info" },
  RATE_LIMITED: { label: "Hourly reply limit reached", fix: "Raised max replies/hour in Automation settings.", severity: "warning" },
  UNKNOWN: { label: "Unexpected error", fix: "See the activity log for details.", severity: "error" },
};

const REASON_TO_CODE: Record<string, ErrorCode> = {
  GLOBAL_PAUSED: "GLOBAL_PAUSED",
  AUTOMATION_STOPPED: "AUTOMATION_STOPPED",
  PERSONA_NOT_FOUND: "PERSONA_MISSING",
  FANVUE_CONTACTABILITY: "FANVUE_NOT_CONNECTED",
  FAN_PAUSED: "FAN_PAUSED",
  CONVERSATION_PAUSED: "CONVERSATION_PAUSED",
  NO_FAN_MESSAGE: "NO_FAN_MESSAGE",
  LATEST_MESSAGE_IS_CREATOR: "LATEST_MESSAGE_IS_CREATOR",
  DUPLICATE_JOB: "DUPLICATE_JOB",
  CONVERSATION_LOCKED: "CONVERSATION_LOCKED",
  JOB_ALREADY_CLAIMED: "DUPLICATE_JOB",
  CIRCUIT_BREAKER_TRIPPED: "CIRCUIT_BREAKER_TRIPPED",
  RATE_LIMITED: "RATE_LIMITED",
};

export function toCode(reason: string | undefined | null): ErrorCode {
  if (!reason) return "UNKNOWN";
  return REASON_TO_CODE[reason] || "UNKNOWN";
}

export function catalogError(code: ErrorCode): CatalogEntry {
  return CATALOG[code] || CATALOG.UNKNOWN;
}

export function describeError(rawMessage: string): CatalogEntry {
  const m = String(rawMessage || "");
  if (/rate.?limit|429|too many/i.test(m)) return CATALOG.FANVUE_RATE_LIMIT;
  if (/token|expired|401|unauthorized/i.test(m)) return CATALOG.FANVUE_TOKEN_EXPIRED;
  if (/send|message.*fail|failed to send/i.test(m)) return CATALOG.FANVUE_SEND_FAILED;
  if (/persona/i.test(m)) return CATALOG.PERSONA_MISSING;
  if (/grok|ai.*fail|generation/i.test(m)) return CATALOG.AI_GENERATION_FAILED;
  if (/ppv.*no.*set|no.*content/i.test(m)) return CATALOG.PPV_NO_CONTENT_SET;
  return CATALOG.UNKNOWN;
}