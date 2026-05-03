-- Make synced email a first-class CRM signal:
-- - create timeline activities for account/deal domain matches
-- - create activities and engagement stats when contact emails are backfilled
-- - provide a safe manual-link RPC for unmatched email triage

CREATE INDEX IF NOT EXISTS idx_email_messages_unlinked_from_email
  ON public.email_messages (organization_id, lower(from_email))
  WHERE contact_id IS NULL AND match_status <> 'ignored';

CREATE INDEX IF NOT EXISTS idx_email_messages_unlinked_to_emails
  ON public.email_messages USING GIN (to_emails)
  WHERE contact_id IS NULL AND match_status <> 'ignored';

CREATE OR REPLACE FUNCTION public.create_email_activity_for_message(
  p_email_message_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_row public.email_messages%ROWTYPE;
  new_activity_id UUID;
BEGIN
  SELECT *
  INTO email_row
  FROM public.email_messages
  WHERE id = p_email_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF email_row.activity_id IS NOT NULL THEN
    RETURN email_row.activity_id;
  END IF;

  IF email_row.contact_id IS NULL
     AND email_row.account_id IS NULL
     AND email_row.deal_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.activities (
    organization_id,
    user_id,
    assigned_to,
    type,
    title,
    subject,
    description,
    contact_id,
    account_id,
    deal_id,
    scheduled_at,
    activity_date,
    completed
  )
  VALUES (
    email_row.organization_id,
    email_row.user_id,
    email_row.user_id,
    CASE WHEN email_row.direction = 'outbound' THEN 'email_sent' ELSE 'email_received' END,
    CASE
      WHEN email_row.direction = 'outbound'
        THEN 'Email sent: ' || COALESCE(email_row.subject, '(no subject)')
      ELSE 'Email received: ' || COALESCE(email_row.subject, '(no subject)')
    END,
    email_row.subject,
    COALESCE(email_row.snippet, ''),
    email_row.contact_id,
    email_row.account_id,
    email_row.deal_id,
    email_row.received_at,
    email_row.received_at,
    TRUE
  )
  RETURNING id INTO new_activity_id;

  UPDATE public.email_messages
  SET activity_id = new_activity_id,
      updated_at = NOW()
  WHERE id = email_row.id;

  RETURN new_activity_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_email_engagement_stats_for_contact(
  p_contact_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  WITH messages AS (
    SELECT
      contact_id,
      organization_id,
      direction,
      received_at,
      LAG(received_at) OVER (PARTITION BY contact_id ORDER BY received_at) AS previous_received_at
    FROM public.email_messages
    WHERE contact_id = p_contact_id
      AND match_status = 'matched'
  ),
  totals AS (
    SELECT
      contact_id,
      organization_id,
      COUNT(*) FILTER (WHERE direction = 'outbound')::INTEGER AS total_emails_sent,
      COUNT(*) FILTER (WHERE direction = 'inbound')::INTEGER AS total_emails_received,
      MAX(received_at) FILTER (WHERE direction = 'outbound') AS last_email_sent_at,
      MAX(received_at) FILTER (WHERE direction = 'inbound') AS last_email_received_at,
      COUNT(*) FILTER (
        WHERE direction = 'outbound'
          AND received_at >= NOW() - INTERVAL '30 days'
      )::INTEGER AS last_30d_sent,
      COUNT(*) FILTER (
        WHERE direction = 'inbound'
          AND received_at >= NOW() - INTERVAL '30 days'
      )::INTEGER AS last_30d_received,
      AVG(EXTRACT(EPOCH FROM (received_at - previous_received_at)) / 86400)
        FILTER (WHERE previous_received_at IS NOT NULL) AS avg_gap_days
    FROM messages
    GROUP BY contact_id, organization_id
  )
  INSERT INTO public.email_engagement_stats (
    contact_id,
    organization_id,
    total_emails_sent,
    total_emails_received,
    last_email_sent_at,
    last_email_received_at,
    last_30d_sent,
    last_30d_received,
    avg_gap_days,
    updated_at
  )
  SELECT
    contact_id,
    organization_id,
    total_emails_sent,
    total_emails_received,
    last_email_sent_at,
    last_email_received_at,
    last_30d_sent,
    last_30d_received,
    avg_gap_days,
    NOW()
  FROM totals
  ON CONFLICT (contact_id) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      total_emails_sent = EXCLUDED.total_emails_sent,
      total_emails_received = EXCLUDED.total_emails_received,
      last_email_sent_at = EXCLUDED.last_email_sent_at,
      last_email_received_at = EXCLUDED.last_email_received_at,
      last_30d_sent = EXCLUDED.last_30d_sent,
      last_30d_received = EXCLUDED.last_30d_received,
      avg_gap_days = EXCLUDED.avg_gap_days,
      updated_at = NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.backfill_email_messages_for_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  linked_email_id UUID;
BEGIN
  IF NEW.email IS NOT NULL
     AND (
       TG_OP = 'INSERT'
       OR OLD.email IS DISTINCT FROM NEW.email
       OR OLD.account_id IS DISTINCT FROM NEW.account_id
     ) THEN
    FOR linked_email_id IN
      WITH linked AS (
        UPDATE public.email_messages em
        SET contact_id = COALESCE(em.contact_id, NEW.id),
            account_id = COALESCE(NEW.account_id, em.account_id),
            deal_id = COALESCE(
              em.deal_id,
              (
                SELECT d.id
                FROM public.deals d
                WHERE d.organization_id = NEW.organization_id
                  AND (
                    d.contact_id = NEW.id
                    OR (
                      COALESCE(NEW.account_id, em.account_id) IS NOT NULL
                      AND d.account_id = COALESCE(NEW.account_id, em.account_id)
                    )
                  )
                ORDER BY d.updated_at DESC
                LIMIT 1
              )
            ),
            match_status = 'matched',
            match_method = 'backfill',
            updated_at = NOW()
        WHERE em.organization_id = NEW.organization_id
          AND (em.contact_id IS NULL OR em.contact_id = NEW.id)
          AND em.match_status <> 'ignored'
          AND (
            lower(em.from_email) = lower(NEW.email)
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(em.to_emails, ARRAY[]::TEXT[])) AS recipient(email)
              WHERE lower(recipient.email) = lower(NEW.email)
            )
          )
        RETURNING em.id
      )
      SELECT id FROM linked
    LOOP
      PERFORM public.create_email_activity_for_message(linked_email_id);
    END LOOP;

    PERFORM public.refresh_email_engagement_stats_for_contact(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_emails ON public.contacts;
CREATE TRIGGER trg_backfill_emails
  AFTER INSERT OR UPDATE OF email, account_id ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_email_messages_for_contact();

CREATE OR REPLACE FUNCTION public.link_email_message_to_crm(
  p_email_message_id UUID,
  p_contact_id UUID DEFAULT NULL,
  p_account_id UUID DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL
)
RETURNS public.email_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requester_id UUID := auth.uid();
  email_row public.email_messages%ROWTYPE;
  linked_row public.email_messages%ROWTYPE;
  resolved_contact_id UUID;
  resolved_account_id UUID;
  resolved_deal_id UUID;
  contact_account_id UUID;
  deal_account_id UUID;
  deal_contact_id UUID;
  new_activity_id UUID;
BEGIN
  IF requester_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO email_row
  FROM public.email_messages
  WHERE id = p_email_message_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email message not found';
  END IF;

  IF NOT email_row.organization_id = ANY(public.get_user_organization_ids()) THEN
    RAISE EXCEPTION 'Not authorized to link this email message';
  END IF;

  IF email_row.user_id <> requester_id THEN
    RAISE EXCEPTION 'Not authorized to link another user''s synced email message';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT account_id
    INTO contact_account_id
    FROM public.contacts
    WHERE id = p_contact_id
      AND organization_id = email_row.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contact does not belong to this organization';
    END IF;
  END IF;

  IF p_account_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts
       WHERE id = p_account_id
         AND organization_id = email_row.organization_id
     ) THEN
    RAISE EXCEPTION 'Account does not belong to this organization';
  END IF;

  IF p_deal_id IS NOT NULL THEN
    SELECT account_id, contact_id
    INTO deal_account_id, deal_contact_id
    FROM public.deals
    WHERE id = p_deal_id
      AND organization_id = email_row.organization_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Deal does not belong to this organization';
    END IF;
  END IF;

  resolved_contact_id := COALESCE(p_contact_id, deal_contact_id, email_row.contact_id);
  resolved_account_id := COALESCE(p_account_id, deal_account_id, contact_account_id, email_row.account_id);
  resolved_deal_id := COALESCE(p_deal_id, email_row.deal_id);

  IF resolved_contact_id IS NULL
     AND resolved_account_id IS NULL
     AND resolved_deal_id IS NULL THEN
    RAISE EXCEPTION 'Provide at least one CRM record to link';
  END IF;

  UPDATE public.email_messages
  SET contact_id = resolved_contact_id,
      account_id = resolved_account_id,
      deal_id = resolved_deal_id,
      match_status = 'matched',
      match_method = 'manual',
      updated_at = NOW()
  WHERE id = email_row.id
  RETURNING * INTO linked_row;

  new_activity_id := public.create_email_activity_for_message(linked_row.id);

  IF new_activity_id IS NOT NULL THEN
    SELECT *
    INTO linked_row
    FROM public.email_messages
    WHERE id = email_row.id;
  END IF;

  IF resolved_contact_id IS NOT NULL THEN
    PERFORM public.refresh_email_engagement_stats_for_contact(resolved_contact_id);
  END IF;

  RETURN linked_row;
