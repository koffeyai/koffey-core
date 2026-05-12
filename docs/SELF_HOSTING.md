# Self-Hosting Guide

Complete guide to running Koffey.ai with a local frontend and your own hosted Supabase project.

## What You Provide

Koffey is a bring-your-own-credentials application. The repository gives you the app, schema, edge functions, setup scripts, and validation checks. You provide the cloud projects and API keys, and `npm run setup` deploys into those accounts.

Required for the core CRM:

| Item | Use | Where to get it |
|------|-----|-----------------|
| Supabase project URL | Browser and edge-function API base URL | Supabase Dashboard -> Project Settings -> API |
| Supabase anon key | Frontend-safe API key | Supabase Dashboard -> Project Settings -> API |
| Supabase service role key | Server-side edge-function access | Supabase Dashboard -> Project Settings -> API |
| Supabase project ref | Keeps schema, secrets, and functions pointed at the same project | Supabase Dashboard -> Project Settings -> General |
| Supabase database URL | Applies the database schema | Supabase Dashboard -> Connect -> Session pooler |
| Supabase personal access token | Lets the CLI deploy functions and secrets | Supabase Dashboard -> Account -> Access Tokens |
| One AI provider key | Powers chat, analysis, drafting, and tool selection | Kimi/Moonshot, Groq, Anthropic, or Gemini |

Optional provider accounts:

| Integration | Required only if you want... |
|-------------|------------------------------|
| Google Cloud OAuth | Calendar events, Gmail sync/send, Drive exports |
| Twilio | WhatsApp adapter |
| Telegram Bot API | Telegram adapter |
| Resend | Resend-backed email sending |

`npm run doctor` separates these states intentionally: `FAIL` blocks the current configuration, `MANUAL` is a console step you complete in your own account, and `SKIP` means an optional integration is not configured.

## Prerequisites

