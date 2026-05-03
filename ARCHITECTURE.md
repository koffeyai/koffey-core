# Architecture

Koffey.ai follows the **Gateway + Skills + Channels** pattern — a single AI agent brain that routes through pluggable capabilities and delivers via multiple surfaces.

## System Overview

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

## Key Concepts

### Gateway (`supabase/functions/unified-chat/`)
The single entry point for all AI interactions. Receives a message from any channel, classifies intent, selects the right skills, executes them, and synthesizes a response. The LLM IS the router — no separate NLP service.

### Skills (`supabase/functions/unified-chat/skills/`)
Pluggable capabilities organized by domain. Each skill declares its name, parameters, instructions, and handler. The gateway loads skills selectively based on the detected intent.

**Domains:** `search`, `create`, `update`, `analytics`, `coaching`, `scheduling`, `intelligence`, `email`, `context`, `product`, `leads`, `sequences`, `admin`, `presentation`

### Channels
Delivery surfaces that normalize input/output for the gateway. The web UI is the primary channel. WhatsApp and Telegram are connected via adapter edge functions.

### Entity Context
Cross-message pronoun resolution system. When the user says "bump probability on **that** to 60%", the system resolves "that" to the deal discussed in the previous turn via the `entityContext` system stored per chat session.

## Directory Structure

```
src/
├── components/          # React UI components
│   ├── chat/           # Chat interface
│   ├── command-center/ # Briefing/dashboard
│   ├── opportunities/  # Deals pipeline
│   ├── contacts/       # Contact management
│   ├── settings/       # Settings UI
│   └── admin/          # Admin panels
├── hooks/              # React hooks (useChat, useEntityContext, etc.)
├── stores/             # Zustand stores
├── services/           # Business logic services
├── integrations/       # Supabase client config
├── types/              # TypeScript type definitions
└── lib/                # Utilities (formatters, security, etc.)

supabase/
├── functions/
│   ├── unified-chat/   # The Gateway — AI agent brain
│   │   ├── index.ts    # Main orchestrator
│   │   ├── skills/     # All pluggable skills
│   │   ├── intent/     # Intent classification
│   │   ├── gateway/    # Sub-modules (extraction, verification, etc.)
│   │   └── tools/      # Tool execution handlers
│   ├── _shared/        # Shared utilities (auth, CORS, AI providers)
│   ├── extraction-agent/    # Sloppy notes parser
│   ├── generate-briefing/   # Daily briefing generator
│   ├── sync-email-to-crm/  # Gmail inbox sync
│   ├── sync-calendar-to-crm/ # Calendar → CRM sync
│   ├── google-oauth/        # OAuth handler
│   └── ...
└── migrations/         # Consolidated schema
```

## Edge Functions Inventory

48 edge functions organized by category. The **Gateway** is the core — everything else supports it.

### Gateway

| Function | Description |
|----------|-------------|
| `unified-chat` | AI agent brain — routes all input, selects skills, executes, responds |
| `_shared` | Shared utilities: security, CORS, auth, AI provider fallback, embedding helpers |

### Auth & Organization

| Function | Description |
|----------|-------------|
| `handle-auth` | User authentication and signup flow |
| `create-org-with-user` | Create new organization during signup |
| `create-org-invitation` | Create and send org invitations |
| `accept-invite` | Accept an org invitation and join |
| `validate-invite` | Validate invite code before accepting |
| `request-to-join` | Handle requests to join existing orgs |
| `send-invitation-email` | Send invitation emails via Resend |

### Google Integration

| Function | Description |
|----------|-------------|
| `google-oauth` | OAuth flow handler for Calendar/Gmail/Drive |
| `store-google-token` | Store OAuth tokens from Google callback |
| `google-calendar` | Fetch calendar events |
| `google-calendar-sync` | Sync CRM tasks to Google Calendar |
| `google-calendar-watch` | Manage push notification watch channels |
| `google-calendar-webhook` | Receive calendar change webhooks from Google |
| `check-availability` | Check free/busy slots for meeting scheduling |
| `sync-calendar-to-crm` | Import calendar events as CRM activities |
| `sync-email-to-crm` | Sync Gmail messages and match to CRM contacts |
| `upload-to-drive` | Upload presentations to Google Drive |
| `calendar-disconnect` | Disconnect Google Calendar and revoke tokens |

