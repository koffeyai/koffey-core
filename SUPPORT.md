# Getting Help

## Before You Ask

1. **Check the docs** — [SELF_HOSTING.md](docs/SELF_HOSTING.md) covers setup, configuration, and troubleshooting
2. **Search existing issues** — your question may already be answered at [GitHub Issues](https://github.com/koffeyai/koffey-core/issues)
3. **Read the architecture** — [ARCHITECTURE.md](ARCHITECTURE.md) explains how the system works

## Where to Ask

| Question type | Where |
|--------------|-------|
| Bug report | [GitHub Issues](https://github.com/koffeyai/koffey-core/issues/new?template=bug_report.md) |
| Feature request | [GitHub Issues](https://github.com/koffeyai/koffey-core/issues/new?template=feature_request.md) |
| Setup help | [GitHub Discussions](https://github.com/koffeyai/koffey-core/discussions) |
| Security vulnerability | See [SECURITY.md](SECURITY.md) — do **not** open a public issue |

## What to Include

When reporting a bug or asking for help, include:

- **What you expected** vs **what happened**
- **Steps to reproduce** (the more specific, the faster we can help)
- **Environment** — Node version, OS, browser, Supabase plan
- **Logs** — edge function logs (`npx supabase functions logs <name>`) or browser console errors
- **Screenshots** if it's a UI issue
