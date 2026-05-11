-- Add short-TTL cache for typed CRM context resources.

CREATE TABLE IF NOT EXISTS public.context_resource_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL UNIQUE,
  resource_uri TEXT NOT NULL,
  resource_type TEXT NOT NULL CHECK (
    resource_type IN (
      'deal_context',
      'account_context',
      'contact_context',
      'pipeline_context',
      'entity_messages'
    )
  ),
  source_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload JSONB NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_context_resource_cache_org_resource
  ON public.context_resource_cache (organization_id, resource_uri);

CREATE INDEX IF NOT EXISTS idx_context_resource_cache_user_type
  ON public.context_resource_cache (organization_id, user_id, resource_type);

CREATE INDEX IF NOT EXISTS idx_context_resource_cache_expires
  ON public.context_resource_cache (expires_at);

COMMENT ON TABLE public.context_resource_cache IS
  'Short-TTL cache for typed, read-only CRM context resources used by the unified chat context gateway.';

COMMENT ON COLUMN public.context_resource_cache.source_versions IS
  'Reserved for future row-version/watermark invalidation. Current implementation uses TTL plus org-wide invalidation on mutations.';

ALTER TABLE public.context_resource_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to context resource cache"
  ON public.context_resource_cache;
CREATE POLICY "Service role full access to context resource cache"
  ON public.context_resource_cache
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.context_resource_cache FROM PUBLIC;
GRANT ALL ON TABLE public.context_resource_cache TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_context_resource_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.context_resource_cache
  WHERE expires_at < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_context_resource_cache() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_context_resource_cache() TO service_role;
