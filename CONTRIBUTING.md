# Contributing to Koffey.ai

We welcome contributions! Whether it's bug fixes, new skills, channel adapters, or documentation improvements.

Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before participating, and use [SUPPORT.md](SUPPORT.md) if you need help choosing the right place to ask a question or report a problem.

## Development Setup

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- A Supabase personal access token
- At least one AI provider API key
- Git

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/koffey-core.git
cd koffey-core

# Install dependencies
npm install

# Guided setup for .env + Supabase CLI auth + deploy
npm run bootstrap

# Or manually: create .env, authenticate, and deploy
npm run setup:init
npx supabase login
npm run setup

# Start the frontend dev server
npm run dev
```

See [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for detailed setup instructions.

### Useful Commands

```bash
npm run dev          # Start Vite dev server (frontend)
npm run bootstrap    # Guided hosted-Supabase setup in the current repo
npm run setup        # Push schema + deploy functions + build
npm run setup:prune  # Same as setup, but also prune remote-only edge functions
npm run setup:init   # Create .env from template
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run test         # Run contract tests
npm run test:smoke   # Mocked first-run onboarding smoke test
npm run validate:strict  # Lint + typecheck + contracts + build
```

The first time you run `npm run test:smoke` locally, install Chromium with:

```bash
npx playwright install chromium
```

## Adding a New Skill

Skills are the core extensibility mechanism. Each skill is a pluggable capability the AI agent can invoke.

### 1. Create the skill file

```
supabase/functions/unified-chat/skills/<domain>/your-skill.ts
```

### 2. Implement the SkillDefinition interface

```typescript
import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const mySkill: SkillDefinition = {
  name: 'my_skill',
  displayName: 'My Skill',
  domain: 'search',           // determines when it loads
  version: '1.0.0',
  loadTier: 'core',           // 'core' | 'standard' | 'pro'

  schema: {
    type: 'function',
    function: {
      name: 'my_skill',
      description: 'What this skill does — the LLM reads this to decide when to use it.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },

  instructions: `When the user asks to ..., use my_skill.`,

  execute: async (ctx: ToolExecutionContext) => {
    const { query } = ctx.args;
    // Use ctx.supabase for database access
    // Use ctx.organizationId for tenant scoping
    return { success: true, data: results };
  },

  triggerExamples: [
    'example user message that should trigger this skill',
  ],
};

export default mySkill;
```

### 3. Register the skill

Import and add it to `supabase/functions/unified-chat/skills/registry.ts`.

### 4. Add domain patterns (if new domain)

If your skill introduces a new domain, add matching patterns in `supabase/functions/unified-chat/skills/domain-estimator.mjs`.

## Adding a Channel Adapter

Channel adapters normalize input/output between external messaging platforms and the Gateway.

1. Create an edge function in `supabase/functions/` (e.g., `my-channel-adapter/index.ts`)
2. Normalize inbound messages to the Gateway's expected format
3. Forward to `unified-chat` via internal Supabase function call
4. Format the Gateway's response for the channel's output format

See `supabase/functions/whatsapp-adapter/` for a reference implementation.

## Pull Request Process

1. **Branch from `main`** — use short-lived feature branches
2. **One logical change per PR** — don't bundle unrelated changes
3. **Run `npm run build`** before submitting to catch type errors
4. **Describe what and why** in the PR description
5. **Test with realistic input** — use sloppy, natural language, not just clean test data

## Code Style

- TypeScript for all new code
- Follow existing patterns in the codebase
- All database queries must include `organization_id` (multi-tenancy)
- Skills must be self-contained and independently deployable
- No auto-sending emails or messages — always require user confirmation

## Reporting Issues

- Use [GitHub Issues](https://github.com/koffeyai/koffey-core/issues) for bugs and feature requests
- For security vulnerabilities, see [SECURITY.md](SECURITY.md)

## Code of Conduct

Be respectful, constructive, and collaborative. We're building tools for salespeople — bring that same energy to the community.

## License

By contributing, you agree that your contributions will be licensed under the AGPL-3.0 license.
