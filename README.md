# Koffey.ai

**AI-native, chat-first CRM for sales teams.** | [Website](https://www.koffey.ai)

Koffey replaces the traditional CRM UI with a conversational AI agent. Talk to your CRM like you'd talk to a colleague — create deals, update contacts, get pipeline insights, schedule meetings, and draft emails, all through natural language.

Built on the **Gateway + Skills + Channels** architecture: one AI brain, pluggable capabilities, multiple delivery surfaces.

## Project Status

- Actively maintained
- Supported development workflow: local frontend + hosted Supabase
- Typechecked, linted, smoke-tested, and build-verified in CI

## Self-Hosting Model

Koffey is designed for bring-your-own-credentials deployments. You run the app against infrastructure and API accounts you control; Koffey does not provide a hosted backend, shared Supabase project, or bundled provider keys.

For the core CRM, bring:

| Need | Where it comes from |
|------|---------------------|
| Supabase project URL, anon key, service role key | Supabase Dashboard -> Project Settings -> API |
| Supabase project ref and database connection string | Supabase Dashboard -> Project Settings / Connect |
| Supabase personal access token | Supabase Dashboard -> Account -> Access Tokens |
| At least one AI provider key | Kimi/Moonshot, Groq, Anthropic, or Gemini |

Optional integrations require their own provider setup: Google Cloud OAuth for Calendar/Gmail/Drive, Twilio for WhatsApp, Telegram Bot API for Telegram, and Resend for outbound email. `npm run setup` deploys into your accounts; `npm run doctor` tells you which dashboard-only settings still need to be completed.

## Features

- **Chat-first CRM** — Create, search, and update deals, contacts, accounts, and tasks through conversation
- **Sloppy notes ingestion** — Paste messy meeting notes and let the AI extract contacts, next steps, risks, and deal details
- **Pipeline analytics** — Win rates, velocity, stale deal detection, forecasting
- **Deal coaching (SCOUTPAD)** — AI-powered deal analysis and recommended actions
- **Calendar integration** — View schedule, create events, send meeting invites via Google Calendar
- **Email sync** — Gmail integration with engagement tracking and statistical alerts
- **Multi-channel** — Web chat (primary), WhatsApp, Telegram adapters included
- **Proactive intelligence** — Daily briefings, stale deal alerts, meeting prep notifications
- **Multi-tenant** — Row-Level Security enforces organization isolation at the database level
- **Pluggable AI providers** — Kimi/Moonshot, Groq, Anthropic Claude, Google Gemini with automatic fallback

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   CHANNELS (Surfaces)                │
│  Web Chat │ WhatsApp │ Telegram                     │
└─────────────┬───────────────────────────┬───────────┘
              │                           │
┌─────────────▼───────────────────────────▼───────────┐
│                 GATEWAY (unified-chat)               │
│  Single agent brain. Routes all input. Calls skills. │
│  Intent → Tool Selection → Execution → Response      │
└─────────────┬───────────────────────────┬───────────┘
              │                           │
┌─────────────▼──────────┐  ┌─────────────▼───────────┐
│    CORE SKILLS         │  │    EXTENDED SKILLS       │
│  search_crm            │  │  draft_email             │
│  create/update entities│  │  analyze_deal (SCOUTPAD) │
│  get_deal_context      │  │  generate_report         │
│  get_pipeline_stats    │  │  create_calendar_event   │
│  search_emails         │  │  suggest_next_best_action│
│  get_email_engagement  │  │  generate_presentation   │
└─────────────┬──────────┘  └─────────────┬───────────┘
              │                           │
┌─────────────▼───────────────────────────▼───────────┐
│              SUPABASE (Source of Truth)               │
│  PostgreSQL │ RLS │ Edge Functions │ Realtime         │
└─────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full technical guide.

## Quick Start

### Supported Setup

The fastest way to try Koffey locally is:

```bash
curl -fsSL https://raw.githubusercontent.com/koffeyai/koffey-core/main/scripts/bootstrap.sh | bash
```

That bootstrap script will:

1. Clone the repo into `./koffey-core`
2. Install npm dependencies
3. Create `.env`
4. Prompt for your hosted Supabase credentials
5. Prompt for a Supabase access token so the CLI can deploy schema, secrets, and functions
6. Prompt for an AI provider key if one is not already set

Then start the app:

```bash
cd koffey-core
npm run dev
```

To let the bootstrap script start the dev server too:

```bash
curl -fsSL https://raw.githubusercontent.com/koffeyai/koffey-core/main/scripts/bootstrap.sh | bash -s -- --run-dev
```

Requirements for the one-line path:

- **Node.js 20+** and **git**
- A **[Supabase](https://supabase.com)** project you control (project URL, anon key, service role key, project ref, and database connection string)
- A **Supabase personal access token** for CLI auth ([Account → Access Tokens](https://supabase.com/dashboard/account/tokens))
- At least one **AI provider API key** — [Groq](https://console.groq.com) recommended (free tier, fast signup)

### Prerequisites

- **Node.js 20+**
- A **[Supabase](https://supabase.com)** project (free tier works)
- A **Supabase personal access token** ([Account → Access Tokens](https://supabase.com/dashboard/account/tokens))
- **Database connection string** — use the **Session pooler** URI from your Supabase project's **Connect** button (not the direct connection, which fails on many networks)
- At least one **AI provider API key** — [Groq](https://console.groq.com) recommended to get started (free tier, fast signup). Also supports [Anthropic](https://console.anthropic.com), [Gemini](https://aistudio.google.com), and [Kimi](https://platform.moonshot.cn).

### Setup

```bash
# 1. Clone and install
git clone https://github.com/koffeyai/koffey-core.git
cd koffey-core
npm install

# 2. Create your .env from the template
npm run setup:init

# 3. Edit .env with your Supabase credentials and at least one AI key
#    (see "Environment Variables" below)

# 4. Authenticate the Supabase CLI
npx supabase login

# 5. Push schema, deploy edge functions, sync secrets, and run strict validation
npm run setup

# 6. Run the deployment doctor
npm run doctor

# 7. Configure any MANUAL items reported by doctor.
#    These are expected BYO dashboard steps, not hosted-service requirements.
#    In Supabase Dashboard → Auth → URL Configuration, set:
#      Site URL: http://localhost:5173
#      Redirect URLs: http://localhost:5173/**
#    If using Google integrations, add the reported google-oauth redirect URI
#    to your Google Cloud OAuth client.

# 8. Start the local frontend
npm run dev
```

Open `http://localhost:5173`. Sign up to create your account and organization.

The backend (database, edge functions, auth) runs on your Supabase project. The frontend runs locally during development.

### What `npm run setup` does

1. Validates your `.env` has real credentials (not placeholders)
2. Checks that at least one AI provider key is set
3. Pushes the database schema to your Supabase project
4. Syncs all secrets to your edge functions
5. Deploys all edge functions
6. Runs strict validation (lint, typecheck, contract tests, and production build)

`npm run setup` is intentionally non-destructive for edge functions: it deploys everything in the repo, but it does not delete remote-only functions that may already exist in your Supabase project.

If you are a maintainer and want the remote function list to exactly match the repo, use:

```bash
npm run setup:prune
```

That mode adds `--prune` during function deploy and should only be used when you deliberately want to remove remote functions that are no longer in source control.

### Deployment Doctor

After setup, run:

```bash
npm run doctor
```

Doctor is a safe, read-only checklist command. It verifies local env values, Supabase project targeting, Supabase Auth/REST reachability, service-role reachability, deployed Google OAuth secret status when Google credentials are configured, token-storage readiness, Google client-secret validity, and the Google OAuth redirect generated by the live edge function. It also prints dashboard-only manual items, including Supabase Auth URLs and, when Google is enabled, the authorized redirect URI and test-user setup.

`FAIL` means something blocks the current configuration. `MANUAL` means a provider console setting must be completed in your account. `SKIP` means an optional integration is not configured.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase frontend-safe anon/publishable key (Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (Settings → API). Use the project-provided `service_role` key, not a self-generated JWT. |
| `SUPABASE_DB_URL` | Fallback | **Session pooler** connection string from Supabase **Connect** button. Not needed if your project is linked (`npx supabase link`). |
| `GROQ_API_KEY` | * | Groq API key (recommended — free tier) |
| `KIMI_API_KEY` | * | Kimi/Moonshot API key |
| `ANTHROPIC_API_KEY` | * | Anthropic Claude API key |
| `GEMINI_API_KEY` | * | Google Gemini API key |
| `GOOGLE_CLIENT_ID` | For calendar/email/drive | Google OAuth client ID (Calendar, Gmail, and Drive) |
| `GOOGLE_CLIENT_SECRET` | For calendar/email/drive | Google OAuth client secret (Calendar, Gmail, and Drive) |
| `TWILIO_ACCOUNT_SID` | No | WhatsApp via Twilio |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot integration |
| `RESEND_API_KEY` | No | Email sending via Resend |

*At least one AI provider key is required.

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for the complete setup guide including Google OAuth configuration, AI provider comparison, WhatsApp/Telegram setup, and troubleshooting.

### Google Auth Note

There are two separate Google flows in this project:

- **Google sign-in for app login** can be handled by Supabase Auth.
- **Google Calendar, Gmail, and Drive integrations** use the custom `google-oauth` edge function and require `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to be configured for the deployment.

If you later want to deploy the frontend elsewhere, `npm run build` outputs a static app. Configure your host with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then update Supabase Auth URLs to match.

**Tip:** Schema push prefers your linked project (`npx supabase link`). If you're not linked, it falls back to `SUPABASE_DB_URL`. Use the **Session pooler** URI (found under the **Connect** button in your Supabase dashboard), not the direct database URL — the direct URL uses IPv6 which many networks can't reach.

## Known Limitations

- **Database connection** — Schema push prefers a linked project. If unlinked, it requires the Session pooler URI. The direct database URL (`db.<ref>.supabase.co`) fails on most home/office networks due to IPv6.
- **Google Calendar, Gmail, and Drive** — Requires manual OAuth setup in Google Cloud Console (enable APIs, create credentials, configure consent screen). See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md#google-calendar-gmail-and-drive).
- **Background jobs** — `pg_cron` scheduled jobs (email sync, meeting prep alerts, briefings) only run on hosted Supabase, not local PostgreSQL.
- **First user** — The first person to sign up must create an organization. There is no seeded admin account.

## Testing

```bash
npm run lint
npm run typecheck
npm run test
npm run test:smoke
npm run build
```

`npm run test:smoke` uses mocked Supabase responses to validate the supported first-run onboarding flow in CI without requiring a live hosted project. The first time you run it locally, install Chromium with `npx playwright install chromium`.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **State:** TanStack Query + Zustand
- **Backend:** Supabase (PostgreSQL, Edge Functions, Realtime, RLS)
- **AI:** Multi-provider with automatic fallback (Kimi → Groq → Anthropic → Gemini)
- **Integrations:** Google Calendar/Gmail OAuth, Twilio (WhatsApp), Telegram

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Gateway + Skills + Channels technical guide |
| [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) | Complete self-hosting guide with Google OAuth, AI providers, Twilio, Telegram, troubleshooting |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development setup, how to add skills, PR guidelines |
| [SUPPORT.md](SUPPORT.md) | Where to ask for help and what to include |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | Community expectations for contributors and maintainers |
| [SECURITY.md](SECURITY.md) | Vulnerability disclosure policy |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, how to add skills, and PR guidelines.

## Security

See [SECURITY.md](SECURITY.md) for our vulnerability disclosure policy.

## License

Koffey.ai is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

This means you can:
- Use, modify, and distribute the software freely
- Run it for any purpose, including commercially
- Self-host your own instance

You must:
- Share modifications under the same license
- Provide source code to users who interact with the software over a network
- Include the original copyright and license notices

For enterprise support, configure a maintainer contact for your deployment or repository fork.
