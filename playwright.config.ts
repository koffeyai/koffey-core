import { defineConfig } from '@playwright/test';

const smokeSupabaseUrl = 'https://smoke.supabase.co';
const smokeAnonKey = 'smoke-anon-key';

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'onboarding-smoke.spec.ts',
    'public-shell.spec.ts',
    'custom-skills.spec.ts',
  ],
  outputDir: '.playwright/test-results',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `VITE_SUPABASE_URL=${smokeSupabaseUrl} VITE_SUPABASE_ANON_KEY=${smokeAnonKey} npm run dev -- --host 127.0.0.1 --port 4173 --strictPort`,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
