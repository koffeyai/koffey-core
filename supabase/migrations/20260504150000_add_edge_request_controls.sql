-- Durable controls used by Edge Functions for rate limiting and idempotency.

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edge_rate_limits FROM anon, authenticated;
GRANT ALL ON TABLE public.edge_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_rate_key TEXT,
  p_max_requests INTEGER,
  p_window_seconds INTEGER,
  p_block_seconds INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  reset_at TIMESTAMPTZ,
  blocked_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := statement_timestamp();
  v_window INTERVAL := make_interval(secs => GREATEST(1, p_window_seconds));
  v_block INTERVAL := make_interval(secs => GREATEST(1, p_block_seconds));
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_blocked_until TIMESTAMPTZ;
BEGIN
  IF p_rate_key IS NULL OR btrim(p_rate_key) = '' THEN
    RAISE EXCEPTION 'rate key is required';
  END IF;

  IF p_max_requests IS NULL OR p_max_requests < 1 THEN
    RAISE EXCEPTION 'max requests must be positive';
  END IF;

  INSERT INTO public.edge_rate_limits (rate_key, request_count, window_start, blocked_until, updated_at)
  VALUES (p_rate_key, 0, v_now, NULL, v_now)
  ON CONFLICT (rate_key) DO NOTHING;

  SELECT request_count, window_start, edge_rate_limits.blocked_until
    INTO v_count, v_window_start, v_blocked_until
  FROM public.edge_rate_limits
  WHERE rate_key = p_rate_key
  FOR UPDATE;

  IF v_window_start + v_window <= v_now THEN
    v_count := 0;
    v_window_start := v_now;
    v_blocked_until := NULL;
  END IF;

  IF v_blocked_until IS NOT NULL AND v_blocked_until > v_now THEN
    UPDATE public.edge_rate_limits
    SET request_count = v_count,
        window_start = v_window_start,
        updated_at = v_now
    WHERE rate_key = p_rate_key;

    RETURN QUERY SELECT
      FALSE,
      0,
      GREATEST(v_window_start + v_window, v_blocked_until),
      v_blocked_until;
    RETURN;
  END IF;

  v_count := v_count + 1;

  IF v_count > p_max_requests THEN
    v_blocked_until := v_now + v_block;

    UPDATE public.edge_rate_limits
    SET request_count = v_count,
        window_start = v_window_start,
        blocked_until = v_blocked_until,
        updated_at = v_now
    WHERE rate_key = p_rate_key;

    RETURN QUERY SELECT
      FALSE,
      0,
      GREATEST(v_window_start + v_window, v_blocked_until),
      v_blocked_until;
    RETURN;
  END IF;

  UPDATE public.edge_rate_limits
  SET request_count = v_count,
      window_start = v_window_start,
      blocked_until = NULL,
      updated_at = v_now
  WHERE rate_key = p_rate_key;

  RETURN QUERY SELECT
    TRUE,
    GREATEST(p_max_requests - v_count, 0),
    v_window_start + v_window,
    NULL::TIMESTAMPTZ;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(TEXT, INTEGER, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.edge_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'failed')),
  response_payload JSONB,
  error_message TEXT,
  trace_id TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_edge_idempotency_keys_expires_at
  ON public.edge_idempotency_keys (expires_at);

CREATE INDEX IF NOT EXISTS idx_edge_idempotency_keys_user_scope
  ON public.edge_idempotency_keys (organization_id, user_id, scope);

ALTER TABLE public.edge_idempotency_keys ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.edge_idempotency_keys FROM anon, authenticated;
GRANT ALL ON TABLE public.edge_idempotency_keys TO service_role;