END;
$$;

UPDATE public.email_messages
SET match_status = 'matched',
    match_method = COALESCE(match_method, CASE WHEN contact_id IS NOT NULL THEN 'email_exact' ELSE 'domain' END),
    updated_at = NOW()
WHERE match_status = 'unmatched'
  AND (contact_id IS NOT NULL OR account_id IS NOT NULL OR deal_id IS NOT NULL);

DO $$
DECLARE
  v_email_id UUID;
  v_contact_id UUID;
BEGIN
  FOR v_email_id IN
    SELECT id
    FROM public.email_messages
    WHERE activity_id IS NULL
      AND match_status = 'matched'
      AND (contact_id IS NOT NULL OR account_id IS NOT NULL OR deal_id IS NOT NULL)
  LOOP
    PERFORM public.create_email_activity_for_message(v_email_id);
  END LOOP;

  FOR v_contact_id IN
    SELECT DISTINCT em.contact_id
    FROM public.email_messages em
    WHERE em.contact_id IS NOT NULL
  LOOP
    PERFORM public.refresh_email_engagement_stats_for_contact(v_contact_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_email_activity_for_message(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_email_engagement_stats_for_contact(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_email_message_to_crm(UUID, UUID, UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_email_activity_for_message(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_email_engagement_stats_for_contact(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_email_message_to_crm(UUID, UUID, UUID, UUID) TO authenticated, service_role;
