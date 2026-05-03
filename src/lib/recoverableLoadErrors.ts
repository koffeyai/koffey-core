export type RecoverableLoadErrorKind = 'module_load' | 'network' | 'timeout' | 'unknown';

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    const causeValue = (error as Error & { cause?: unknown }).cause;
    const cause = causeValue instanceof Error
      ? `${causeValue.name}: ${causeValue.message}`
      : String(causeValue || '');
    return `${error.name}: ${error.message} ${cause}`.trim();
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return `${String(record.name || '')}: ${String(record.message || '')}`.trim();
  }
  return String(error);
}

const MODULE_LOAD_PATTERNS = [
  /chunkloaderror/i,
  /loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /module script load failed/i,
  /outdated optimize dep/i,
  /unable to preload css/i,
];

const TIMEOUT_PATTERNS = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /aborterror/i,
  /operation was aborted/i,
  /signal is aborted/i,
];

const NETWORK_PATTERNS = [
  /\bnetwork\b/i,
  /failed to fetch/i,
  /load failed/i,
  /connection/i,
  /offline/i,
  /err_internet_disconnected/i,
  /err_network_changed/i,
  /\b50[234]\b/,
];

export function classifyRecoverableLoadError(error: unknown): RecoverableLoadErrorKind {
  const text = errorText(error);
  if (!text) return 'unknown';

  if (MODULE_LOAD_PATTERNS.some((pattern) => pattern.test(text))) return 'module_load';
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(text))) return 'timeout';
  if (NETWORK_PATTERNS.some((pattern) => pattern.test(text))) return 'network';

  return 'unknown';
}

export function isRecoverableLoadError(error: unknown): boolean {
  return classifyRecoverableLoadError(error) !== 'unknown';
}
