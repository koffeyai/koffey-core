-- Add communication and relationship evidence to the deal context used by SCOUTPAD.

CREATE OR REPLACE FUNCTION public.get_deal_context_for_llm(
  p_deal_id UUID,
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
    FROM public.deals
    WHERE id = p_deal_id
      AND organization_id = p_organization_id
  ) THEN
    RETURN NULL;
  END IF;

  WITH
  deal_data AS (
    SELECT jsonb_build_object(
      'id',                  d.id,
      'name',                d.name,
      'amount',              d.amount,
      'stage',               d.stage,
      'probability',         d.probability,
      'close_date',          d.close_date,
      'expected_close_date', d.expected_close_date,
      'forecast_category',   d.forecast_category,
      'description',         d.description,
      'key_use_case',        d.key_use_case,
      'products_positioned', d.products_positioned,
      'competitor_name',     d.competitor_name,
      'currency',            d.currency,
      'close_reason',        d.close_reason,
      'close_notes',         d.close_notes,
      'lead_source',         d.lead_source,
      'created_at',          d.created_at,
      'updated_at',          d.updated_at
    ) AS data,
    d.account_id,
    d.contact_id
    FROM public.deals d
    WHERE d.id = p_deal_id
      AND d.organization_id = p_organization_id
  ),

  account_data AS (
    SELECT jsonb_build_object(
      'id',          a.id,
      'name',        a.name,
      'industry',    a.industry,
      'website',     a.website,
      'domain',      a.domain,
      'description', a.description
    ) AS data
    FROM public.accounts a
    JOIN deal_data dd ON dd.account_id = a.id
  ),

  primary_contact_data AS (
    SELECT jsonb_build_object(
      'id',       c.id,
      'name',     COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
      'email',    c.email,
      'phone',    c.phone,
      'position', c.position,
      'company',  c.company
    ) AS data
    FROM public.contacts c
    JOIN deal_data dd ON dd.contact_id = c.id
  ),

  participant_contacts AS (
    SELECT dd.contact_id
    FROM deal_data dd
    WHERE dd.contact_id IS NOT NULL
    UNION
    SELECT dc.contact_id
    FROM public.deal_contacts dc
    WHERE dc.deal_id = p_deal_id
      AND dc.organization_id = p_organization_id
      AND dc.contact_id IS NOT NULL
  ),

  stakeholders_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',             c.id,
        'name',           COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'role_in_deal',   dc.role_in_deal,
        'quadrant',       dc.quadrant,
        'support_axis',   dc.support_axis,
        'influence_axis', dc.influence_axis,
        'email',          c.email,
        'position',       c.position
      ) ORDER BY COALESCE(dc.updated_at, dc.created_at) DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT dc2.*
      FROM public.deal_contacts dc2
      WHERE dc2.deal_id = p_deal_id
        AND dc2.organization_id = p_organization_id
      ORDER BY COALESCE(dc2.updated_at, dc2.created_at) DESC
      LIMIT 15
    ) dc
    JOIN public.contacts c ON c.id = dc.contact_id
  ),

  recent_activities_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',           a.id,
        'title',        a.title,
        'type',         a.type,
        'subject',      a.subject,
        'description',  a.description,
        'scheduled_at', a.scheduled_at,
        'activity_date', a.activity_date,
        'completed',    a.completed
      ) ORDER BY COALESCE(a.scheduled_at, a.activity_date, a.created_at) DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT a2.*
      FROM public.activities a2
      WHERE a2.deal_id = p_deal_id
        AND a2.organization_id = p_organization_id
      ORDER BY COALESCE(a2.scheduled_at, a2.activity_date, a2.created_at) DESC
      LIMIT 15
    ) a
  ),

  open_tasks_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',       t.id,
        'title',    t.title,
        'priority', t.priority,
        'status',   t.status,
        'due_date', t.due_date
      ) ORDER BY t.due_date ASC NULLS LAST
    ), '[]'::jsonb) AS data
    FROM (
      SELECT t2.*
      FROM public.tasks t2
      WHERE t2.deal_id = p_deal_id
        AND t2.organization_id = p_organization_id
        AND t2.completed = false
      ORDER BY t2.due_date ASC NULLS LAST
      LIMIT 10
    ) t
  ),

  deal_notes_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',         dn.id,
        'content',    dn.content,
        'note_type',  dn.note_type,
        'created_at', dn.created_at
      ) ORDER BY dn.created_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT dn2.*
      FROM public.deal_notes dn2
      WHERE dn2.deal_id = p_deal_id
        AND dn2.organization_id = p_organization_id
      ORDER BY dn2.created_at DESC
      LIMIT 5
    ) dn
  ),

  deal_terms_data AS (
    SELECT jsonb_build_object(
      'contract_type',     dt.contract_type,
      'contract_end_date', dt.contract_end_date,
      'auto_renew',        dt.auto_renew,
      'next_qbr_date',     dt.next_qbr_date
    ) AS data
    FROM public.deal_terms dt
    WHERE dt.deal_id = p_deal_id
      AND dt.organization_id = p_organization_id
    LIMIT 1
  ),

  scoped_email_messages AS (
    SELECT em.*
    FROM public.email_messages em
    WHERE em.organization_id = p_organization_id
      AND (
        em.deal_id = p_deal_id
        OR em.contact_id IN (SELECT pc.contact_id FROM participant_contacts pc)
        OR em.account_id = (SELECT dd.account_id FROM deal_data dd)
      )
    ORDER BY em.received_at DESC
    LIMIT 50
  ),

  recent_email_messages_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',             em.id,
        'provider',       em.provider,
        'direction',      em.direction,
        'from_email',     em.from_email,
        'from_name',      em.from_name,
        'to_emails',      em.to_emails,
        'cc_emails',      em.cc_emails,
        'subject',        em.subject,
        'snippet',        em.snippet,
        'received_at',    em.received_at,
        'match_status',   em.match_status,
        'match_method',   em.match_method,
        'contact_id',     em.contact_id,
        'contact_name',   COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'account_id',     em.account_id,
        'account_name',   a.name,
        'deal_id',        em.deal_id,
        'activity_id',    em.activity_id,
        'has_attachments', em.has_attachments
      ) ORDER BY em.received_at DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT *
      FROM scoped_email_messages
      ORDER BY received_at DESC
      LIMIT 20
    ) em
    LEFT JOIN public.contacts c ON c.id = em.contact_id
    LEFT JOIN public.accounts a ON a.id = em.account_id
  ),

  email_summary_data AS (
    SELECT jsonb_build_object(
      'recent_window_count', COUNT(*),
      'inbound_count', COUNT(*) FILTER (WHERE direction = 'inbound'),
      'outbound_count', COUNT(*) FILTER (WHERE direction = 'outbound'),
      'last_email_at', MAX(received_at),
      'last_inbound_at', MAX(received_at) FILTER (WHERE direction = 'inbound'),
      'last_outbound_at', MAX(received_at) FILTER (WHERE direction = 'outbound')
    ) AS data
    FROM scoped_email_messages
  ),

  email_engagement_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'contact_id',              c.id,
        'contact_name',            COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
        'contact_email',           c.email,
        'total_emails_sent',       ees.total_emails_sent,
        'total_emails_received',   ees.total_emails_received,
        'last_email_sent_at',      ees.last_email_sent_at,
        'last_email_received_at',  ees.last_email_received_at,
        'avg_gap_days',            ees.avg_gap_days,
        'avg_response_hours',      ees.avg_response_hours,
        'last_30d_sent',           ees.last_30d_sent,
        'last_30d_received',       ees.last_30d_received,
        'engagement_score',        ees.engagement_score
      ) ORDER BY COALESCE(ees.last_email_received_at, ees.last_email_sent_at, ees.updated_at) DESC NULLS LAST
    ), '[]'::jsonb) AS data
    FROM public.email_engagement_stats ees
    JOIN participant_contacts pc ON pc.contact_id = ees.contact_id
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
    FROM participant_contacts pc
    JOIN public.contacts c ON c.id = pc.contact_id
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
    'deal',                  dd.data,
    'account',               COALESCE(ad.data, NULL),
    'primary_contact',       COALESCE(pcd.data, NULL),
    'stakeholders',          sd.data,
    'recent_activities',     rad.data,
    'open_tasks',            otd.data,
    'deal_notes',            dnd.data,
    'deal_terms',            COALESCE(dtd.data, NULL),
    'recent_email_messages', remd.data,
    'email_summary',         esd.data,
    'email_engagement',      eed.data,
    'contact_memory',        cmd.data,
    '_meta', jsonb_build_object(
      'source_tables', ARRAY[
        'deals','accounts','contacts','deal_contacts','activities','tasks',
        'deal_notes','deal_terms','email_messages','email_engagement_stats',
        'client_memory'
      ],
      'email_message_limit', 20,
      'activity_limit', 15,
      'queried_at', NOW()
    )
  ) INTO v_result
  FROM deal_data dd
  LEFT JOIN account_data ad ON true
  LEFT JOIN primary_contact_data pcd ON true
  CROSS JOIN stakeholders_data sd
  CROSS JOIN recent_activities_data rad
  CROSS JOIN open_tasks_data otd
  CROSS JOIN deal_notes_data dnd
  LEFT JOIN deal_terms_data dtd ON true
  CROSS JOIN recent_email_messages_data remd
  CROSS JOIN email_summary_data esd
  CROSS JOIN email_engagement_data eed
  CROSS JOIN contact_memory_data cmd;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_deal_context_for_llm(UUID, UUID) IS
  'Returns comprehensive deal context for LLM/SCOUTPAD analysis, including deal details, account, contacts, stakeholders, activities, tasks, notes, terms, recent email snippets, email engagement stats, and contact memory.';
