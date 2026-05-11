-- Add comprehensive account context for LLM retrieval and analysis.

CREATE OR REPLACE FUNCTION public.get_account_context_for_llm(
  p_account_id UUID,
  p_organization_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.accounts
    WHERE id = p_account_id
      AND organization_id = p_organization_id
  ) THEN
    RETURN NULL;
  END IF;

  WITH
  account_data AS (
    SELECT jsonb_build_object(
      'id',                   a.id,
      'name',                 a.name,
      'account_number',       a.account_number,
      'account_type',         a.account_type,
      'industry',             a.industry,
      'website',              a.website,
      'domain',               a.domain,
      'phone',                a.phone,
      'description',          a.description,
      'health_score',         a.health_score,
      'arr',                  a.arr,
      'mrr',                  a.mrr,
      'total_revenue',        a.total_revenue,
      'customer_since',       a.customer_since,
      'churn_risk_score',     a.churn_risk_score,
      'expansion_potential',  a.expansion_potential,
      'enriched_at',          a.enriched_at,
      'created_at',           a.created_at,
      'updated_at',           a.updated_at
    ) AS data
    FROM public.accounts a
    WHERE a.id = p_account_id
      AND a.organization_id = p_organization_id
  ),

  account_contacts_base AS (
    SELECT c.*
    FROM public.contacts c
    WHERE c.account_id = p_account_id
      AND c.organization_id = p_organization_id
    ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
    LIMIT 50
  ),

  account_deals_base AS (
    SELECT d.*
    FROM public.deals d
    WHERE d.account_id = p_account_id
      AND d.organization_id = p_organization_id
    ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
    LIMIT 50
  ),

  related_contact_ids AS (
    SELECT ac.id AS contact_id
    FROM account_contacts_base ac
    WHERE ac.id IS NOT NULL
    UNION
    SELECT ad.contact_id
    FROM account_deals_base ad
    WHERE ad.contact_id IS NOT NULL
    UNION
    SELECT dc.contact_id
    FROM public.deal_contacts dc
    JOIN account_deals_base ad ON ad.id = dc.deal_id
    WHERE dc.organization_id = p_organization_id
      AND dc.contact_id IS NOT NULL
  ),

  related_deal_ids AS (
    SELECT id AS deal_id
    FROM account_deals_base
  ),

  contacts_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',                       c.id,
        'name',                     COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'email',                    c.email,
        'phone',                    c.phone,
        'title',                    c.title,
        'position',                 c.position,
        'status',                   c.status,
        'lead_source',              c.lead_source,
        'lead_score',               c.lead_score,
        'overall_lead_score',       c.overall_lead_score,
        'relationship_strength',    c.relationship_strength,
        'decision_authority',       c.decision_authority,
        'communication_preference', c.communication_preference,
        'updated_at',               c.updated_at
      ) ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT *
      FROM account_contacts_base
      LIMIT 25
    ) c
  ),

  deals_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',                  d.id,
        'name',                d.name,
        'amount',              d.amount,
        'currency',            d.currency,
        'stage',               d.stage,
        'probability',         d.probability,
        'close_date',          d.close_date,
        'expected_close_date', d.expected_close_date,
        'forecast_category',   d.forecast_category,
        'key_use_case',        d.key_use_case,
        'competitor_name',     d.competitor_name,
        'lead_source',         d.lead_source,
        'updated_at',          d.updated_at
      ) ORDER BY d.updated_at DESC NULLS LAST, d.created_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT *
      FROM account_deals_base
      LIMIT 25
    ) d
  ),

  deal_summary_data AS (
    SELECT jsonb_build_object(
      'total_deals', COUNT(*)::int,
      'open_deals', COUNT(*) FILTER (
        WHERE LOWER(REPLACE(COALESCE(stage, ''), '_', '-')) NOT IN ('closed-won', 'closed-lost')
      )::int,
      'won_deals', COUNT(*) FILTER (
        WHERE LOWER(REPLACE(COALESCE(stage, ''), '_', '-')) = 'closed-won'
      )::int,
      'open_pipeline_value', COALESCE(SUM(amount) FILTER (
        WHERE LOWER(REPLACE(COALESCE(stage, ''), '_', '-')) NOT IN ('closed-won', 'closed-lost')
      ), 0),
      'won_value', COALESCE(SUM(amount) FILTER (
        WHERE LOWER(REPLACE(COALESCE(stage, ''), '_', '-')) = 'closed-won'
      ), 0),
      'avg_open_probability', ROUND(AVG(probability) FILTER (
        WHERE LOWER(REPLACE(COALESCE(stage, ''), '_', '-')) NOT IN ('closed-won', 'closed-lost')
      )),
      'last_deal_updated_at', MAX(updated_at)
    ) AS data
    FROM account_deals_base
  ),

  scoped_activities AS (
    SELECT a.*
    FROM public.activities a
    WHERE a.organization_id = p_organization_id
      AND (
        a.account_id = p_account_id
        OR a.deal_id IN (SELECT deal_id FROM related_deal_ids)
        OR a.contact_id IN (SELECT contact_id FROM related_contact_ids)
      )
    ORDER BY COALESCE(a.scheduled_at, a.activity_date, a.created_at) DESC
    LIMIT 30
  ),

  recent_activities_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',            a.id,
        'title',         a.title,
        'subject',       a.subject,
        'type',          a.type,
        'description',   a.description,
        'scheduled_at',  a.scheduled_at,
        'activity_date', a.activity_date,
        'completed',     a.completed,
        'contact_id',    a.contact_id,
        'deal_id',       a.deal_id
      ) ORDER BY COALESCE(a.scheduled_at, a.activity_date, a.created_at) DESC
    ), '[]'::jsonb) AS data
    FROM scoped_activities a
  ),

  open_tasks_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',         t.id,
        'title',      t.title,
        'description', t.description,
        'priority',   t.priority,
        'status',     t.status,
        'due_date',   t.due_date,
        'contact_id', t.contact_id,
        'deal_id',    t.deal_id
      ) ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT t2.*
      FROM public.tasks t2
      WHERE t2.organization_id = p_organization_id
        AND t2.completed = false
        AND (
          t2.account_id = p_account_id
          OR t2.deal_id IN (SELECT deal_id FROM related_deal_ids)
          OR t2.contact_id IN (SELECT contact_id FROM related_contact_ids)
        )
      ORDER BY t2.due_date ASC NULLS LAST, t2.created_at DESC
      LIMIT 20
    ) t
  ),

  scoped_email_messages AS (
    SELECT em.*
    FROM public.email_messages em
    WHERE em.organization_id = p_organization_id
      AND (
        em.account_id = p_account_id
        OR em.deal_id IN (SELECT deal_id FROM related_deal_ids)
        OR em.contact_id IN (SELECT contact_id FROM related_contact_ids)
      )
    ORDER BY em.received_at DESC
    LIMIT 60
  ),

  recent_email_messages_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',              em.id,
        'provider',        em.provider,
        'direction',       em.direction,
        'from_email',      em.from_email,
        'from_name',       em.from_name,
        'to_emails',       em.to_emails,
        'cc_emails',       em.cc_emails,
        'subject',         em.subject,
        'snippet',         em.snippet,
        'received_at',     em.received_at,
        'match_status',    em.match_status,
        'match_method',    em.match_method,
        'contact_id',      em.contact_id,
        'contact_name',    COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'deal_id',         em.deal_id,
        'deal_name',       d.name,
        'has_attachments', em.has_attachments
      ) ORDER BY em.received_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT *
      FROM scoped_email_messages
      ORDER BY received_at DESC
      LIMIT 25
    ) em
    LEFT JOIN public.contacts c ON c.id = em.contact_id
    LEFT JOIN public.deals d ON d.id = em.deal_id
  ),

  email_summary_data AS (
    SELECT jsonb_build_object(
      'recent_window_count', COUNT(*)::int,
      'inbound_count', COUNT(*) FILTER (WHERE direction = 'inbound')::int,
      'outbound_count', COUNT(*) FILTER (WHERE direction = 'outbound')::int,
      'last_email_at', MAX(received_at),
      'last_inbound_at', MAX(received_at) FILTER (WHERE direction = 'inbound'),
      'last_outbound_at', MAX(received_at) FILTER (WHERE direction = 'outbound')
    ) AS data
    FROM scoped_email_messages
  ),

  email_engagement_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'contact_id',             c.id,
        'contact_name',           COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'contact_email',          c.email,
        'total_emails_sent',      ees.total_emails_sent,
        'total_emails_received',  ees.total_emails_received,
        'last_email_sent_at',     ees.last_email_sent_at,
        'last_email_received_at', ees.last_email_received_at,
        'avg_gap_days',           ees.avg_gap_days,
        'avg_response_hours',     ees.avg_response_hours,
        'last_30d_sent',          ees.last_30d_sent,
        'last_30d_received',      ees.last_30d_received,
        'engagement_score',       ees.engagement_score
      ) ORDER BY COALESCE(ees.last_email_received_at, ees.last_email_sent_at, ees.updated_at) DESC NULLS LAST
    ), '[]'::jsonb) AS data
    FROM public.email_engagement_stats ees
    JOIN related_contact_ids rci ON rci.contact_id = ees.contact_id
    JOIN public.contacts c ON c.id = ees.contact_id
    WHERE ees.organization_id = p_organization_id
  ),

  contact_memory_rows AS (
    SELECT
      c.id AS contact_id,
      COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))) AS contact_name,
      c.email AS contact_email,
      cm.memory,
      facts.facts
    FROM related_contact_ids rci
    JOIN public.contacts c ON c.id = rci.contact_id
    LEFT JOIN public.client_memory cm
      ON cm.contact_id = c.id
     AND cm.organization_id = p_organization_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(jsonb_agg(fact.value ORDER BY fact.ordinality), '[]'::jsonb) AS facts
      FROM jsonb_array_elements(COALESCE(cm.memory->'facts', '[]'::jsonb)) WITH ORDINALITY AS fact(value, ordinality)
      WHERE fact.ordinality <= 8
    ) facts ON true
    WHERE cm.id IS NOT NULL
  ),

  contact_memory_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'contact_id',                contact_id,
        'contact_name',              contact_name,
        'contact_email',             contact_email,
        'summary',                   memory->>'summary',
        'communication_preferences', COALESCE(memory->'communication_preferences', '{}'::jsonb),
        'relationship_signals',      COALESCE(memory->'relationship_signals', '{}'::jsonb),
        'key_dates',                 COALESCE(memory->'key_dates', '[]'::jsonb),
        'facts',                     facts
      ) ORDER BY contact_name
    ), '[]'::jsonb) AS data
    FROM contact_memory_rows
  )

  SELECT jsonb_build_object(
    'account',               ad.data,
    'deal_summary',          dsd.data,
    'contacts',              cd.data,
    'deals',                 dd.data,
    'recent_activities',     rad.data,
    'open_tasks',            otd.data,
    'recent_email_messages', remd.data,
    'email_summary',         esd.data,
    'email_engagement',      eed.data,
    'contact_memory',        cmd.data,
    '_meta', jsonb_build_object(
      'source_tables', ARRAY[
        'accounts','contacts','deals','deal_contacts','activities','tasks',
        'email_messages','email_engagement_stats','client_memory'
      ],
      'contact_limit', 25,
      'deal_limit', 25,
      'activity_limit', 30,
      'email_message_limit', 25,
      'queried_at', NOW()
    )
  ) INTO v_result
  FROM account_data ad
  CROSS JOIN deal_summary_data dsd
  CROSS JOIN contacts_data cd
  CROSS JOIN deals_data dd
  CROSS JOIN recent_activities_data rad
  CROSS JOIN open_tasks_data otd
  CROSS JOIN recent_email_messages_data remd
  CROSS JOIN email_summary_data esd
  CROSS JOIN email_engagement_data eed
  CROSS JOIN contact_memory_data cmd;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_account_context_for_llm(UUID, UUID) IS
  'Returns comprehensive account context for LLM analysis, including account details, contacts, deals, activities, tasks, recent email snippets, email engagement stats, and contact memory.';

REVOKE ALL ON FUNCTION public.get_account_context_for_llm(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_account_context_for_llm(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_context_for_llm(UUID, UUID) TO service_role;
