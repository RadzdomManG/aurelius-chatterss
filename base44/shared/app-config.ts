// Singleton AppConfig helpers — the AppConfig entity holds app-wide flags.
// The first record is treated as the global config; created on first access.
// Used by the global pause toggle so a single `paused` boolean gates all
// automation across webhook ingestion, AI processing, and recovery workers.

export async function getAppConfig(base44: any): Promise<any> {
  const configs = await base44.asServiceRole.entities.AppConfig.list("-created_date", 1);
  if (configs[0]) return configs[0];
  return await base44.asServiceRole.entities.AppConfig.create({});
}

export async function isPaused(base44: any): Promise<boolean> {
  try {
    const config = await getAppConfig(base44);
    return !!config?.paused;
  } catch (e) {
    // If config can't be read, never block processing on a read failure.
    return false;
  }
}