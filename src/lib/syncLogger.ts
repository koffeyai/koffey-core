/** Lightweight logger stubs — replace with a structured logger if needed. */
export const syncInfo = (_category: string, message: string, _data?: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.info(`[sync] ${message}`);
};
export const syncDebug = (_category: string, message: string, _data?: Record<string, unknown>) => {
  if (import.meta.env.DEV) console.debug(`[sync] ${message}`);
};
export const syncError = (_category: string, message: string, _data?: Record<string, unknown>) => {
  console.error(`[sync] ${message}`);
};
