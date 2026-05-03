/** Shared constants — no logic, no side effects. */

export const PLACEHOLDERS = new Set([
  '',
  'your-anon-key',
  'your-service-role-key',
  'https://your-project.supabase.co',
  'postgresql://postgres:your-password@db.your-project.supabase.co:5432/postgres',
  'postgresql://postgres.your-project-ref:your-password@aws-0-your-region.pooler.supabase.com:5432/postgres',
  'your-supabase-project-id',
  'your-project-ref',
]);

export const REQUIRED_ENV_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

export const AI_PROVIDER_KEYS = [
  'KIMI_API_KEY', 'MOONSHOT_API_KEY', 'GROQ_API_KEY',
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
];

export const SECRET_KEYS = [
  'KIMI_API_KEY', 'KIMI_BASE_URL', 'KIMI_MODEL',
  'KIMI_MODEL_LITE', 'KIMI_MODEL_STANDARD', 'KIMI_MODEL_PRO',
  'MOONSHOT_API_KEY', 'MOONSHOT_BASE_URL', 'MOONSHOT_MODEL',
  'MOONSHOT_MODEL_LITE', 'MOONSHOT_MODEL_STANDARD', 'MOONSHOT_MODEL_PRO',
  'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY',
  'AI_PROVIDER_PRIORITY', 'AI_FORCE_KIMI_FIRST',
  'AI_PROVIDER_MAX_ATTEMPTS', 'AI_PROVIDER_STRICT_PRIORITY',
  'AI_PROVIDER_TIMEOUT_MS', 'AI_RETRY_COMPACT',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CLOUD_VISION_API_KEY',
  'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME', 'TELEGRAM_WEBHOOK_SECRET',
  'RESEND_API_KEY', 'RESEND_DOMAIN', 'RESEND_FROM_EMAIL',
  'APP_URL', 'APP_BASE_URL', 'SITE_URL', 'CORS_ALLOWED_ORIGINS',
  'CHANNEL_ID_HASH_SALT', 'ENVIRONMENT',
];

export const DB_CONNECTIVITY_PATTERNS = [
  'failed to connect to postgres', 'no route to host',
  'network is unreachable', 'connection refused',
  'i/o timeout', 'timeout', 'dial error',
  'could not translate host name', 'tenant or user not found',
];

export const PROVIDER_ENV_MAP = {
  groq: 'GROQ_API_KEY',
  kimi: 'KIMI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

export const PROVIDER_PRIORITY_MAP = {
  groq: 'groq,kimi,anthropic,gemini',
  kimi: 'kimi,groq,anthropic,gemini',
  anthropic: 'anthropic,groq,kimi,gemini',
  gemini: 'gemini,groq,kimi,anthropic',
};
