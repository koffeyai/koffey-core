-- Harden calendar sync bookkeeping for hosted and self-hosted deployments.
-- The argument name remains user_id for backwards compatibility with existing
-- edge functions that call rpc('increment_calendar_sync_count', { user_id }).
CREATE OR REPLACE FUNCTION "public"."increment_calendar_sync_count"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE profiles
  SET calendar_sync_count = COALESCE(calendar_sync_count, 0) + 1
  WHERE profiles.id = $1;
END;
$$;