### Channel Adapters

| Function | Description |
|----------|-------------|
| `whatsapp-adapter` | Receive/send WhatsApp messages via Twilio |
| `telegram-adapter` | Receive/send Telegram messages |

### AI Pipeline

| Function | Description |
|----------|-------------|
| `extraction-agent` | Extract structured CRM data from meeting notes |
| `generate-embedding` | Generate vector embeddings via OpenAI |
| `generate-briefing` | Create daily briefing for a sales rep |
| `generate-analytics-artifact` | Generate analytics from natural language queries |
| `deal-coaching` | SCOUTPAD deal analysis and coaching insights |
| `grounded-validator` | Verify LLM responses against actual CRM data |
| `database-search` | Semantic search with structured filters |
| `learn-sales-patterns` | Extract patterns from deal outcomes |
| `process-document` | Parse documents via OCR or PDF extraction |
| `process-memory` | Extract facts from CRM events into client memory |
| `web-enrichment-orchestrator` | Orchestrate company data enrichment from web |
| `enrich-company` | Enrich company data from domain |
| `enrich-contacts-batch` | Batch enrich contacts from external sources |
| `enrich-website` | Scrape and enrich company data from website URL |

### Background Jobs (cron-triggered)

| Function | Description |
|----------|-------------|
| `generate-all-briefings` | Batch daily briefing generator for all users |
| `run-periodic-analysis` | Staleness detection and memory compaction (6-hour cycle) |
| `process-sequences` | Execute sales sequences and generate follow-up tasks |
| `process-workflows` | Trigger workflow rules and execute actions |

### Notifications

| Function | Description |
|----------|-------------|
| `notification-router` | Route notifications based on user preferences |
| `notification-queue-processor` | Process queued notifications and deliver |
| `meeting-prep-alert` | Pre-meeting prep and post-meeting follow-up alerts |
| `send-scheduling-email` | Send scheduling emails via Gmail or Resend |
| `conversation-logger` | Log feedback ratings on AI responses |

### CRM Operations

| Function | Description |
|----------|-------------|
| `crm-operations` | Direct CRUD on contacts, accounts, deals, activities, tasks |
| `export-backup` | Export all CRM data to ZIP archive |
| `process-files` | Batch process uploaded files and extract entities |

### Slide Studio

| Function | Description |
|----------|-------------|
| `extract-template-structure` | Parse PPTX templates to extract slide structure |
| `generate-ai-slides` | Generate presentations from CRM data |
| `generate-from-template` | Generate presentations from templates with AI slot mapping |

## Adding a New Skill

1. Create a file in `supabase/functions/unified-chat/skills/<domain>/your-skill.ts`
2. Implement the `SkillDefinition` interface:
   ```typescript
   const mySkill: SkillDefinition = {
     name: 'my_skill',
     displayName: 'My Skill',
     domain: 'search',        // determines when it loads
     version: '1.0.0',
     loadTier: 'core',        // 'core' | 'standard' | 'pro'
     schema: { ... },         // OpenAI function-calling schema
     instructions: '...',     // LLM behavioral guidance
     execute: async (ctx) => { ... },
   };
   ```
3. Import and register in `skills/registry.ts`
4. Add domain patterns in `skills/domain-estimator.mjs` if new domain

## Multi-Tenancy

All data is scoped by `organization_id`. PostgreSQL Row-Level Security (RLS) enforces tenant isolation at the database level. Edge functions use the service role for operations but always filter by the authenticated user's organization.

## AI Provider Chain

The system supports multiple LLM providers with automatic fallback:
1. **Kimi/Moonshot** (primary) — strong tool-calling
2. **Groq** (fallback) — fast inference
3. **Anthropic** (optional) — Claude adapter included
4. **Gemini** (optional) — Google AI

Configure via `AI_PROVIDER_PRIORITY` environment variable.
