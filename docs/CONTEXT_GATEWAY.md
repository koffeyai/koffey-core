# Context Gateway

Koffey uses a domain-specific Context Gateway for read-only CRM retrieval. The goal is to give the assistant one stable way to request deal, account, contact, pipeline, and message context without making every prompt depend on ad hoc multi-query tool plans.

## Pattern

The public tool is `get_context_resource`. It accepts either a typed resource request or a resource URI, normalizes it, and dispatches to the existing scoped context skills:

- `crm://accounts/{account_id}/context` -> `get_account_context`
- `crm://deals/{deal_id}/context` -> `get_deal_context`
- `crm://contacts/{contact_id}/context` -> `get_contact_context`
- `crm://accounts/{account_id}/messages` -> `get_entity_messages`
- `analytics://pipeline?scope=org` -> `get_pipeline_context`

The gateway lives at `supabase/functions/unified-chat/skills/context/resource-gateway.ts`. It does not bypass auth, organization scoping, confirmation policy, or the `unified-chat` execution path. Mutations still run through typed mutation tools.

## Cache

Read-only resource results are cached in `public.context_resource_cache` when the underlying skill returns trusted context. Cache keys are scoped by organization, user, resource type, canonical resource URI, and normalized tool args.

Defaults:

- `CONTEXT_RESOURCE_CACHE_ENABLED=true`
- `CONTEXT_RESOURCE_CACHE_TTL_SECONDS=180`
- Per-resource override: `CONTEXT_RESOURCE_CACHE_{RESOURCE_TYPE}_TTL_SECONDS`
- TTL values are clamped between 30 and 900 seconds

The table is service-role only with RLS enabled. Browser clients never read it directly.

## Invalidation

After a successful CRM mutation, `unified-chat` invalidates:

- the read-only chat response cache
- the context resource cache for that organization

That keeps user-facing reads conservative while avoiding stale CRM summaries after writes.

## Future Work

The current policy is simple and safe: short TTL plus organization-wide invalidation on mutations. A more efficient next step is source-version invalidation, where each cached resource stores row-version or updated-at watermarks for the records it used. That would allow targeted invalidation for a changed account, deal, contact, or message thread instead of clearing the whole organization cache.