- **Node.js 20+** — check with `node --version`
- **A [Supabase](https://supabase.com) project** — free tier works for development
- **A Supabase personal access token** — from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
- **At least one AI provider API key** — see [AI Providers](#ai-providers) below
- **Git**

You do **not** need to install the Supabase CLI globally — it runs via `npx` from the project's dependencies, and you do **not** need Docker for the supported setup.

## Fastest Path

If you want the fastest local install first, use the bootstrap script:

```bash
curl -fsSL https://raw.githubusercontent.com/koffeyai/koffey-core/main/scripts/bootstrap.sh | bash
```

That command:

1. Clones the repo
2. Installs dependencies
3. Generates `.env`
4. Prompts for your hosted Supabase credentials
5. Prompts for a Supabase access token for CLI auth
6. Prompts for an AI provider key if needed

Then run:

```bash
cd koffey-core
npm run dev
```

To let the bootstrap script start the dev server too:

```bash
curl -fsSL https://raw.githubusercontent.com/koffeyai/koffey-core/main/scripts/bootstrap.sh | bash -s -- --run-dev
```

## Setup

### 1. Create a Supabase Project

Go to [supabase.com/dashboard](https://supabase.com/dashboard) and create a new project. Once it's ready, collect these from **Settings → API**:

- **Project URL** — e.g., `https://abcdefgh.supabase.co`
- **Anon key** — the public anonymous key
- **Service role key** — the secret service key (never expose to the frontend)

From **Connect**, copy the **Session pooler** connection string for the easiest local setup. Supabase recommends the session pooler by default when IPv6 is not available.

- **Primary database URL** — e.g., `postgresql://postgres.abcdefgh:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
- **Optional direct database URL** — e.g., `postgresql://postgres:password@db.abcdefgh.supabase.co:5432/postgres`

Also create a **personal access token** from **Account → Access Tokens** so the CLI can deploy functions and secrets.

### 2. Clone and Install

```bash
git clone https://github.com/koffeyai/koffey-core.git
cd koffey-core
npm install
```

### 3. Configure Environment

```bash
npm run setup:init
```

This creates `.env` from `.env.example`. Open it and fill in:

```bash
# Required — from your Supabase project
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=replace-with-your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=replace-with-your-supabase-service-role-key
SUPABASE_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-your-region.pooler.supabase.com:5432/postgres

# Optional: if you prefer a direct IPv6 connection as SUPABASE_DB_URL,
# keep the Session pooler string here as an automatic fallback
SUPABASE_POOLER_DB_URL=postgresql://postgres.your-project-ref:password@aws-0-your-region.pooler.supabase.com:5432/postgres

# Required — at least one AI provider
GROQ_API_KEY=replace-with-your-groq-api-key
```

### 4. Authenticate the Supabase CLI

```bash
npx supabase login
```

Paste the personal access token you created earlier.

### 5. Run Setup

```bash
npm run setup
```

This will:
1. Validate your credentials are real (not placeholders)
2. Check that at least one AI provider key is set
3. Push the database schema to your Supabase project
4. Sync non-reserved secrets to your edge functions
5. Deploy all edge functions
6. Run strict validation (lint, typecheck, contract tests, and production build)

Schema push prefers your linked project (`npx supabase link`). If the project is not linked, it falls back to `SUPABASE_DB_URL`, then `SUPABASE_POOLER_DB_URL`. The pooler fallback helps on IPv4-only networks where the direct database hostname is unreachable.

By default, `npm run setup` does not delete remote-only edge functions. That is the safer default for first-time setup and existing projects.

If you intentionally want the remote function list to match the repo exactly, run:

```bash
npm run setup:prune
```

Use that only on projects where you want remote-only functions removed.

### 6. Run Doctor

```bash
npm run doctor
```

Doctor is read-only. It checks:

1. `.env` values and project-ref consistency
2. Supabase Auth and REST reachability using your frontend key
3. Supabase service-role reachability using `SUPABASE_SERVICE_ROLE_KEY`
4. Deployed Google OAuth configuration, token-storage readiness, Google client-secret validity, and live redirect URI when Google credentials are configured
5. Manual dashboard checklist items that cannot safely be changed from the repo

If Doctor reports `FAIL`, fix those before testing signup. `MANUAL` items are expected for dashboard-only setup steps in your own Supabase or Google Cloud account. `SKIP` items are optional integrations you have not enabled.

### 7. Start Development

```bash
npm run dev
```

Before your first sign-in, configure Supabase Auth URLs:

1. In Supabase Dashboard → **Auth → URL Configuration**, set:
   - **Site URL**: `http://localhost:5173`
   - **Redirect URLs**: `http://localhost:5173/**`

Open `http://localhost:5173`. Sign up to create your first account and organization.

The frontend runs locally. The backend (database, auth, edge functions) runs on your Supabase project.

If you later deploy the frontend somewhere other than localhost, treat it as a static build and carry over `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then update Supabase Auth URL settings to match that domain.

## AI Providers

You need at least one API key. The system tries providers in priority order and falls back automatically.

| Provider | Get a key | Notes |
|----------|-----------|-------|
| **[Groq](https://console.groq.com)** | Free tier, fast inference | **Recommended to start** |
| **[Anthropic](https://console.anthropic.com)** | Paid, most reliable tool calling | Best quality |
| **[Google Gemini](https://aistudio.google.com)** | Free tier available | Good balance |
| **[Kimi/Moonshot](https://platform.moonshot.cn)** | Strong tool calling | Primary in production |

Add your key(s) to `.env`:

```bash
GROQ_API_KEY=replace-with-your-groq-api-key
ANTHROPIC_API_KEY=replace-with-your-anthropic-api-key
GEMINI_API_KEY=replace-with-your-gemini-api-key
KIMI_API_KEY=replace-with-your-kimi-api-key
```

Control the priority order:

```bash
AI_PROVIDER_PRIORITY=groq,anthropic
```

## Google Calendar, Gmail, and Drive

Without Google OAuth, the CRM works fine — but calendar events, meeting invites, and email sync won't be available.

This is separate from "Sign in with Google" via Supabase Auth. Calendar, Gmail, and Drive access use Koffey's custom `google-oauth` edge function and need their own Google OAuth client configuration.

### Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. **Enable APIs** — search for and enable:
   - Google Calendar API
   - Gmail API
   - Google Drive API (optional — for Slide Studio exports)
4. **Create credentials**:
   - Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Add **Authorized redirect URIs**:
     ```
     https://YOUR-PROJECT.supabase.co/functions/v1/google-oauth
     ```
5. Copy the **Client ID** and **Client Secret** into your `.env`:
   ```bash
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=replace-with-your-google-client-secret
   ```
   Then rerun:
   ```bash
   npm run setup
   ```
   This is important after creating a fresh Supabase project or wiping function secrets, because Google OAuth credentials must be synced back into your deployed edge functions.
6. **Configure OAuth consent screen**:
   - Go to **APIs & Services → OAuth consent screen**
   - Add your email as a test user (required while app is in "Testing" status)
   - Request scopes you plan to use:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.send`
     - `https://www.googleapis.com/auth/drive.file`

After setup, users connect their Google account from **Settings → Integrations** in the app.

### Redirect URI Format

The redirect URI must exactly match. Common issues:
- Must be `https://`, not `http://`
- Must include `/functions/v1/google-oauth` (no trailing slash)
- The project ID in the URL must match your Supabase project

### If the app says "Google OAuth not configured"

That means your deployed `google-oauth` edge function does not currently have `GOOGLE_CLIENT_ID` and/or `GOOGLE_CLIENT_SECRET` available in its environment.

Checklist:

1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`
2. Run `npm run setup` again to sync secrets and redeploy functions
3. Run `npm run doctor` to verify the deployed edge function sees the credentials
4. Confirm the Google Cloud OAuth redirect URI is exactly:
   ```
   https://YOUR-PROJECT.supabase.co/functions/v1/google-oauth
   ```

## WhatsApp (Twilio)

1. Create a [Twilio](https://twilio.com) account
2. Set up a WhatsApp sender in the Twilio console
3. Add to `.env`:
   ```bash
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=replace-with-your-twilio-auth-token
   TWILIO_WHATSAPP_NUMBER=whatsapp:+1234567890
   ```
4. Set your Twilio webhook URL to:
   ```
   https://YOUR-PROJECT.supabase.co/functions/v1/whatsapp-adapter
   ```

## Telegram

1. Create a bot via [@BotFather](https://t.me/botfather) on Telegram
2. Add to `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
   ```
3. Set the webhook:
   ```
   https://YOUR-PROJECT.supabase.co/functions/v1/telegram-adapter
   ```

## Database Extensions

The schema uses these PostgreSQL extensions. Supabase Cloud includes all of them by default.

| Extension | Purpose |
|-----------|---------|
| `uuid-ossp` | UUID generation |
| `pgcrypto` | Cryptographic functions |
| `pg_trgm` | Trigram-based text search |
| `vector` (pgvector) | Embedding similarity search |
| `pg_net` | HTTP requests from SQL (used by cron jobs) |
| `pg_cron` | Scheduled background jobs |

If you're running PostgreSQL outside Supabase, install these extensions before applying the schema.

## Security Notes

- **Row-Level Security (RLS)** is enabled on all tables. Every query is scoped to the authenticated user's organization.
- **Edge functions validate JWT tokens in application code**, not at the gateway level. This is intentional — webhook endpoints (WhatsApp, Telegram) need to accept unauthenticated requests, while CRM operations verify the token in `_shared/security.ts`.
- **Never expose the service role key** to the frontend. It's only used by edge functions on the server side.

## Troubleshooting

### `npm run setup` fails on schema push

Check that your `SUPABASE_DB_URL` is correct. You can find it in **Settings → Database → Connection string → URI** in your Supabase dashboard.

### Edge functions fail to deploy

Run individually to isolate the failure:
```bash
npx supabase functions deploy unified-chat --project-ref YOUR_REF
```

Check function logs:
```bash
npx supabase functions logs unified-chat --project-ref YOUR_REF
```

### Google OAuth "redirect_uri_mismatch"

The redirect URI in Google Cloud Console must exactly match:
```
https://YOUR-PROJECT.supabase.co/functions/v1/google-oauth
```

Check for trailing slashes, `http` vs `https`, and that the project ID matches.

### AI provider returns errors

Verify your API key is valid:
```bash
npx supabase functions logs unified-chat --project-ref YOUR_REF
```

### "No organization access" after signup

The first user to sign up becomes the org admin. Subsequent users need an invitation from **Settings → Team**.

### Organization creation fails silently

If signup succeeds but org creation shows a generic error, check the edge function logs:
```bash
npx supabase functions logs create-org-with-user --project-ref YOUR_REF
```
Common causes: the `organizations` table doesn't exist (schema not pushed), or RLS policies are blocking the insert.

### Functions deploy but return 401

Every edge function needs `verify_jwt = false` in `supabase/config.toml` because JWT validation happens in application code (`_shared/security.ts`), not at the gateway. If you added a new function and forgot the config entry, it will reject all requests with 401.

### Port 5173 is in use

Edit `vite.config.ts` and change `port: 5173` to another port.
