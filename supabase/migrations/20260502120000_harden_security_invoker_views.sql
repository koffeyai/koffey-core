-- Ensure reporting/context views enforce the caller's RLS policies.
-- Supabase flags views without security_invoker because they can otherwise
-- execute with creator privileges and bypass tenant boundaries.

DO $$
BEGIN
  IF to_regclass('public.entity_messages_unified') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.entity_messages_unified SET (security_invoker = on)';
  END IF;

  IF to_regclass('public.product_gap_insights') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.product_gap_insights SET (security_invoker = on)';
  END IF;

  IF to_regclass('public.product_mention_summary') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.product_mention_summary SET (security_invoker = on)';
  END IF;
END $$;

COMMENT ON VIEW public.entity_messages_unified IS
  'Unified entity message context view. Uses security_invoker so tenant RLS is enforced for direct queries.';

COMMENT ON VIEW public.product_gap_insights IS
  'Product gap reporting view. Uses security_invoker so tenant RLS is enforced for direct queries.';

COMMENT ON VIEW public.product_mention_summary IS
  'Product mention reporting view. Uses security_invoker so tenant RLS is enforced for direct queries.';
