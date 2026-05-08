

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






-- Idempotent type creation (PostgreSQL lacks CREATE TYPE IF NOT EXISTS)
DO $$ BEGIN CREATE TYPE "public"."commission_status" AS ENUM ('pending','approved','paid','rejected','voided'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."commission_status" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."compensation_period" AS ENUM ('monthly','quarterly','annual'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."compensation_period" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."conversation_state_enum" AS ENUM ('IDLE','AWAITING_WEBSITE','AWAITING_PHONE','AWAITING_EMAIL','AWAITING_INDUSTRY','AWAITING_COMPANY_NAME','AWAITING_CONTACT_DETAILS','AWAITING_CONFIRMATION','AWAITING_CLARIFICATION','AWAITING_UPDATE_CONFIRMATION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."conversation_state_enum" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."slide_element_type" AS ENUM ('text','image','shape','chart'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."slide_element_type" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."slide_generation_mode" AS ENUM ('template_based','ai_creative'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."slide_generation_mode" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."slide_personalization_level" AS ENUM ('account','deal','contact'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."slide_personalization_level" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."slide_template_type" AS ENUM ('discovery','proposal','qbr','case_study','executive_summary','custom'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."slide_template_type" OWNER TO "postgres";

DO $$ BEGIN CREATE TYPE "public"."slot_mapping_type" AS ENUM ('direct','ai_generated','conditional','static'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "public"."slot_mapping_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_prompt_section"("p_content" "text", "p_section_type" "text", "p_section_title" "text" DEFAULT NULL::"text", "p_section_order" integer DEFAULT 1) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_prompt_id UUID;
  content_valid BOOLEAN;
BEGIN
  -- Validate content
  content_valid := public.validate_prompt_section_content(p_content, p_section_type);
  IF NOT content_valid THEN
    RAISE EXCEPTION 'Content validation failed for section type: %', p_section_type;
  END IF;
  
  -- Deactivate existing active section of same type
  PERFORM public.deactivate_prompt_section(p_section_type, 'replaced_by_new_version');
  
  -- Insert new active section
  INSERT INTO public.system_prompt_config (
    content, 
    version, 
    is_active, 
    created_by, 
    section_type,
    section_order,
    section_title,
    created_at, 
    updated_at,
    performance_metrics
  )
  VALUES (
    p_content,
    COALESCE((SELECT MAX(version) FROM public.system_prompt_config WHERE section_type = p_section_type), 0) + 1,
    true,
    auth.uid(),
    p_section_type,
    p_section_order,
    p_section_title,
    now(),
    now(),
    jsonb_build_object('created_at', extract(epoch from now()), 'usage_count', 0)
  )
  RETURNING id INTO new_prompt_id;
  
  RETURN new_prompt_id;
END;
$$;


ALTER FUNCTION "public"."activate_prompt_section"("p_content" "text", "p_section_type" "text", "p_section_title" "text", "p_section_order" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_organization"("p_name" "text", "p_domain" "text" DEFAULT NULL::"text", "p_owner_email" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
BEGIN
  -- 1. Security Check: Only Platform Admins allowed
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Platform Admin access required';
  END IF;

  -- 2. Create Organization
  INSERT INTO public.organizations (name, domain, created_by)
  VALUES (p_name, p_domain, auth.uid())
  RETURNING id INTO v_org_id;

  -- 3. If owner email provided, try to link them
  IF p_owner_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM public.profiles WHERE email = p_owner_email;
    
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'admin');
    END IF;
  END IF;

  RETURN v_org_id;
END;
$$;


ALTER FUNCTION "public"."admin_create_organization"("p_name" "text", "p_domain" "text", "p_owner_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_all_users"("page_offset" integer DEFAULT 0, "page_limit" integer DEFAULT 50, "search_query" "text" DEFAULT ''::"text") RETURNS TABLE("id" "uuid", "email" character varying, "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "is_platform_admin" boolean, "org_memberships" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
BEGIN
  -- Security Check
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Platform Admin access required';
  END IF;

  RETURN QUERY
  SELECT 
    au.id,
    au.email::VARCHAR,
    au.created_at,
    au.last_sign_in_at,
    EXISTS(SELECT 1 FROM public.platform_admins pa WHERE pa.id = au.id) as is_platform_admin,
    COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object(
          'org_name', o.name,
          'org_id', o.id,
          'role', om.role,
          'is_active', om.is_active
        ))
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
        WHERE om.user_id = au.id
      ),
      '[]'::jsonb
    ) as org_memberships
  FROM auth.users au
  WHERE 
    au.email ILIKE '%' || search_query || '%'
  ORDER BY au.created_at DESC
  LIMIT page_limit OFFSET page_offset;
END;
$$;


ALTER FUNCTION "public"."admin_get_all_users"("page_offset" integer, "page_limit" integer, "search_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_manage_user_org"("p_user_id" "uuid", "p_target_org_id" "uuid", "p_role" "text" DEFAULT 'member'::"text", "p_action" "text" DEFAULT 'add'::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_action = 'remove' THEN
    UPDATE public.organization_members
    SET is_active = false
    WHERE user_id = p_user_id AND organization_id = p_target_org_id;
  ELSE
    INSERT INTO public.organization_members (organization_id, user_id, role, is_active)
    VALUES (p_target_org_id, p_user_id, p_role, true)
    ON CONFLICT (organization_id, user_id)
    DO UPDATE SET role = p_role, is_active = true;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."admin_manage_user_org"("p_user_id" "uuid", "p_target_org_id" "uuid", "p_role" "text", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_organization"("p_org_id" "uuid", "p_name" "text", "p_domain" "text", "p_is_active" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Unauthorized: Platform Admin access required';
  END IF;

  UPDATE public.organizations
  SET 
    name = p_name,
    domain = p_domain,
    is_active = p_is_active,
    updated_at = now()
  WHERE id = p_org_id;

  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."admin_update_organization"("p_org_id" "uuid", "p_name" "text", "p_domain" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analyze_data_quality_with_recommendations"("p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  contact_stats RECORD;
  deal_stats RECORD;
  account_stats RECORD;
  overall_score INTEGER := 0;
  grade TEXT := 'Needs Improvement';
  recommendations JSONB := '[]'::jsonb;
  result JSONB;
BEGIN
  -- Analyze contacts
  SELECT 
    COUNT(*) as total_contacts,
    COUNT(CASE WHEN email IS NOT NULL AND email != '' THEN 1 END) as has_email,
    COUNT(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 END) as has_phone,
    COUNT(CASE WHEN title IS NOT NULL AND title != '' THEN 1 END) as has_title,
    COUNT(CASE WHEN company IS NOT NULL AND company != '' THEN 1 END) as has_company,
    COUNT(CASE WHEN created_at > now() - interval '30 days' THEN 1 END) as recent_additions,
    COUNT(CASE WHEN updated_at < now() - interval '90 days' THEN 1 END) as stale_contacts
  INTO contact_stats
  FROM public.contacts 
  WHERE organization_id = p_organization_id;
  
  -- Analyze deals
  SELECT 
    COUNT(*) as total_deals,
    COUNT(CASE WHEN amount IS NOT NULL AND amount > 0 THEN 1 END) as has_amount,
    COUNT(CASE WHEN close_date IS NOT NULL THEN 1 END) as has_close_date,
    COUNT(CASE WHEN stage = 'won' THEN 1 END) as won_deals,
    COUNT(CASE WHEN close_date < CURRENT_DATE AND stage NOT IN ('won', 'lost') THEN 1 END) as overdue_deals,
    AVG(CASE WHEN amount IS NOT NULL AND amount > 0 THEN amount END) as avg_deal_size
  INTO deal_stats
  FROM public.deals 
  WHERE organization_id = p_organization_id;
  
  -- Analyze accounts
  SELECT 
    COUNT(*) as total_accounts,
    COUNT(CASE WHEN industry IS NOT NULL AND industry != '' THEN 1 END) as has_industry,
    COUNT(CASE WHEN website IS NOT NULL AND website != '' THEN 1 END) as has_website
  INTO account_stats
  FROM public.accounts 
  WHERE organization_id = p_organization_id;
  
  -- Calculate overall score (0-100)
  overall_score := (
    CASE WHEN contact_stats.total_contacts > 0 THEN
      (contact_stats.has_email * 100 / contact_stats.total_contacts * 0.3 +
       contact_stats.has_phone * 100 / contact_stats.total_contacts * 0.2 +
       contact_stats.has_title * 100 / contact_stats.total_contacts * 0.2 +
       contact_stats.has_company * 100 / contact_stats.total_contacts * 0.1)
    ELSE 0 END +
    CASE WHEN deal_stats.total_deals > 0 THEN
      (deal_stats.has_amount * 100 / deal_stats.total_deals * 0.15 +
       deal_stats.has_close_date * 100 / deal_stats.total_deals * 0.05)
    ELSE 0 END
  )::INTEGER;
  
  -- Assign grade
  IF overall_score >= 90 THEN grade := 'Excellent';
  ELSIF overall_score >= 75 THEN grade := 'Good';
  ELSIF overall_score >= 60 THEN grade := 'Fair';
  ELSE grade := 'Needs Improvement';
  END IF;
  
  -- Generate recommendations
  IF contact_stats.total_contacts > 0 AND (contact_stats.has_email * 100 / contact_stats.total_contacts) < 80 THEN
    recommendations := recommendations || jsonb_build_object(
      'priority', 'high',
      'action', 'Collect missing email addresses for contacts',
      'impact', 'Essential for lead scoring and marketing automation'
    );
  END IF;
  
  IF deal_stats.total_deals > 0 AND (deal_stats.has_amount * 100 / deal_stats.total_deals) < 70 THEN
    recommendations := recommendations || jsonb_build_object(
      'priority', 'high',
      'action', 'Qualify deal amounts for accurate forecasting',
      'impact', 'Critical for pipeline analysis and revenue forecasting'
    );
  END IF;
  
  -- Build comprehensive result
  result := jsonb_build_object(
    'overall_score', overall_score,
    'grade', grade,
    'contacts', jsonb_build_object(
      'total_contacts', contact_stats.total_contacts,
      'completion_rates', jsonb_build_object(
        'email', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.has_email * 100 / contact_stats.total_contacts ELSE 0 END,
        'phone', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.has_phone * 100 / contact_stats.total_contacts ELSE 0 END,
        'title', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.has_title * 100 / contact_stats.total_contacts ELSE 0 END,
        'company', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.has_company * 100 / contact_stats.total_contacts ELSE 0 END
      ),
      'quality_indicators', jsonb_build_object(
        'complete_contacts', contact_stats.has_email,
        'completeness_rate', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.has_email * 100 / contact_stats.total_contacts ELSE 0 END,
        'recent_additions', contact_stats.recent_additions,
        'stale_contacts', contact_stats.stale_contacts,
        'stale_percentage', CASE WHEN contact_stats.total_contacts > 0 THEN contact_stats.stale_contacts * 100 / contact_stats.total_contacts ELSE 0 END
      )
    ),
    'deals', jsonb_build_object(
      'total_deals', deal_stats.total_deals,
      'completion_rates', jsonb_build_object(
        'amount', CASE WHEN deal_stats.total_deals > 0 THEN deal_stats.has_amount * 100 / deal_stats.total_deals ELSE 0 END,
        'close_date', CASE WHEN deal_stats.total_deals > 0 THEN deal_stats.has_close_date * 100 / deal_stats.total_deals ELSE 0 END
      ),
      'pipeline_health', jsonb_build_object(
        'avg_deal_size', COALESCE(deal_stats.avg_deal_size, 0),
        'missing_amounts', deal_stats.total_deals - deal_stats.has_amount,
        'missing_close_dates', deal_stats.total_deals - deal_stats.has_close_date,
        'overdue_deals', deal_stats.overdue_deals,
        'win_rate', CASE WHEN deal_stats.total_deals > 0 THEN deal_stats.won_deals * 100 / deal_stats.total_deals ELSE 0 END
      )
    ),
    'accounts', jsonb_build_object(
      'total_accounts', account_stats.total_accounts,
      'completion_rates', jsonb_build_object(
        'industry', CASE WHEN account_stats.total_accounts > 0 THEN account_stats.has_industry * 100 / account_stats.total_accounts ELSE 0 END,
        'website', CASE WHEN account_stats.total_accounts > 0 THEN account_stats.has_website * 100 / account_stats.total_accounts ELSE 0 END
      ),
      'account_intelligence', jsonb_build_object(
        'complete_accounts', account_stats.has_industry,
        'enrichment_opportunity', account_stats.total_accounts - account_stats.has_industry
      )
    ),
    'duplicates', '[]'::jsonb,
    'recommendations', recommendations,
    'analyzed_at', extract(epoch from now())
  );
  
  -- Store result
  INSERT INTO public.data_quality_metrics (organization_id, overall_score, grade, metrics_data, analyzed_at)
  VALUES (p_organization_id, overall_score, grade, result, now());
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."analyze_data_quality_with_recommendations"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_sales_role"("p_member_id" "uuid", "p_approved_role" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org_id UUID;
  v_caller_role TEXT;
BEGIN
  SELECT om.organization_id INTO v_org_id
  FROM organization_members om
  WHERE om.id = p_member_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  SELECT role INTO v_caller_role
  FROM organization_members
  WHERE organization_id = v_org_id AND user_id = auth.uid() AND is_active = true;

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Only org admins can approve roles';
  END IF;

  UPDATE organization_members
  SET
    sales_role = COALESCE(p_approved_role, sales_role),
    sales_role_status = 'approved',
    sales_role_updated_by = auth.uid()
  WHERE id = p_member_id;
END;
$$;


ALTER FUNCTION "public"."approve_sales_role"("p_member_id" "uuid", "p_approved_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_sensitive_operations"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Log sensitive operations to audit table
  INSERT INTO public.audit_log (
    user_id,
    organization_id,
    table_name,
    record_id,
    operation,
    old_values,
    new_values,
    ip_address
  ) VALUES (
    auth.uid(),
    COALESCE(NEW.organization_id, OLD.organization_id),
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    inet_client_addr()
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."audit_sensitive_operations"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."audit_sensitive_operations"() IS 'Logs all sensitive table operations for compliance';



CREATE OR REPLACE FUNCTION "public"."auto_promote_whitelisted_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  whitelist_record RECORD;
BEGIN
  -- Check if the new user's email is in the whitelist
  SELECT * INTO whitelist_record 
  FROM public.admin_email_whitelist 
  WHERE LOWER(email) = LOWER(NEW.email);
  
  IF FOUND THEN
    
    -- Add to platform_admins if whitelisted
    IF whitelist_record.grant_platform_admin THEN
      INSERT INTO public.platform_admins (user_id, role, created_by, is_active)
      VALUES (NEW.id, 'platform_admin', NEW.id, true)
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_promote_whitelisted_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_suggest_forecast_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only auto-set if forecast_category is not explicitly set
  IF NEW.forecast_category IS NULL AND NEW.probability IS NOT NULL THEN
    IF NEW.probability >= 80 THEN
      NEW.forecast_category := 'commit';
    ELSIF NEW.probability >= 50 THEN
      NEW.forecast_category := 'best_case';
    ELSIF NEW.probability >= 20 THEN
      NEW.forecast_category := 'upside';
    ELSE
      NEW.forecast_category := 'pipeline';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_suggest_forecast_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_email_messages_for_contact"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only fire when email is set or changed
  IF NEW.email IS NOT NULL AND (OLD IS NULL OR OLD.email IS DISTINCT FROM NEW.email) THEN
    -- Match unmatched inbound emails FROM this contact
    UPDATE email_messages
    SET contact_id = NEW.id,
        account_id = COALESCE(NEW.account_id, account_id),
        match_status = 'matched',
        match_method = 'backfill',
        updated_at = NOW()
    WHERE match_status = 'unmatched'
      AND organization_id = NEW.organization_id
      AND from_email = LOWER(NEW.email);

    -- Match unmatched outbound emails TO this contact
    UPDATE email_messages
    SET contact_id = NEW.id,
        account_id = COALESCE(NEW.account_id, account_id),
        match_status = 'matched',
        match_method = 'backfill',
        updated_at = NOW()
    WHERE match_status = 'unmatched'
      AND organization_id = NEW.organization_id
      AND LOWER(NEW.email) = ANY(to_emails);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."backfill_email_messages_for_contact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_bant_score"("p_budget_status" "text", "p_authority_level" "text", "p_need_urgency" "text", "p_timeline_status" "text") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
DECLARE
    budget_points INTEGER := 0;
    authority_points INTEGER := 0;
    need_points INTEGER := 0;
    timeline_points INTEGER := 0;
BEGIN
    -- Budget (max 30 points)
    budget_points := CASE p_budget_status
        WHEN 'unknown' THEN 0
        WHEN 'no_budget' THEN 5
        WHEN 'budget_pending' THEN 15
        WHEN 'budget_allocated' THEN 25
        WHEN 'budget_approved' THEN 30
        ELSE 0
    END;
    
    -- Authority (max 25 points)
    authority_points := CASE p_authority_level
        WHEN 'unknown' THEN 0
        WHEN 'influencer' THEN 10
        WHEN 'recommender' THEN 15
        WHEN 'decision_maker' THEN 22
        WHEN 'economic_buyer' THEN 25
        ELSE 0
    END;
    
    -- Need (max 25 points)
    need_points := CASE p_need_urgency
        WHEN 'unknown' THEN 0
        WHEN 'no_pain' THEN 3
        WHEN 'nice_to_have' THEN 10
        WHEN 'important' THEN 18
        WHEN 'critical' THEN 23
        WHEN 'hair_on_fire' THEN 25
        ELSE 0
    END;
    
    -- Timeline (max 20 points)
    timeline_points := CASE p_timeline_status
        WHEN 'unknown' THEN 0
        WHEN 'no_timeline' THEN 3
        WHEN 'next_year' THEN 8
        WHEN 'this_quarter' THEN 14
        WHEN 'this_month' THEN 18
        WHEN 'immediate' THEN 20
        ELSE 0
    END;
    
    RETURN budget_points + authority_points + need_points + timeline_points;
END;
$$;


ALTER FUNCTION "public"."calculate_bant_score"("p_budget_status" "text", "p_authority_level" "text", "p_need_urgency" "text", "p_timeline_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_feature_gap_impact"("p_organization_id" "uuid", "p_feature_name" "text" DEFAULT NULL::"text", "p_days_back" integer DEFAULT 365) RETURNS TABLE("feature_name" "text", "total_opportunity_cost" numeric, "deals_lost" integer, "avg_deal_size" numeric, "dealbreaker_rate" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    dfg.feature_name,
    COALESCE(SUM(dfg.attributed_amount), 0) AS total_opportunity_cost,
    COUNT(DISTINCT dfg.deal_id)::INTEGER AS deals_lost,
    AVG(d.amount) AS avg_deal_size,
    (COUNT(DISTINCT dfg.deal_id) FILTER (WHERE dfg.was_dealbreaker)::DECIMAL /
     NULLIF(COUNT(DISTINCT dfg.deal_id), 0)) AS dealbreaker_rate
  FROM public.deal_feature_gaps dfg
  JOIN public.deals d ON dfg.deal_id = d.id
  WHERE dfg.organization_id = p_organization_id
    AND dfg.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
    AND (p_feature_name IS NULL OR dfg.feature_name = p_feature_name)
  GROUP BY dfg.feature_name
  ORDER BY total_opportunity_cost DESC;
END;
$$;


ALTER FUNCTION "public"."calculate_feature_gap_impact"("p_organization_id" "uuid", "p_feature_name" "text", "p_days_back" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_lead_score"("p_contact_id" "uuid", "p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  contact_record RECORD;
  demographic_score INTEGER := 0;
  behavioral_score INTEGER := 0;
  company_score INTEGER := 0;
  total_score INTEGER := 0;
  score_grade TEXT := 'F';
  industry_boost INTEGER := 0;
  breakdown JSONB;
  activity_count INTEGER := 0;
  recent_activity_count INTEGER := 0;
BEGIN
  -- Get contact details
  SELECT * INTO contact_record 
  FROM public.contacts 
  WHERE id = p_contact_id AND organization_id = p_organization_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;
  
  -- Calculate demographic score (0-40 points)
  IF contact_record.email IS NOT NULL AND contact_record.email != '' THEN
    demographic_score := demographic_score + 10;
  END IF;
  
  IF contact_record.phone IS NOT NULL AND contact_record.phone != '' THEN
    demographic_score := demographic_score + 8;
  END IF;
  
  IF contact_record.title IS NOT NULL AND 
     (contact_record.title ILIKE '%director%' OR 
      contact_record.title ILIKE '%manager%' OR 
      contact_record.title ILIKE '%vp%' OR 
      contact_record.title ILIKE '%president%' OR 
      contact_record.title ILIKE '%ceo%' OR 
      contact_record.title ILIKE '%cto%') THEN
    demographic_score := demographic_score + 15;
  END IF;
  
  IF contact_record.company IS NOT NULL AND contact_record.company != '' THEN
    demographic_score := demographic_score + 7;
  END IF;
  
  -- Calculate behavioral score (0-35 points)
  SELECT COUNT(*) INTO activity_count
  FROM public.activities 
  WHERE contact_id = p_contact_id AND organization_id = p_organization_id;
  
  SELECT COUNT(*) INTO recent_activity_count
  FROM public.activities 
  WHERE contact_id = p_contact_id 
    AND organization_id = p_organization_id 
    AND created_at > now() - interval '30 days';
  
  behavioral_score := LEAST(20, activity_count * 2);
  behavioral_score := behavioral_score + LEAST(15, recent_activity_count * 3);
  
  -- Calculate company score (0-25 points)
  -- Industry scoring (simplified)
  IF contact_record.company IS NOT NULL THEN
    company_score := company_score + 10;
    
    -- High-value industries get bonus points
    IF contact_record.company ILIKE '%technology%' OR 
       contact_record.company ILIKE '%software%' OR 
       contact_record.company ILIKE '%saas%' THEN
      industry_boost := 15;
      company_score := company_score + industry_boost;
    END IF;
  END IF;
  
  -- Calculate total score
  total_score := demographic_score + behavioral_score + company_score;
  
  -- Assign grade
  IF total_score >= 90 THEN score_grade := 'A+';
  ELSIF total_score >= 80 THEN score_grade := 'A';
  ELSIF total_score >= 70 THEN score_grade := 'B+';
  ELSIF total_score >= 60 THEN score_grade := 'B';
  ELSIF total_score >= 50 THEN score_grade := 'C+';
  ELSIF total_score >= 40 THEN score_grade := 'C';
  ELSIF total_score >= 30 THEN score_grade := 'D';
  ELSE score_grade := 'F';
  END IF;
  
  -- Build breakdown
  breakdown := jsonb_build_object(
    'has_email', (contact_record.email IS NOT NULL AND contact_record.email != ''),
    'has_phone', (contact_record.phone IS NOT NULL AND contact_record.phone != ''),
    'decision_maker_title', (contact_record.title IS NOT NULL AND 
      (contact_record.title ILIKE '%director%' OR contact_record.title ILIKE '%manager%' OR 
       contact_record.title ILIKE '%vp%' OR contact_record.title ILIKE '%president%' OR 
       contact_record.title ILIKE '%ceo%' OR contact_record.title ILIKE '%cto%')),
    'high_value_industry', (industry_boost > 0),
    'activity_count', activity_count,
    'recent_engagement', (recent_activity_count > 0)
  );
  
  -- Insert or update lead score
  INSERT INTO public.lead_scores (
    contact_id, organization_id, demographic_score, behavioral_score, 
    company_score, total_score, score_grade, score_breakdown, last_calculated_at
  ) VALUES (
    p_contact_id, p_organization_id, demographic_score, behavioral_score,
    company_score, total_score, score_grade, breakdown, now()
  )
  ON CONFLICT (contact_id, organization_id) 
  DO UPDATE SET
    demographic_score = EXCLUDED.demographic_score,
    behavioral_score = EXCLUDED.behavioral_score,
    company_score = EXCLUDED.company_score,
    total_score = EXCLUDED.total_score,
    score_grade = EXCLUDED.score_grade,
    score_breakdown = EXCLUDED.score_breakdown,
    last_calculated_at = EXCLUDED.last_calculated_at,
    updated_at = now();
  
  RETURN jsonb_build_object(
    'demographic_score', demographic_score,
    'behavioral_score', behavioral_score,
    'company_score', company_score,
    'total_score', total_score,
    'score_grade', score_grade,
    'industry_boost', industry_boost,
    'breakdown', breakdown
  );
END;
$$;


ALTER FUNCTION "public"."calculate_lead_score"("p_contact_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_overall_lead_score"("p_fit_score" integer, "p_intent_score" integer, "p_engagement_score" integer, "p_bant_score" integer) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Weighted average:
    -- Fit: 30%, Intent: 20%, Engagement: 20%, BANT: 30%
    RETURN ROUND(
        (COALESCE(p_fit_score, 0) * 0.30) +
        (COALESCE(p_intent_score, 0) * 0.20) +
        (COALESCE(p_engagement_score, 0) * 0.20) +
        (COALESCE(p_bant_score, 0) * 0.30)
    )::INTEGER;
END;
$$;


ALTER FUNCTION "public"."calculate_overall_lead_score"("p_fit_score" integer, "p_intent_score" integer, "p_engagement_score" integer, "p_bant_score" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_compensation"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role
  FROM public.organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND is_active = true;
  
  RETURN user_role IN ('admin', 'owner', 'manager');
END;
$$;


ALTER FUNCTION "public"."can_manage_compensation"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_quotas"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND organization_id = org_id 
    AND role IN ('admin', 'owner', 'manager')
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."can_manage_quotas"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_deal_outcome_learning_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_industry TEXT;
  v_amount_band TEXT;
  v_segment_key TEXT;
  v_outcome_label TEXT;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Capture only on stage transitions to closed outcomes
  IF NEW.stage NOT IN ('closed_won', 'closed_lost') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.stage, '') = NEW.stage THEN
    RETURN NEW;
  END IF;

  SELECT a.industry
    INTO v_industry
  FROM public.accounts a
  WHERE a.id = NEW.account_id;

  v_amount_band := public.compute_amount_band(NEW.amount);
  v_segment_key := CONCAT('industry:', COALESCE(NULLIF(LOWER(TRIM(v_industry)), ''), 'unknown'), '|amount:', v_amount_band);
  v_outcome_label := CASE WHEN NEW.stage = 'closed_won' THEN 'won' ELSE 'lost' END;

  INSERT INTO public.sales_learning_events (
    organization_id,
    user_id,
    deal_id,
    account_id,
    contact_id,
    event_type,
    event_key,
    segment_key,
    industry,
    amount_band,
    outcome_label,
    metadata,
    occurred_at
  ) VALUES (
    NEW.organization_id,
    NEW.user_id,
    NEW.id,
    NEW.account_id,
    NEW.contact_id,
    'outcome',
    CONCAT('deal_', v_outcome_label),
    v_segment_key,
    v_industry,
    v_amount_band,
    v_outcome_label,
    jsonb_build_object(
      'products_positioned', COALESCE(NEW.products_positioned, ARRAY[]::TEXT[]),
      'close_reason', NEW.close_reason,
      'competitor_name', NEW.competitor_name,
      'forecast_category', NEW.forecast_category,
      'lead_source', NEW.lead_source,
      'key_use_case', NEW.key_use_case
    ),
    NOW()
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."capture_deal_outcome_learning_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_invitation_rate_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  recent_invites INTEGER;
BEGIN
  -- Check if user has sent more than 10 invites in the last hour
  SELECT COUNT(*) INTO recent_invites
  FROM public.organization_invites
  WHERE invited_by = NEW.invited_by
  AND created_at > NOW() - INTERVAL '1 hour';
  
  IF recent_invites >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Too many invitations sent in the last hour';
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_invitation_rate_limit"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."check_invitation_rate_limit"() IS 'Prevents invitation spam by rate limiting';



CREATE OR REPLACE FUNCTION "public"."check_partition_rls_status"() RETURNS TABLE("tablename" "text", "rls_enabled" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
    SELECT 
        pt.tablename::text,
        pc.relrowsecurity as rls_enabled
    FROM pg_tables pt
    JOIN pg_class pc ON pt.tablename = pc.relname AND pc.relnamespace = 'public'::regnamespace
    WHERE pt.schemaname = 'public'
        AND pt.tablename LIKE 'web_events_%'
        AND pt.tablename ~ '^web_events_[0-9]{4}_[0-9]{2}$'
    ORDER BY pt.tablename;
$_$;


ALTER FUNCTION "public"."check_partition_rls_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_security_definer_functions"() RETURNS TABLE("function_name" "text", "security_definer" boolean, "has_search_path" boolean, "status" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT 
        proname::text as function_name,
        prosecdef as security_definer,
        ('search_path=public' = ANY(proconfig)) as has_search_path,
        CASE 
            WHEN NOT prosecdef THEN 'N/A'
            WHEN 'search_path=public' = ANY(proconfig) THEN 'SECURE'
            ELSE 'VULNERABLE'
        END as status
    FROM pg_proc
    WHERE proname IN (
        'cleanup_old_web_events',
        'get_user_role_in_org',
        'get_web_engagement_summary',
        'link_visitor_to_contact',
        'validate_invite_code',
        'create_web_events_partition_if_needed',
        'check_partition_rls_status',
        'check_security_definer_functions'
    )
    ORDER BY proname;
$$;


ALTER FUNCTION "public"."check_security_definer_functions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_signup_rate_limit"("user_email" "text", "org_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_domain TEXT;
  hourly_signups INTEGER;
  daily_signups INTEGER;
  org_daily_limit INTEGER DEFAULT 50;
BEGIN
  user_domain := public.extract_root_domain(user_email);
  
  -- Get organization's daily limit if specified
  IF org_id IS NOT NULL THEN
    SELECT COALESCE(max_auto_approvals_per_day, 50) INTO org_daily_limit
    FROM public.organizations 
    WHERE id = org_id;
  END IF;
  
  -- Check hourly rate limit (max 10 signups per hour per domain)
  SELECT COUNT(*) INTO hourly_signups
  FROM public.signup_decisions
  WHERE domain = user_domain 
    AND created_at >= now() - INTERVAL '1 hour'
    AND decision IN ('auto_approved', 'invitation_used');
  
  IF hourly_signups >= 10 THEN
    RETURN false;
  END IF;
  
  -- Check daily rate limit (fixed variable shadowing bug)
  SELECT COUNT(*) INTO daily_signups
  FROM public.signup_decisions
  WHERE domain = user_domain 
    AND created_at >= now() - INTERVAL '1 day'
    AND decision IN ('auto_approved', 'invitation_used')
    AND (org_id IS NULL OR organization_id = org_id);
  
  IF daily_signups >= org_daily_limit THEN
    RETURN false;
  END IF;
  
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."check_signup_rate_limit"("user_email" "text", "org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_chat_response_cache"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.chat_response_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_chat_response_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_old_web_events"("p_retention_days" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- First aggregate old events into monthly summary
  INSERT INTO web_events_monthly_summary 
    (organization_id, account_id, month, page_category, total_views, unique_visitors, total_time_seconds, avg_scroll_depth)
  SELECT 
    we.organization_id,
    COALESCE(we.account_id, vim.account_id) as account_id,
    DATE_TRUNC('month', we.occurred_at)::date as month,
    we.page_category,
    COUNT(*) as total_views,
    COUNT(DISTINCT we.visitor_id) as unique_visitors,
    COALESCE(SUM(we.time_on_page_seconds), 0) as total_time_seconds,
    ROUND(COALESCE(AVG(we.scroll_depth_percent), 0)) as avg_scroll_depth
  FROM web_events we
  LEFT JOIN visitor_identity_map vim ON we.visitor_id = vim.visitor_id
  WHERE we.occurred_at < NOW() - (p_retention_days || ' days')::INTERVAL
    AND we.is_bot = false
  GROUP BY we.organization_id, COALESCE(we.account_id, vim.account_id), DATE_TRUNC('month', we.occurred_at), we.page_category
  ON CONFLICT (organization_id, account_id, month, page_category) 
  DO UPDATE SET
    total_views = web_events_monthly_summary.total_views + EXCLUDED.total_views,
    unique_visitors = GREATEST(web_events_monthly_summary.unique_visitors, EXCLUDED.unique_visitors),
    total_time_seconds = web_events_monthly_summary.total_time_seconds + EXCLUDED.total_time_seconds,
    updated_at = now();

  DELETE FROM web_events 
  WHERE occurred_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_old_web_events"("p_retention_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_orphaned_organizations"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete organizations that have no active members
  DELETE FROM public.organizations
  WHERE id IN (
    SELECT o.id
    FROM public.organizations o
    WHERE o.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.organization_id = o.id AND om.is_active = true
    )
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_orphaned_organizations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_query_plan_cache"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM query_plan_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_query_plan_cache"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_job_execution"("p_job_id" "uuid", "p_status" "text", "p_results" "jsonb" DEFAULT '{}'::"jsonb", "p_error_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE public.admin_job_executions 
  SET 
    status = p_status,
    completed_at = now(),
    results = p_results,
    error_details = p_error_details,
    progress_percentage = CASE WHEN p_status = 'completed' THEN 100 ELSE progress_percentage END,
    updated_at = now()
  WHERE id = p_job_id;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."complete_job_execution"("p_job_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_amount_band"("p_amount" numeric) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  SELECT CASE
    WHEN p_amount IS NULL THEN 'unknown'
    WHEN p_amount < 10000 THEN 'small'
    WHEN p_amount < 50000 THEN 'mid'
    WHEN p_amount < 200000 THEN 'large'
    ELSE 'enterprise'
  END;
$$;


ALTER FUNCTION "public"."compute_amount_band"("p_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_deal_contact_quadrant"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    NEW.quadrant := compute_quadrant(NEW.support_axis, NEW.influence_axis);
    IF TG_OP = 'UPDATE' THEN
      NEW.updated_at := NOW();
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."compute_deal_contact_quadrant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compute_quadrant"("support" numeric, "influence" numeric) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  IF support IS NULL OR influence IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF support >= 0 AND influence >= 0 THEN
    RETURN 'champion_influential';
  ELSIF support >= 0 AND influence < 0 THEN
    RETURN 'champion_peripheral';
  ELSIF support < 0 AND influence >= 0 THEN
    RETURN 'adversarial_influential';
  ELSE
    RETURN 'adversarial_peripheral';
  END IF;
END;
$$;


ALTER FUNCTION "public"."compute_quadrant"("support" numeric, "influence" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_notification"("p_organization_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_job_id" "uuid" DEFAULT NULL::"uuid", "p_action_label" "text" DEFAULT NULL::"text", "p_action_data" "jsonb" DEFAULT '{}'::"jsonb", "p_is_persistent" boolean DEFAULT false, "p_expires_minutes" integer DEFAULT 60) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO public.admin_notifications (
    organization_id, user_id, job_id, type, title, message,
    action_label, action_data, is_persistent,
    expires_at
  ) VALUES (
    p_organization_id, p_user_id, p_job_id, p_type, p_title, p_message,
    p_action_label, p_action_data, p_is_persistent,
    CASE WHEN p_is_persistent THEN NULL ELSE now() + (p_expires_minutes || ' minutes')::INTERVAL END
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;


ALTER FUNCTION "public"."create_admin_notification"("p_organization_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_job_id" "uuid", "p_action_label" "text", "p_action_data" "jsonb", "p_is_persistent" boolean, "p_expires_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_bulk_invitations"("org_id" "uuid", "email_list" "text"[], "default_role" "text" DEFAULT 'member'::"text", "invited_by_user" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  current_user_id UUID;
  successful_invitations INTEGER := 0;
  failed_invitations INTEGER := 0;
  skipped_invitations INTEGER := 0;
  email_item TEXT;
  user_domain TEXT;
  current_hour_count INTEGER;
  daily_count INTEGER;
  result_details JSONB := '[]'::JSONB;
  error_details JSONB := '[]'::JSONB;
  invitation_record RECORD;
BEGIN
  -- Get current user if not provided
  current_user_id := COALESCE(invited_by_user, auth.uid());
  
  -- Validate inputs
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  IF org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID is required';
  END IF;
  
  IF email_list IS NULL OR array_length(email_list, 1) = 0 THEN
    RAISE EXCEPTION 'Email list cannot be empty';
  END IF;
  
  IF array_length(email_list, 1) > 100 THEN
    RAISE EXCEPTION 'Maximum 100 emails per batch';
  END IF;
  
  -- Validate role
  IF default_role NOT IN ('admin', 'member', 'viewer') THEN
    RAISE EXCEPTION 'Invalid role: must be admin, member, or viewer';
  END IF;
  
  -- Check if user is admin of the organization
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members 
    WHERE organization_id = org_id 
      AND user_id = current_user_id 
      AND role = 'admin' 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only organization admins can send invitations';
  END IF;
  
  -- Check hourly rate limit (50 per hour)
  SELECT COUNT(*) INTO current_hour_count
  FROM public.organization_invitations
  WHERE invited_by = current_user_id
    AND created_at > now() - INTERVAL '1 hour';
  
  IF current_hour_count + array_length(email_list, 1) > 50 THEN
    RAISE EXCEPTION 'Rate limit exceeded: Maximum 50 invitations per hour (current: %, requested: %)', 
      current_hour_count, array_length(email_list, 1);
  END IF;
  
  -- Check daily rate limit (200 per day)
  SELECT COUNT(*) INTO daily_count
  FROM public.organization_invitations
  WHERE invited_by = current_user_id
    AND created_at > now() - INTERVAL '24 hours';
  
  IF daily_count + array_length(email_list, 1) > 200 THEN
    RAISE EXCEPTION 'Daily rate limit exceeded: Maximum 200 invitations per day (current: %, requested: %)', 
      daily_count, array_length(email_list, 1);
  END IF;

  -- Process each email
  FOREACH email_item IN ARRAY email_list
  LOOP
    BEGIN
      -- Clean and validate email
      email_item := lower(trim(email_item));
      
      -- Basic email validation
      IF email_item !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        failed_invitations := failed_invitations + 1;
        error_details := error_details || jsonb_build_object(
          'email', email_item,
          'error', 'Invalid email format'
        );
        CONTINUE;
      END IF;
      
      -- Extract domain for validation
      user_domain := split_part(email_item, '@', 2);
      
      -- Check if email is from a blocked public domain
      IF EXISTS (
        SELECT 1 FROM public.public_email_domains 
        WHERE domain = user_domain
      ) THEN
        failed_invitations := failed_invitations + 1;
        error_details := error_details || jsonb_build_object(
          'email', email_item,
          'error', 'Public email domains not allowed'
        );
        CONTINUE;
      END IF;
      
      -- Check if user is already a member
      IF EXISTS (
        SELECT 1 FROM public.organization_members om
        JOIN auth.users u ON u.id = om.user_id
        WHERE om.organization_id = org_id 
          AND lower(u.email) = email_item
          AND om.is_active = true
      ) THEN
        skipped_invitations := skipped_invitations + 1;
        error_details := error_details || jsonb_build_object(
          'email', email_item,
          'error', 'User is already a member'
        );
        CONTINUE;
      END IF;
      
      -- Check if invitation already exists and is still valid
      SELECT * INTO invitation_record
      FROM public.organization_invitations
      WHERE organization_id = org_id 
        AND email = email_item 
        AND used_at IS NULL
        AND expires_at > now();
      
      IF FOUND THEN
        -- Update existing invitation
        UPDATE public.organization_invitations
        SET 
          role = default_role,
          invited_by = current_user_id,
          expires_at = now() + INTERVAL '7 days',
          created_at = now()
        WHERE id = invitation_record.id;
        
        skipped_invitations := skipped_invitations + 1;
        result_details := result_details || jsonb_build_object(
          'email', email_item,
          'action', 'updated_existing',
          'invitation_id', invitation_record.id
        );
      ELSE
        -- Create new invitation
        INSERT INTO public.organization_invitations (
          organization_id,
          email,
          role,
          invited_by,
          expires_at
        ) VALUES (
          org_id,
          email_item,
          default_role,
          current_user_id,
          now() + INTERVAL '7 days'
        ) RETURNING id INTO invitation_record;
        
        successful_invitations := successful_invitations + 1;
        result_details := result_details || jsonb_build_object(
          'email', email_item,
          'action', 'created',
          'invitation_id', invitation_record.id
        );
      END IF;
      
    EXCEPTION 
      WHEN OTHERS THEN
        failed_invitations := failed_invitations + 1;
        error_details := error_details || jsonb_build_object(
          'email', email_item,
          'error', SQLERRM
        );
        CONTINUE;
    END;
  END LOOP;
  
  -- Update rate limits tracking (if table exists)
  INSERT INTO public.invitation_rate_limits (
    user_id, 
    invitations_sent, 
    last_invitation_at,
    organization_id
  ) VALUES (
    current_user_id, 
    successful_invitations,
    now(),
    org_id
  )
  ON CONFLICT (user_id, organization_id)
  DO UPDATE SET
    invitations_sent = invitation_rate_limits.invitations_sent + EXCLUDED.invitations_sent,
    last_invitation_at = EXCLUDED.last_invitation_at;
  
  RETURN jsonb_build_object(
    'successful', successful_invitations,
    'failed', failed_invitations,
    'skipped', skipped_invitations,
    'total_processed', array_length(email_list, 1),
    'details', result_details,
    'errors', error_details
  );
END;
$_$;


ALTER FUNCTION "public"."create_bulk_invitations"("org_id" "uuid", "email_list" "text"[], "default_role" "text", "invited_by_user" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_default_user_prompt_preferences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_prompt_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_default_user_prompt_preferences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_demo_organization"("org_name" "text" DEFAULT 'RevOps Demo Company'::"text", "org_domain" "text" DEFAULT 'demo.revops.com'::"text", "org_industry" "text" DEFAULT 'Technology'::"text", "org_size" "text" DEFAULT '50-200'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_org_id UUID;
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Create the demo organization
  INSERT INTO public.organizations (name, domain, industry, company_size, created_by, is_demo, demo_metadata)
  VALUES (
    org_name, 
    org_domain, 
    org_industry, 
    org_size, 
    current_user_id,
    true,
    jsonb_build_object(
      'created_for_demo', true,
      'sample_data_version', '1.0',
      'industry_focus', 'saas_b2b',
      'company_stage', 'growth'
    )
  )
  RETURNING id INTO new_org_id;

  -- Add the creator as an admin member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'admin');

  RETURN new_org_id;
END;
$$;


ALTER FUNCTION "public"."create_demo_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_organization"("org_name" "text", "org_domain" "text" DEFAULT NULL::"text", "org_industry" "text" DEFAULT NULL::"text", "org_size" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  new_org_id UUID;
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Create the organization
  INSERT INTO public.organizations (name, domain, industry, company_size, created_by)
  VALUES (org_name, org_domain, org_industry, org_size, current_user_id)
  RETURNING id INTO new_org_id;

  -- Add the creator as an admin member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (new_org_id, current_user_id, 'admin');

  RETURN new_org_id;
END;
$$;


ALTER FUNCTION "public"."create_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_web_events_partition_if_needed"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  partition_date DATE;
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
BEGIN
  -- Create partition for next month if it doesn't exist
  partition_date := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
  partition_name := 'web_events_' || TO_CHAR(partition_date, 'YYYY_MM');
  start_date := partition_date;
  end_date := partition_date + INTERVAL '1 month';

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE tablename = partition_name
  ) THEN
    -- Create the partition
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF web_events FOR VALUES FROM (%L) TO (%L)',
      partition_name, start_date, end_date
    );

    -- CRITICAL: Enable RLS on the new partition
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', partition_name);

    RAISE NOTICE 'Created partition % with RLS enabled', partition_name;
  END IF;
END;
$$;


ALTER FUNCTION "public"."create_web_events_partition_if_needed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."deactivate_prompt_section"("p_section_type" "text", "p_reason" "text" DEFAULT 'replaced_by_new_version'::"text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  update_count INTEGER;
BEGIN
  UPDATE public.system_prompt_config 
  SET is_active = false, 
      updated_at = now(),
      deactivated_by = auth.uid(),
      deactivation_reason = p_reason
  WHERE is_active = true 
    AND (p_section_type IS NULL OR section_type = p_section_type);
  
  GET DIAGNOSTICS update_count = ROW_COUNT;
  
  IF update_count > 1 AND p_section_type IS NOT NULL THEN
    RAISE WARNING 'Deactivated % active prompts for section %, expected 0-1', update_count, p_section_type;
  END IF;
  
  RETURN update_count;
END;
$$;


ALTER FUNCTION "public"."deactivate_prompt_section"("p_section_type" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."encrypt_sensitive_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Hash email for search while keeping original for display (if needed)
  IF NEW.email IS NOT NULL AND TG_TABLE_NAME = 'profiles' THEN
    -- Add email hash for faster searches
    NEW.email := LOWER(TRIM(NEW.email));
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."encrypt_sensitive_data"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."encrypt_sensitive_data"() IS 'Handles encryption and normalization of sensitive data';



CREATE OR REPLACE FUNCTION "public"."execute_analytics_query"("p_entity" "text", "p_metrics" "text"[], "p_metric_field" "text" DEFAULT 'amount'::"text", "p_group_by" "text" DEFAULT NULL::"text", "p_time_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_time_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_time_field" "text" DEFAULT 'created_at'::"text", "p_calculation" "text" DEFAULT 'raw'::"text", "p_limit" integer DEFAULT 100, "p_order_by" "text" DEFAULT 'desc'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  result JSONB;
  base_query TEXT;
  select_clause TEXT;
  group_clause TEXT;
  where_clause TEXT;
  order_clause TEXT;
  time_grouping TEXT;
  user_org_ids UUID[];
  is_time_group BOOLEAN;
BEGIN
  -- Get user's organization IDs for RLS
  user_org_ids := public.get_user_organization_ids();
  
  IF array_length(user_org_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('error', 'No organization access', 'data', '[]'::jsonb);
  END IF;

  -- =====================================================
  -- WHITELIST VALIDATION (Critical Security Layer)
  -- =====================================================
  
  -- Validate entity
  IF p_entity NOT IN ('deals', 'contacts', 'accounts', 'activities', 'tasks') THEN
    RETURN jsonb_build_object('error', 'Invalid entity: ' || p_entity, 'data', '[]'::jsonb);
  END IF;
  
  -- Validate time_field per entity
  IF p_time_field IS NOT NULL THEN
    CASE p_entity
      WHEN 'deals' THEN
        IF p_time_field NOT IN ('created_at', 'updated_at', 'close_date') THEN
          RETURN jsonb_build_object('error', 'Invalid time field for deals', 'data', '[]'::jsonb);
        END IF;
      WHEN 'contacts' THEN
        IF p_time_field NOT IN ('created_at', 'updated_at') THEN
          RETURN jsonb_build_object('error', 'Invalid time field for contacts', 'data', '[]'::jsonb);
        END IF;
      WHEN 'accounts' THEN
        IF p_time_field NOT IN ('created_at', 'updated_at') THEN
          RETURN jsonb_build_object('error', 'Invalid time field for accounts', 'data', '[]'::jsonb);
        END IF;
      WHEN 'activities' THEN
        IF p_time_field NOT IN ('created_at', 'activity_date') THEN
          RETURN jsonb_build_object('error', 'Invalid time field for activities', 'data', '[]'::jsonb);
        END IF;
      WHEN 'tasks' THEN
        IF p_time_field NOT IN ('created_at', 'due_date') THEN
          RETURN jsonb_build_object('error', 'Invalid time field for tasks', 'data', '[]'::jsonb);
        END IF;
    END CASE;
  END IF;
  
  -- Validate metric_field per entity
  IF p_metric_field IS NOT NULL AND p_entity = 'deals' THEN
    IF p_metric_field NOT IN ('amount', 'probability') THEN
      RETURN jsonb_build_object('error', 'Invalid metric field for deals', 'data', '[]'::jsonb);
    END IF;
  END IF;
  
  -- Validate group_by per entity
  IF p_group_by IS NOT NULL THEN
    is_time_group := p_group_by IN ('day', 'week', 'month', 'quarter', 'year');
    
    IF NOT is_time_group THEN
      CASE p_entity
        WHEN 'deals' THEN
          IF p_group_by NOT IN ('stage', 'assigned_to') THEN
            RETURN jsonb_build_object('error', 'Invalid group_by for deals', 'data', '[]'::jsonb);
          END IF;
        WHEN 'contacts' THEN
          IF p_group_by NOT IN ('status', 'company', 'assigned_to') THEN
            RETURN jsonb_build_object('error', 'Invalid group_by for contacts', 'data', '[]'::jsonb);
          END IF;
        WHEN 'accounts' THEN
          IF p_group_by NOT IN ('industry', 'assigned_to') THEN
            RETURN jsonb_build_object('error', 'Invalid group_by for accounts', 'data', '[]'::jsonb);
          END IF;
        WHEN 'activities' THEN
          IF p_group_by NOT IN ('type', 'completed') THEN
            RETURN jsonb_build_object('error', 'Invalid group_by for activities', 'data', '[]'::jsonb);
          END IF;
        WHEN 'tasks' THEN
          IF p_group_by NOT IN ('priority', 'completed', 'assigned_to') THEN
            RETURN jsonb_build_object('error', 'Invalid group_by for tasks', 'data', '[]'::jsonb);
          END IF;
      END CASE;
    END IF;
  END IF;
  
  -- Validate calculation type
  IF p_calculation NOT IN ('raw', 'growth_rate', 'cumulative', 'percentage') THEN
    RETURN jsonb_build_object('error', 'Invalid calculation type', 'data', '[]'::jsonb);
  END IF;
  
  -- Validate order_by
  IF p_order_by NOT IN ('asc', 'desc') THEN
    p_order_by := 'desc';
  END IF;
  
  -- Limit cap for safety
  IF p_limit > 1000 THEN
    p_limit := 1000;
  END IF;

  -- =====================================================
  -- BUILD QUERY COMPONENTS
  -- =====================================================
  
  -- Build time grouping expression if needed
  is_time_group := p_group_by IN ('day', 'week', 'month', 'quarter', 'year');
  
  IF is_time_group THEN
    time_grouping := CASE p_group_by
      WHEN 'day' THEN 'date_trunc(''day'', ' || quote_ident(p_time_field) || ')'
      WHEN 'week' THEN 'date_trunc(''week'', ' || quote_ident(p_time_field) || ')'
      WHEN 'month' THEN 'date_trunc(''month'', ' || quote_ident(p_time_field) || ')'
      WHEN 'quarter' THEN 'date_trunc(''quarter'', ' || quote_ident(p_time_field) || ')'
      WHEN 'year' THEN 'date_trunc(''year'', ' || quote_ident(p_time_field) || ')'
    END;
  END IF;
  
  -- Build SELECT clause based on metrics
  select_clause := '';
  FOR i IN 1..array_length(p_metrics, 1) LOOP
    IF i > 1 THEN
      select_clause := select_clause || ', ';
    END IF;
    
    CASE p_metrics[i]
      WHEN 'count' THEN
        select_clause := select_clause || 'COUNT(*)::numeric as value';
      WHEN 'sum' THEN
        IF p_entity = 'deals' AND p_metric_field = 'amount' THEN
          select_clause := select_clause || 'COALESCE(SUM(amount), 0)::numeric as value';
        ELSIF p_entity = 'deals' AND p_metric_field = 'probability' THEN
          select_clause := select_clause || 'COALESCE(SUM(probability), 0)::numeric as value';
        ELSE
          select_clause := select_clause || 'COUNT(*)::numeric as value';
        END IF;
      WHEN 'avg' THEN
        IF p_entity = 'deals' AND p_metric_field = 'amount' THEN
          select_clause := select_clause || 'COALESCE(AVG(amount), 0)::numeric as value';
        ELSIF p_entity = 'deals' AND p_metric_field = 'probability' THEN
          select_clause := select_clause || 'COALESCE(AVG(probability), 0)::numeric as value';
        ELSE
          select_clause := select_clause || 'COUNT(*)::numeric as value';
        END IF;
      WHEN 'min' THEN
        IF p_entity = 'deals' AND p_metric_field = 'amount' THEN
          select_clause := select_clause || 'COALESCE(MIN(amount), 0)::numeric as value';
        ELSE
          select_clause := select_clause || 'COUNT(*)::numeric as value';
        END IF;
      WHEN 'max' THEN
        IF p_entity = 'deals' AND p_metric_field = 'amount' THEN
          select_clause := select_clause || 'COALESCE(MAX(amount), 0)::numeric as value';
        ELSE
          select_clause := select_clause || 'COUNT(*)::numeric as value';
        END IF;
      ELSE
        select_clause := select_clause || 'COUNT(*)::numeric as value';
    END CASE;
  END LOOP;
  
  -- Add label column based on grouping
  IF p_group_by IS NOT NULL THEN
    IF is_time_group THEN
      select_clause := time_grouping || '::text as label, ' || select_clause;
      group_clause := ' GROUP BY ' || time_grouping;
      order_clause := ' ORDER BY ' || time_grouping || ' ' || p_order_by;
    ELSE
      select_clause := 'COALESCE(' || quote_ident(p_group_by) || '::text, ''Unknown'') as label, ' || select_clause;
      group_clause := ' GROUP BY ' || quote_ident(p_group_by);
      order_clause := ' ORDER BY value ' || p_order_by;
    END IF;
  ELSE
    select_clause := '''Total'' as label, ' || select_clause;
    group_clause := '';
    order_clause := '';
  END IF;
  
  -- Build WHERE clause
  where_clause := ' WHERE organization_id = ANY($1)';
  
  IF p_time_start IS NOT NULL THEN
    where_clause := where_clause || ' AND ' || quote_ident(p_time_field) || ' >= $2';
  END IF;
  
  IF p_time_end IS NOT NULL THEN
    where_clause := where_clause || ' AND ' || quote_ident(p_time_field) || ' <= $3';
  END IF;
  
  -- Build full query
  base_query := 'SELECT ' || select_clause || 
                ' FROM public.' || quote_ident(p_entity) || 
                where_clause || 
                group_clause || 
                order_clause || 
                ' LIMIT $4';

  -- =====================================================
  -- EXECUTE QUERY
  -- =====================================================
  
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || base_query || ') t'
  INTO result
  USING user_org_ids, p_time_start, p_time_end, p_limit;
  
  -- =====================================================
  -- APPLY CALCULATIONS (if needed)
  -- =====================================================
  
  IF p_calculation = 'cumulative' AND jsonb_array_length(result) > 0 THEN
    -- Calculate running total
    WITH data AS (
      SELECT 
        (elem->>'label') as label,
        (elem->>'value')::numeric as value,
        ordinality
      FROM jsonb_array_elements(result) WITH ORDINALITY AS elem
    ),
    cumulative AS (
      SELECT 
        label,
        SUM(value) OVER (ORDER BY ordinality) as value
      FROM data
    )
    SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb)
    INTO result
    FROM cumulative c;
  END IF;
  
  IF p_calculation = 'percentage' AND jsonb_array_length(result) > 0 THEN
    -- Calculate percentage of total
    WITH data AS (
      SELECT 
        (elem->>'label') as label,
        (elem->>'value')::numeric as value
      FROM jsonb_array_elements(result) AS elem
    ),
    total AS (
      SELECT SUM(value) as total_value FROM data
    ),
    pct AS (
      SELECT 
        d.label,
        CASE WHEN t.total_value > 0 
          THEN ROUND((d.value / t.total_value) * 100, 2)
          ELSE 0 
        END as value
      FROM data d, total t
    )
    SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
    INTO result
    FROM pct p;
  END IF;
  
  IF p_calculation = 'growth_rate' AND jsonb_array_length(result) > 1 THEN
    -- Calculate period-over-period growth rate
    WITH data AS (
      SELECT 
        (elem->>'label') as label,
        (elem->>'value')::numeric as value,
        ordinality
      FROM jsonb_array_elements(result) WITH ORDINALITY AS elem
    ),
    growth AS (
      SELECT 
        label,
        CASE 
          WHEN LAG(value) OVER (ORDER BY ordinality) IS NULL THEN 0
          WHEN LAG(value) OVER (ORDER BY ordinality) = 0 THEN 0
          ELSE ROUND(((value - LAG(value) OVER (ORDER BY ordinality)) / LAG(value) OVER (ORDER BY ordinality)) * 100, 2)
        END as value
      FROM data
    )
    SELECT COALESCE(jsonb_agg(row_to_json(g)), '[]'::jsonb)
    INTO result
    FROM growth g;
  END IF;
  
  RETURN jsonb_build_object(
    'data', result,
    'rowCount', jsonb_array_length(result),
    'query', jsonb_build_object(
      'entity', p_entity,
      'metrics', p_metrics,
      'groupBy', p_group_by,
      'calculation', p_calculation
    )
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'data', '[]'::jsonb
    );
END;
$_$;


ALTER FUNCTION "public"."execute_analytics_query"("p_entity" "text", "p_metrics" "text"[], "p_metric_field" "text", "p_group_by" "text", "p_time_start" timestamp with time zone, "p_time_end" timestamp with time zone, "p_time_field" "text", "p_calculation" "text", "p_limit" integer, "p_order_by" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_domain_from_website"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF NEW.website IS NOT NULL AND NEW.domain IS NULL THEN
    -- Extract domain from website URL
    NEW.domain := regexp_replace(
      regexp_replace(NEW.website, '^https?://(www\.)?', ''),
      '/.*$', ''
    );
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."extract_domain_from_website"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_root_domain"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  domain_part TEXT;
  domain_parts TEXT[];
BEGIN
  -- Extract domain from email
  domain_part := split_part(email, '@', 2);
  
  -- Handle subdomains by extracting the root domain
  domain_parts := string_to_array(domain_part, '.');
  
  -- For domains like mail.company.com, return company.com
  -- For company.com, return company.com
  IF array_length(domain_parts, 1) >= 2 THEN
    RETURN domain_parts[array_length(domain_parts, 1) - 1] || '.' || domain_parts[array_length(domain_parts, 1)];
  ELSE
    RETURN domain_part;
  END IF;
END;
$$;


ALTER FUNCTION "public"."extract_root_domain"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_organization_by_domain_secure"("user_email" "text") RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "suggested_role" "text", "auto_approve" boolean, "requires_verification" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_domain TEXT;
BEGIN
  user_domain := public.extract_root_domain(user_email);
  
  -- Check if it's a public domain
  IF EXISTS (SELECT 1 FROM public.public_email_domains WHERE domain = user_domain) THEN
    RETURN;
  END IF;
  
  -- Find matching organization
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    public.infer_user_role(user_email),
    CASE 
      WHEN o.auto_approve_domains = true 
        AND NOT COALESCE(o.signup_locked, false)
        AND public.check_signup_rate_limit(user_email, o.id) THEN true
      ELSE false
    END,
    COALESCE(o.require_admin_approval, true)
  FROM public.organizations o
  WHERE o.is_active = true 
    AND (
      o.domain = user_domain 
      OR user_domain = ANY(o.allowed_domains)
      OR user_domain = ANY(o.domain_aliases)
    )
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."find_organization_by_domain_secure"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzzy_search_accounts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision DEFAULT 0.3) RETURNS TABLE("id" "uuid", "name" "text", "industry" "text", "website" "text", "similarity_score" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    a.id,
    a.name,
    a.industry,
    a.website,
    similarity(LOWER(a.name), LOWER(search_query)) as similarity_score
  FROM accounts a
  WHERE a.organization_id = org_id
    AND similarity(LOWER(a.name), LOWER(search_query)) > min_similarity
  ORDER BY similarity_score DESC
  LIMIT 5;
$$;


ALTER FUNCTION "public"."fuzzy_search_accounts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzzy_search_contacts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision DEFAULT 0.3) RETURNS TABLE("id" "uuid", "full_name" "text", "email" "text", "company" "text", "similarity_score" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    c.id,
    c.full_name,
    c.email,
    c.company,
    similarity(LOWER(COALESCE(c.full_name, '')), LOWER(search_query)) as similarity_score
  FROM contacts c
  WHERE c.organization_id = org_id
    AND similarity(LOWER(COALESCE(c.full_name, '')), LOWER(search_query)) > min_similarity
  ORDER BY similarity_score DESC
  LIMIT 5;
$$;


ALTER FUNCTION "public"."fuzzy_search_contacts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fuzzy_search_deals"("search_query" "text", "org_id" "uuid", "min_similarity" double precision DEFAULT 0.3) RETURNS TABLE("id" "uuid", "name" "text", "amount" numeric, "stage" "text", "probability" integer, "close_date" "date", "similarity_score" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    d.id,
    d.name,
    d.amount,
    d.stage,
    d.probability,
    d.close_date::DATE,
    similarity(LOWER(d.name), LOWER(search_query)) as similarity_score
  FROM deals d
  WHERE d.organization_id = org_id
    AND similarity(LOWER(d.name), LOWER(search_query)) > min_similarity
  ORDER BY similarity_score DESC
  LIMIT 5;
$$;


ALTER FUNCTION "public"."fuzzy_search_deals"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_entity_reference"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  ref_text TEXT;
  org_id UUID;
BEGIN
  -- Get organization_id from the record
  org_id := NEW.organization_id;
  
  -- Generate reference based on table and record
  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      ref_text := 'contact ' || NEW.contact_number;
      -- Also create name-based references if available
      IF NEW.first_name IS NOT NULL AND NEW.last_name IS NOT NULL THEN
        INSERT INTO public.entity_references (organization_id, reference_text, entity_type, entity_id, reference_type)
        VALUES (org_id, NEW.first_name || ' ' || NEW.last_name, 'contacts', NEW.id, 'name');
      END IF;
      
    WHEN 'accounts' THEN
      ref_text := 'account ' || NEW.account_number;
      IF NEW.name IS NOT NULL THEN
        INSERT INTO public.entity_references (organization_id, reference_text, entity_type, entity_id, reference_type)
        VALUES (org_id, NEW.name, 'accounts', NEW.id, 'name');
      END IF;
      
    WHEN 'deals' THEN
      ref_text := 'deal ' || NEW.deal_number;
      IF NEW.name IS NOT NULL THEN
        INSERT INTO public.entity_references (organization_id, reference_text, entity_type, entity_id, reference_type)
        VALUES (org_id, NEW.name, 'deals', NEW.id, 'name');
      END IF;
      
    WHEN 'tasks' THEN
      ref_text := 'task ' || NEW.task_number;
      
    WHEN 'activities' THEN  
      ref_text := 'activity ' || NEW.activity_number;
      
    ELSE
      RETURN NEW;
  END CASE;
  
  -- Insert the numbered reference
  INSERT INTO public.entity_references (organization_id, reference_text, entity_type, entity_id, reference_type)
  VALUES (org_id, ref_text, TG_TABLE_NAME, NEW.id, 'number')
  ON CONFLICT DO NOTHING;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."generate_entity_reference"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_invite_code"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  code text;
  collision_count int := 0;
BEGIN
  LOOP
    -- Generate 32-character URL-safe code from 24 random bytes
    code := encode(gen_random_bytes(24), 'base64');
    code := replace(replace(replace(code, '+', '-'), '/', '_'), '=', '');
    
    -- Check for collision
    IF NOT EXISTS (SELECT 1 FROM public.organization_invites WHERE invite_code = code) THEN
      EXIT;
    END IF;
    
    collision_count := collision_count + 1;
    IF collision_count > 10 THEN
      RAISE EXCEPTION 'Unable to generate unique invite code after 10 attempts';
    END IF;
  END LOOP;
  
  RETURN code;
END;
$$;


ALTER FUNCTION "public"."generate_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_deal_summary"("p_account_id" "uuid", "p_organization_id" "uuid") RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSON;
BEGIN
  -- Security check
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  SELECT json_build_object(
    'total_deals', COUNT(*),
    'total_value', COALESCE(SUM(amount), 0),
    'won_deals', COUNT(*) FILTER (WHERE stage ILIKE '%won%'),
    'won_value', COALESCE(SUM(amount) FILTER (WHERE stage ILIKE '%won%'), 0),
    'lost_deals', COUNT(*) FILTER (WHERE stage ILIKE '%lost%'),
    'active_deals', COUNT(*) FILTER (WHERE stage NOT ILIKE '%won%' AND stage NOT ILIKE '%lost%' AND stage NOT ILIKE '%closed%'),
    'active_value', COALESCE(SUM(amount) FILTER (WHERE stage NOT ILIKE '%won%' AND stage NOT ILIKE '%lost%' AND stage NOT ILIKE '%closed%'), 0),
    'avg_deal_size', COALESCE(AVG(amount), 0),
    'win_rate', CASE 
      WHEN COUNT(*) FILTER (WHERE stage ILIKE '%won%' OR stage ILIKE '%lost%') > 0 
      THEN ROUND(
        (COUNT(*) FILTER (WHERE stage ILIKE '%won%')::numeric / 
         COUNT(*) FILTER (WHERE stage ILIKE '%won%' OR stage ILIKE '%lost%')::numeric) * 100, 
        1
      )
      ELSE 0
    END,
    'first_deal_date', MIN(created_at),
    'last_deal_date', MAX(created_at)
  ) INTO result
  FROM deals
  WHERE account_id = p_account_id
    AND organization_id = p_organization_id;

  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_account_deal_summary"("p_account_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_account_opportunity_history"("p_account_id" "uuid", "p_organization_id" "uuid") RETURNS TABLE("deal_id" "uuid", "deal_name" "text", "amount" numeric, "stage" "text", "outcome" "text", "close_date" timestamp with time zone, "created_at" timestamp with time zone, "days_in_pipeline" integer, "key_use_case" "text", "products_positioned" "text"[])
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Security check: Verify user has access to this organization
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_organization_id
    AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied to organization';
  END IF;

  RETURN QUERY
  SELECT 
    d.id AS deal_id,
    d.name AS deal_name,
    d.amount,
    d.stage,
    CASE 
      WHEN d.stage ILIKE '%won%' THEN 'won'
      WHEN d.stage ILIKE '%lost%' THEN 'lost'
      WHEN d.stage ILIKE '%closed%' AND d.stage NOT ILIKE '%won%' THEN 'lost'
      ELSE 'active'
    END AS outcome,
    d.close_date::timestamptz,
    d.created_at::timestamptz,
    EXTRACT(DAY FROM (COALESCE(d.close_date::timestamptz, NOW()) - d.created_at))::integer AS days_in_pipeline,
    d.key_use_case,
    d.products_positioned
  FROM deals d
  WHERE d.account_id = p_account_id
    AND d.organization_id = p_organization_id
  ORDER BY d.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_account_opportunity_history"("p_account_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_organization_overview"() RETURNS TABLE("id" "uuid", "name" "text", "domain" "text", "industry" "text", "company_size" "text", "created_at" timestamp with time zone, "is_demo" boolean, "member_count" bigint, "admin_count" bigint, "is_orphaned" boolean, "last_activity" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.name,
    o.domain,
    o.industry,
    o.company_size,
    o.created_at,
    COALESCE(o.is_demo, false) as is_demo,
    COALESCE(member_stats.member_count, 0) as member_count,
    COALESCE(member_stats.admin_count, 0) as admin_count,
    COALESCE(member_stats.member_count, 0) = 0 as is_orphaned,
    member_stats.last_activity
  FROM public.organizations o
  LEFT JOIN (
    SELECT 
      organization_id,
      COUNT(*) as member_count,
      COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
      MAX(updated_at) as last_activity
    FROM public.organization_members
    WHERE is_active = true
    GROUP BY organization_id
  ) member_stats ON o.id = member_stats.organization_id
  ORDER BY o.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_admin_organization_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_analytics_data_secure"("p_organization_id" "uuid", "p_data_type" "text" DEFAULT 'revenue'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  result jsonb;
  user_org_ids uuid[];
BEGIN
  -- Verify user has access to this organization
  user_org_ids := get_user_organization_ids();
  
  IF NOT (p_organization_id = ANY(user_org_ids)) THEN
    RAISE EXCEPTION 'Access denied to organization data';
  END IF;
  
  -- Return aggregated data based on type instead of raw materialized view access
  CASE p_data_type
    WHEN 'revenue' THEN
      SELECT jsonb_build_object(
        'total_revenue', COALESCE(SUM(amount), 0),
        'deal_count', COUNT(*),
        'avg_deal_size', COALESCE(AVG(amount), 0)
      ) INTO result
      FROM public.deals 
      WHERE organization_id = p_organization_id 
      AND stage = 'won';
      
    WHEN 'pipeline' THEN
      SELECT jsonb_build_object(
        'pipeline_value', COALESCE(SUM(amount), 0),
        'deal_count', COUNT(*),
        'stages', jsonb_agg(DISTINCT stage)
      ) INTO result
      FROM public.deals 
      WHERE organization_id = p_organization_id 
      AND stage NOT IN ('won', 'lost');
      
    ELSE
      result := jsonb_build_object('error', 'Invalid data type');
  END CASE;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_analytics_data_secure"("p_organization_id" "uuid", "p_data_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify contact exists and belongs to the organization
  IF NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE id = p_contact_id
      AND organization_id = p_organization_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Build the full context document
  WITH

  -- Core contact fields
  contact_data AS (
    SELECT jsonb_build_object(
      'id',                       c.id,
      'name',                     COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
      'email',                    c.email,
      'phone',                    c.phone,
      'company',                  c.company,
      'position',                 c.position,
      'lead_source',              c.lead_source,
      'nurture_stage',            c.nurture_stage,
      'qualification_stage',      c.qualification_stage,
      'communication_preference', c.communication_preference,
      'linkedin_url',             c.linkedin_url,
      'fit_score',                c.fit_score,
      'intent_score',             c.intent_score,
      'engagement_score',         c.engagement_score,
      'created_at',               c.created_at,
      'updated_at',               c.updated_at
    ) AS data,
    c.account_id
    FROM contacts c
    WHERE c.id = p_contact_id
      AND c.organization_id = p_organization_id
  ),

  -- Lead score
  lead_score_data AS (
    SELECT jsonb_build_object(
      'total_score',        ls.total_score,
      'score_grade',        ls.score_grade,
      'last_calculated_at', ls.last_calculated_at
    ) AS data
    FROM lead_scores ls
    WHERE ls.contact_id = p_contact_id
      AND ls.organization_id = p_organization_id
    ORDER BY ls.last_calculated_at DESC NULLS LAST
    LIMIT 1
  ),

  -- Associated account
  account_data AS (
    SELECT jsonb_build_object(
      'id',       a.id,
      'name',     a.name,
      'industry', a.industry,
      'website',  a.website
    ) AS data
    FROM accounts a
    JOIN contact_data cd ON cd.account_id = a.id
  ),

  -- Active deals (not closed)
  active_deals_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',           d.id,
        'name',         d.name,
        'stage',        d.stage,
        'amount',       d.amount,
        'role_in_deal', dc.role_in_deal,
        'quadrant',     dc.quadrant
      )
    ), '[]'::jsonb) AS data
    FROM (
      SELECT dc2.deal_id, dc2.role_in_deal, dc2.quadrant
      FROM deal_contacts dc2
      WHERE dc2.contact_id = p_contact_id
        AND dc2.organization_id = p_organization_id
      LIMIT 10
    ) dc
    JOIN deals d ON d.id = dc.deal_id
    WHERE d.stage NOT IN ('closed-won', 'closed-lost', 'closed_won', 'closed_lost')
  ),

  -- Recent activities
  recent_activities_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',           a.id,
        'title',        a.title,
        'type',         a.type,
        'scheduled_at', a.scheduled_at,
        'completed',    a.completed
      ) ORDER BY COALESCE(a.scheduled_at, a.created_at) DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT a2.*
      FROM activities a2
      WHERE a2.contact_id = p_contact_id
        AND a2.organization_id = p_organization_id
      ORDER BY COALESCE(a2.scheduled_at, a2.created_at) DESC
      LIMIT 10
    ) a
  ),

  -- Open tasks
  open_tasks_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',       t.id,
        'title',    t.title,
        'priority', t.priority,
        'due_date', t.due_date
      ) ORDER BY t.due_date ASC NULLS LAST
    ), '[]'::jsonb) AS data
    FROM (
      SELECT t2.*
      FROM tasks t2
      WHERE t2.contact_id = p_contact_id
        AND t2.organization_id = p_organization_id
        AND t2.completed = false
      ORDER BY t2.due_date ASC NULLS LAST
      LIMIT 10
    ) t
  ),

  -- Campaigns the contact is enrolled in
  campaigns_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',          camp.id,
        'name',        camp.name,
        'status',      camp.status,
        'enrolled_at', cc.enrolled_at
      )
    ), '[]'::jsonb) AS data
    FROM (
      SELECT cc2.campaign_id, cc2.enrolled_at
      FROM campaign_contacts cc2
      WHERE cc2.contact_id = p_contact_id
        AND cc2.organization_id = p_organization_id
      ORDER BY cc2.enrolled_at DESC
      LIMIT 5
    ) cc
    JOIN campaigns camp ON camp.id = cc.campaign_id
  ),

  -- Web engagement aggregated from web_events via visitor_identity_map
  web_engagement_data AS (
    SELECT jsonb_build_object(
      'total_visits', COALESCE(agg.total_visits, 0),
      'last_visit',   agg.last_visit,
      'top_pages',    COALESCE(agg.top_pages, '[]'::jsonb)
    ) AS data
    FROM (
      SELECT
        COUNT(*)::int                          AS total_visits,
        MAX(we.occurred_at)                    AS last_visit,
        (
          SELECT COALESCE(jsonb_agg(tp.page_url), '[]'::jsonb)
          FROM (
            SELECT we2.page_url
            FROM web_events we2
            JOIN visitor_identity_map vim2
              ON vim2.visitor_id = we2.visitor_id
              AND vim2.organization_id = we2.organization_id
            WHERE vim2.contact_id = p_contact_id
              AND vim2.organization_id = p_organization_id
            GROUP BY we2.page_url
            ORDER BY COUNT(*) DESC
            LIMIT 3
          ) tp
        ) AS top_pages
      FROM web_events we
      JOIN visitor_identity_map vim
        ON vim.visitor_id = we.visitor_id
        AND vim.organization_id = we.organization_id
      WHERE vim.contact_id = p_contact_id
        AND vim.organization_id = p_organization_id
    ) agg
  )

  SELECT jsonb_build_object(
    'contact',            cd.data,
    'lead_score',         COALESCE(lsd.data, NULL),
    'account',            COALESCE(ad.data, NULL),
    'active_deals',       add_data.data,
    'recent_activities',  rad.data,
    'open_tasks',         otd.data,
    'campaigns',          campd.data,
    'web_engagement',     COALESCE(wed.data, jsonb_build_object('total_visits', 0, 'last_visit', NULL, 'top_pages', '[]'::jsonb)),
    '_meta', jsonb_build_object(
      'source_tables', ARRAY['contacts','lead_scores','accounts','deal_contacts',
                             'deals','activities','tasks','campaign_contacts',
                             'campaigns','web_events','visitor_identity_map'],
      'queried_at',    NOW()
    )
  ) INTO v_result
  FROM contact_data cd
  LEFT JOIN lead_score_data lsd ON true
  LEFT JOIN account_data ad ON true
  CROSS JOIN active_deals_data add_data
  CROSS JOIN recent_activities_data rad
  CROSS JOIN open_tasks_data otd
  CROSS JOIN campaigns_data campd
  LEFT JOIN web_engagement_data wed ON true;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") IS 'Returns a comprehensive JSONB document with all contact context needed by an LLM assistant. Includes contact details, lead score, account, deals, activities, tasks, campaigns, and web engagement.';



CREATE OR REPLACE FUNCTION "public"."get_current_user_role"() RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_current_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Verify deal exists and belongs to the organization
  IF NOT EXISTS (
    SELECT 1 FROM deals
    WHERE id = p_deal_id
      AND organization_id = p_organization_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Build the full context document
  WITH

  -- Core deal fields
  deal_data AS (
    SELECT jsonb_build_object(
      'id',                  d.id,
      'name',                d.name,
      'amount',              d.amount,
      'stage',               d.stage,
      'probability',         d.probability,
      'close_date',          d.close_date,
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
    FROM deals d
    WHERE d.id = p_deal_id
      AND d.organization_id = p_organization_id
  ),

  -- Associated account
  account_data AS (
    SELECT jsonb_build_object(
      'id',          a.id,
      'name',        a.name,
      'industry',    a.industry,
      'website',     a.website,
      'description', a.description
    ) AS data
    FROM accounts a
    JOIN deal_data dd ON dd.account_id = a.id
  ),

  -- Primary contact
  primary_contact_data AS (
    SELECT jsonb_build_object(
      'id',       c.id,
      'name',     COALESCE(c.full_name, TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))),
      'email',    c.email,
      'phone',    c.phone,
      'position', c.position,
      'company',  c.company
    ) AS data
    FROM contacts c
    JOIN deal_data dd ON dd.contact_id = c.id
  ),

  -- Stakeholders from deal_contacts
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
      )
    ), '[]'::jsonb) AS data
    FROM (
      SELECT dc2.*
      FROM deal_contacts dc2
      WHERE dc2.deal_id = p_deal_id
        AND dc2.organization_id = p_organization_id
      LIMIT 15
    ) dc
    JOIN contacts c ON c.id = dc.contact_id
  ),

  -- Recent activities on the deal
  recent_activities_data AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id',           a.id,
        'title',        a.title,
        'type',         a.type,
        'description',  a.description,
        'scheduled_at', a.scheduled_at,
        'completed',    a.completed
      ) ORDER BY COALESCE(a.scheduled_at, a.created_at) DESC
    ), '[]'::jsonb) AS data
    FROM (
      SELECT a2.*
      FROM activities a2
      WHERE a2.deal_id = p_deal_id
        AND a2.organization_id = p_organization_id
      ORDER BY COALESCE(a2.scheduled_at, a2.created_at) DESC
      LIMIT 10
    ) a
  ),

  -- Open tasks for the deal
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
      FROM tasks t2
      WHERE t2.deal_id = p_deal_id
        AND t2.organization_id = p_organization_id
        AND t2.completed = false
      ORDER BY t2.due_date ASC NULLS LAST
      LIMIT 10
    ) t
  ),

  -- Recent deal notes
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
      FROM deal_notes dn2
      WHERE dn2.deal_id = p_deal_id
        AND dn2.organization_id = p_organization_id
      ORDER BY dn2.created_at DESC
      LIMIT 5
    ) dn
  ),

  -- Deal terms (single row)
  deal_terms_data AS (
    SELECT jsonb_build_object(
      'contract_type',     dt.contract_type,
      'contract_end_date', dt.contract_end_date,
      'auto_renew',        dt.auto_renew,
      'next_qbr_date',     dt.next_qbr_date
    ) AS data
    FROM deal_terms dt
    WHERE dt.deal_id = p_deal_id
      AND dt.organization_id = p_organization_id
    LIMIT 1
  )

  SELECT jsonb_build_object(
    'deal',              dd.data,
    'account',           COALESCE(ad.data, NULL),
    'primary_contact',   COALESCE(pcd.data, NULL),
    'stakeholders',      sd.data,
    'recent_activities', rad.data,
    'open_tasks',        otd.data,
    'deal_notes',        dnd.data,
    'deal_terms',        COALESCE(dtd.data, NULL),
    '_meta', jsonb_build_object(
      'source_tables', ARRAY['deals','accounts','contacts','deal_contacts',
                             'activities','tasks','deal_notes','deal_terms'],
      'queried_at',    NOW()
    )
  ) INTO v_result
  FROM deal_data dd
  LEFT JOIN account_data ad ON true
  LEFT JOIN primary_contact_data pcd ON true
  CROSS JOIN stakeholders_data sd
  CROSS JOIN recent_activities_data rad
  CROSS JOIN open_tasks_data otd
  CROSS JOIN deal_notes_data dnd
  LEFT JOIN deal_terms_data dtd ON true;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") IS 'Returns a comprehensive JSONB document with all deal context needed by an LLM assistant. Includes deal details, account, contacts, stakeholders, activities, tasks, notes, and terms.';



CREATE OR REPLACE FUNCTION "public"."get_deal_stage_transitions"("p_organization_id" "uuid", "p_deal_id" "uuid" DEFAULT NULL::"uuid", "p_date_from" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_date_to" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("deal_id" "uuid", "deal_name" "text", "from_stage" "text", "to_stage" "text", "changed_at" timestamp with time zone, "changed_by" "uuid", "changed_by_name" "text", "dwell_time_days" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH stage_changes AS (
    SELECT
      al.record_id AS deal_id,
      d.name AS deal_name,
      al.old_values->>'stage' AS from_stage,
      al.new_values->>'stage' AS to_stage,
      al.created_at AS changed_at,
      al.changed_by,
      COALESCE(p.full_name, p.email, al.changed_by::text) AS changed_by_name
    FROM audit_log al
    JOIN deals d ON d.id = al.record_id
    LEFT JOIN profiles p ON p.id = al.changed_by
    WHERE al.organization_id = p_organization_id
      AND al.table_name = 'deals'
      AND al.operation = 'UPDATE'
      AND al.old_values->>'stage' IS DISTINCT FROM al.new_values->>'stage'
      AND al.old_values->>'stage' IS NOT NULL
      AND al.new_values->>'stage' IS NOT NULL
      AND (p_deal_id IS NULL OR al.record_id = p_deal_id)
      AND (p_date_from IS NULL OR al.created_at >= p_date_from)
      AND (p_date_to IS NULL OR al.created_at <= p_date_to)
  ),
  with_dwell AS (
    SELECT
      sc.*,
      ROUND(
        EXTRACT(EPOCH FROM (
          sc.changed_at - LAG(sc.changed_at) OVER (
            PARTITION BY sc.deal_id ORDER BY sc.changed_at
          )
        )) / 86400.0,
        1
      ) AS dwell_time_days
    FROM stage_changes sc
  )
  SELECT
    wd.deal_id,
    wd.deal_name,
    wd.from_stage,
    wd.to_stage,
    wd.changed_at,
    wd.changed_by,
    wd.changed_by_name,
    COALESCE(wd.dwell_time_days, 0) AS dwell_time_days
  FROM with_dwell wd
  ORDER BY wd.changed_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_deal_stage_transitions"("p_organization_id" "uuid", "p_deal_id" "uuid", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Query the unified view filtered by entity
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              emu.id,
      'source_table',    emu.source_table,
      'channel',         emu.channel,
      'direction',       emu.direction,
      'content_preview', emu.content_preview,
      'sender_type',     emu.sender_type,
      'timestamp',       emu.timestamp,
      'organization_id', emu.organization_id
    ) ORDER BY emu.timestamp DESC
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT *
    FROM entity_messages_unified em
    WHERE em.entity_type = p_entity_type
      AND em.entity_id = p_entity_id
      AND em.organization_id = p_organization_id
    ORDER BY em.timestamp DESC
    LIMIT p_limit
  ) emu;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer) IS 'Returns a JSONB array of messages from all channels (chat, messaging, email, call) for a given entity. Uses entity_messages_unified view.';



CREATE OR REPLACE FUNCTION "public"."get_failing_queries"("p_organization_id" "uuid", "p_since" timestamp with time zone, "p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "search_query" "text", "intent" "text", "time_to_result_ms" integer, "refinement_attempt" integer, "session_id" "uuid", "created_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    q.id,
    q.search_query,
    q.intent,
    q.time_to_result_ms,
    q.refinement_attempt,
    q.session_id,
    q.created_at
  FROM public.query_accuracy_logs q
  WHERE q.organization_id = p_organization_id
    AND q.created_at >= p_since
    AND q.result_count = 0
  ORDER BY q.created_at DESC
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."get_failing_queries"("p_organization_id" "uuid", "p_since" timestamp with time zone, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_or_create_briefing"("p_user_id" "uuid", "p_organization_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_briefing_id UUID;
BEGIN
  -- Try to find existing briefing for today
  SELECT id INTO v_briefing_id
  FROM daily_briefings
  WHERE user_id = p_user_id
    AND briefing_date = CURRENT_DATE;
  
  -- If not found, create placeholder
  IF v_briefing_id IS NULL THEN
    INSERT INTO daily_briefings (user_id, organization_id, briefing_date)
    VALUES (p_user_id, p_organization_id, CURRENT_DATE)
    RETURNING id INTO v_briefing_id;
  END IF;
  
  RETURN v_briefing_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_briefing"("p_user_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_org_system_prompt"("p_org_id" "uuid") RETURNS TABLE("section_type" "text", "section_title" "text", "content" "text", "section_order" integer, "source" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (spc.section_type)
    spc.section_type,
    spc.section_title,
    spc.content,
    spc.section_order,
    CASE WHEN spc.organization_id IS NULL THEN 'global' ELSE 'org_override' END as source
  FROM public.system_prompt_config spc
  WHERE (spc.organization_id = p_org_id OR spc.organization_id IS NULL)
    AND spc.is_active = true
  ORDER BY spc.section_type, spc.organization_id NULLS LAST, spc.section_order;
END;
$$;


ALTER FUNCTION "public"."get_org_system_prompt"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date" DEFAULT NULL::"date", "p_period_end" "date" DEFAULT NULL::"date", "p_scope" "text" DEFAULT 'mine'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result JSONB;
  v_period_start DATE;
  v_period_end DATE;
  v_caller UUID;
BEGIN
  v_caller := COALESCE(auth.uid(), p_user_id);

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_caller
      AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  IF p_period_start IS NULL THEN
    v_period_start := date_trunc('quarter', CURRENT_DATE)::date;
  ELSE
    v_period_start := p_period_start;
  END IF;

  IF p_period_end IS NULL THEN
    v_period_end := (date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months' - INTERVAL '1 day')::date;
  ELSE
    v_period_end := p_period_end;
  END IF;

  WITH

  scoped_deals AS (
    SELECT d.*
    FROM deals d
    WHERE d.organization_id = p_organization_id
      AND d.stage NOT IN ('closed-won', 'closed-lost', 'closed_won', 'closed_lost')
      AND (
        p_scope = 'org'
        OR (p_scope = 'mine' AND (d.assigned_to = p_user_id OR d.user_id = p_user_id))
      )
  ),

  period_deals AS (
    SELECT sd.* FROM scoped_deals sd
    WHERE sd.close_date >= v_period_start AND sd.close_date <= v_period_end
  ),

  unscheduled_deals AS (
    SELECT sd.* FROM scoped_deals sd WHERE sd.close_date IS NULL
  ),

  summary_data AS (
    SELECT jsonb_build_object(
      'total_deals', COUNT(*)::int,
      'total_value', COALESCE(SUM(d.amount), 0),
      'weighted_value', COALESCE(SUM(d.amount * d.probability / 100.0), 0),
      'avg_deal_size', COALESCE(AVG(d.amount), 0),
      'unscheduled_count', (SELECT COUNT(*)::int FROM unscheduled_deals),
      'unscheduled_value', (SELECT COALESCE(SUM(amount), 0) FROM unscheduled_deals)
    ) AS data
    FROM period_deals d
  ),

  by_stage_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('stage', d.stage, 'count', d.cnt, 'value', d.val)), '[]'::jsonb) AS data
    FROM (SELECT stage, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0) AS val FROM scoped_deals GROUP BY stage ORDER BY val DESC) d
  ),

  by_forecast_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('category', d.forecast_category, 'count', d.cnt, 'value', d.val)), '[]'::jsonb) AS data
    FROM (SELECT forecast_category, COUNT(*)::int AS cnt, COALESCE(SUM(amount), 0) AS val FROM period_deals WHERE forecast_category IS NOT NULL GROUP BY forecast_category ORDER BY val DESC) d
  ),

  at_risk_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ar.id, 'name', ar.name, 'days_stale', ar.days_stale, 'amount', ar.amount, 'stage', ar.stage) ORDER BY ar.days_stale DESC), '[]'::jsonb) AS data
    FROM (
      SELECT sub.id, sub.name, sub.amount, sub.stage, sub.days_stale FROM (
        SELECT d.id, d.name, d.amount, d.stage,
          EXTRACT(DAY FROM NOW() - COALESCE((SELECT MAX(COALESCE(a.scheduled_at, a.created_at)) FROM activities a WHERE a.deal_id = d.id), d.created_at))::int AS days_stale
        FROM scoped_deals d
      ) sub WHERE sub.days_stale >= 14 ORDER BY sub.days_stale DESC LIMIT 10
    ) ar
  ),

  closing_soon_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'close_date', d.close_date, 'amount', d.amount, 'stage', d.stage, 'probability', d.probability) ORDER BY d.close_date ASC), '[]'::jsonb) AS data
    FROM (SELECT d2.* FROM scoped_deals d2 WHERE d2.close_date <= CURRENT_DATE + INTERVAL '30 days' AND d2.close_date >= CURRENT_DATE ORDER BY d2.close_date ASC LIMIT 10) d
  ),

  recent_wins_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'amount', d.amount, 'actual_closed_at', d.actual_closed_at) ORDER BY d.actual_closed_at DESC), '[]'::jsonb) AS data
    FROM (SELECT d2.* FROM deals d2 WHERE d2.organization_id = p_organization_id AND (p_scope = 'org' OR d2.assigned_to = p_user_id OR d2.user_id = p_user_id) AND d2.stage IN ('closed-won', 'closed_won') AND d2.actual_closed_at >= v_period_start AND d2.actual_closed_at <= v_period_end + INTERVAL '1 day' ORDER BY d2.actual_closed_at DESC LIMIT 5) d
  ),

  recent_losses_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'amount', d.amount, 'close_reason', d.close_reason) ORDER BY d.actual_closed_at DESC), '[]'::jsonb) AS data
    FROM (SELECT d2.* FROM deals d2 WHERE d2.organization_id = p_organization_id AND (p_scope = 'org' OR d2.assigned_to = p_user_id OR d2.user_id = p_user_id) AND d2.stage IN ('closed-lost', 'closed_lost') AND d2.actual_closed_at >= v_period_start AND d2.actual_closed_at <= v_period_end + INTERVAL '1 day' ORDER BY d2.actual_closed_at DESC LIMIT 5) d
  ),

  unscheduled_data AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'amount', d.amount, 'stage', d.stage, 'probability', d.probability) ORDER BY d.amount DESC NULLS LAST), '[]'::jsonb) AS data
    FROM (SELECT ud.* FROM unscheduled_deals ud ORDER BY ud.amount DESC NULLS LAST LIMIT 10) d
  ),

  quota_data AS (
    SELECT jsonb_build_object(
      'target_amount', COALESCE(q.amount, q2.amount),
      'attainment', COALESCE(
        CASE WHEN COALESCE(q.amount, q2.amount, 0) > 0 THEN
          ROUND((SELECT COALESCE(SUM(d.amount), 0) FROM deals d WHERE (d.assigned_to = p_user_id OR d.user_id = p_user_id) AND d.organization_id = p_organization_id AND d.stage IN ('closed-won', 'closed_won') AND d.actual_closed_at >= v_period_start AND d.actual_closed_at <= v_period_end + INTERVAL '1 day') / COALESCE(q.amount, q2.amount) * 100, 2)
        ELSE NULL END, 0)
    ) AS data
    FROM (SELECT 1) _placeholder
    LEFT JOIN sales_quotas q ON q.user_id = p_user_id AND q.organization_id = p_organization_id AND q.is_active = true
    LEFT JOIN user_quotas q2 ON q2.user_id = p_user_id AND q2.organization_id = p_organization_id AND q2.is_active = true
    LIMIT 1
  )

  SELECT jsonb_build_object(
    'summary', sd.data, 'by_stage', bsd.data, 'by_forecast', bfd.data,
    'at_risk', ard.data, 'closing_soon', csd.data, 'recent_wins', rwd.data,
    'recent_losses', rld.data, 'unscheduled', usd.data,
    'quota', COALESCE(qd.data, NULL),
    '_meta', jsonb_build_object('source_tables', ARRAY['deals','activities','sales_quotas','user_quotas'], 'queried_at', NOW(), 'period_start', v_period_start, 'period_end', v_period_end, 'scope', p_scope)
  ) INTO v_result
  FROM summary_data sd CROSS JOIN by_stage_data bsd CROSS JOIN by_forecast_data bfd
  CROSS JOIN at_risk_data ard CROSS JOIN closing_soon_data csd CROSS JOIN recent_wins_data rwd
  CROSS JOIN recent_losses_data rld CROSS JOIN unscheduled_data usd LEFT JOIN quota_data qd ON true;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_scope" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_scope" "text") IS 'Returns a comprehensive JSONB pipeline summary for LLM use. Supports scoping: mine (assigned_to/user_id match), org (all org deals), team (future). Includes unscheduled deals section for deals without close dates.';



CREATE OR REPLACE FUNCTION "public"."get_pipeline_health_dashboard"("p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  overview_data RECORD;
  funnel_data JSONB := '[]'::jsonb;
  velocity_data JSONB;
  health_score INTEGER := 0;
  result JSONB;
BEGIN
  -- Get overview data
  SELECT 
    COUNT(*) as total_deals,
    COUNT(CASE WHEN stage NOT IN ('won', 'lost') THEN 1 END) as active_deals,
    SUM(CASE WHEN stage NOT IN ('won', 'lost') AND amount IS NOT NULL THEN amount ELSE 0 END) as active_pipeline_value,
    AVG(CASE WHEN stage NOT IN ('won', 'lost') AND amount IS NOT NULL THEN amount END) as avg_deal_size,
    COUNT(CASE WHEN close_date < CURRENT_DATE AND stage NOT IN ('won', 'lost') THEN 1 END) as overdue_deals,
    COUNT(CASE WHEN close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '30 days' AND stage NOT IN ('won', 'lost') THEN 1 END) as closing_soon,
    COUNT(CASE WHEN amount IS NULL OR amount = 0 THEN 1 END) as missing_amounts,
    COUNT(CASE WHEN stage = 'won' THEN 1 END) as won_deals
  INTO overview_data
  FROM public.deals 
  WHERE organization_id = p_organization_id;
  
  -- Calculate health score
  health_score := GREATEST(0, 100 - 
    (overview_data.overdue_deals * 10) - 
    (overview_data.missing_amounts * 5) -
    (CASE WHEN overview_data.active_deals = 0 THEN 50 ELSE 0 END)
  );
  
  -- Get funnel data
  SELECT jsonb_agg(jsonb_build_object(
    'stage', stage,
    'deal_count', count(*),
    'stage_value', COALESCE(sum(amount), 0),
    'avg_deal_size', COALESCE(avg(amount), 0)
  )) INTO funnel_data
  FROM public.deals 
  WHERE organization_id = p_organization_id AND stage NOT IN ('won', 'lost')
  GROUP BY stage;
  
  -- Get basic velocity data
  velocity_data := jsonb_build_object(
    'stage_metrics', (
      SELECT jsonb_agg(jsonb_build_object(
        'stage', stage,
        'deals_count', count(*),
        'avg_days', 30,  -- Simplified for now
        'min_days', 15,
        'max_days', 60
      ))
      FROM public.deals 
      WHERE organization_id = p_organization_id 
      GROUP BY stage
    ),
    'conversion_metrics', '[]'::jsonb,
    'analyzed_at', extract(epoch from now())
  );
  
  -- Build result
  result := jsonb_build_object(
    'overview', jsonb_build_object(
      'total_deals', overview_data.total_deals,
      'active_pipeline', jsonb_build_object(
        'deal_count', overview_data.active_deals,
        'total_value', COALESCE(overview_data.active_pipeline_value, 0),
        'avg_deal_size', COALESCE(overview_data.avg_deal_size, 0)
      ),
      'health_indicators', jsonb_build_object(
        'overdue_deals', overview_data.overdue_deals,
        'closing_soon', overview_data.closing_soon,
        'missing_amounts', overview_data.missing_amounts,
        'health_score', health_score
      ),
      'win_rate', CASE WHEN overview_data.total_deals > 0 THEN overview_data.won_deals * 100 / overview_data.total_deals ELSE 0 END
    ),
    'velocity', velocity_data,
    'funnel', COALESCE(funnel_data, '[]'::jsonb),
    'risks', jsonb_build_object(
      'stale_deals', 0,
      'unqualified_deals', overview_data.missing_amounts,
      'no_contact_deals', 0,
      'stuck_prospects', 0,
      'risk_score', CASE WHEN health_score >= 80 THEN 'Low' WHEN health_score >= 60 THEN 'Medium' ELSE 'High' END
    ),
    'generated_at', extract(epoch from now())
  );
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_pipeline_health_dashboard"("p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  result JSONB;
  trimmed_avg NUMERIC;
  deal_count BIGINT;
BEGIN
  -- Get total deal count first
  SELECT COUNT(*) INTO deal_count
  FROM public.deals
  WHERE organization_id = p_organization_id AND amount IS NOT NULL;

  -- Calculate trimmed average (excluding top and bottom 5%)
  IF deal_count >= 20 THEN
    SELECT AVG(amount) INTO trimmed_avg
    FROM (
      SELECT amount
      FROM public.deals
      WHERE organization_id = p_organization_id
        AND amount IS NOT NULL
      ORDER BY amount
      OFFSET FLOOR(deal_count * 0.05)::INT
      LIMIT FLOOR(deal_count * 0.90)::INT
    ) trimmed_deals;
  ELSE
    SELECT AVG(amount) INTO trimmed_avg
    FROM public.deals
    WHERE organization_id = p_organization_id AND amount IS NOT NULL;
  END IF;

  -- Build the complete stats object
  SELECT jsonb_build_object(
    -- Global Stats
    'total_count', COUNT(*),
    'total_value', COALESCE(SUM(amount), 0),
    'average_deal_size', COALESCE(AVG(amount), 0),
    'median_deal_size', COALESCE(
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) FILTER (WHERE amount IS NOT NULL),
      0
    ),
    'trimmed_average', COALESCE(trimmed_avg, 0),
    'deals_with_amount', COUNT(amount),
    
    -- Stage Breakdown as ARRAY (per user request)
    'by_stage', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'stage_name', stage,
          'count', stage_count,
          'total_value', stage_total
        ) ORDER BY stage_total DESC
      ), '[]'::jsonb)
      FROM (
        SELECT 
          stage,
          COUNT(*) as stage_count,
          COALESCE(SUM(amount), 0) as stage_total
        FROM public.deals
        WHERE organization_id = p_organization_id
        GROUP BY stage
      ) stage_agg
    ),
    
    -- Additional useful stats
    'won_deals', COUNT(*) FILTER (WHERE stage = 'closed_won'),
    'won_value', COALESCE(SUM(amount) FILTER (WHERE stage = 'closed_won'), 0),
    'lost_deals', COUNT(*) FILTER (WHERE stage = 'closed_lost'),
    'open_deals', COUNT(*) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')),
    'open_pipeline_value', COALESCE(SUM(amount) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')), 0),
    'win_rate', CASE 
      WHEN COUNT(*) FILTER (WHERE stage IN ('closed_won', 'closed_lost')) > 0 
      THEN ROUND(
        (COUNT(*) FILTER (WHERE stage = 'closed_won')::DECIMAL / 
         COUNT(*) FILTER (WHERE stage IN ('closed_won', 'closed_lost'))) * 100, 1)
      ELSE 0 
    END,
    'currency', 'USD',
    'calculated_at', EXTRACT(epoch FROM NOW())
  ) INTO result
  FROM public.deals
  WHERE organization_id = p_organization_id;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") IS 'Calculates comprehensive pipeline statistics including average, median, and trimmed average deal sizes directly in the database for scalability';



CREATE OR REPLACE FUNCTION "public"."get_sales_cycle_analytics"("p_organization_id" "uuid", "p_amount_min" numeric DEFAULT NULL::numeric, "p_amount_max" numeric DEFAULT NULL::numeric, "p_analysis_type" "text" DEFAULT 'full'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
DECLARE
  result JSONB;
BEGIN
  WITH filtered_deals AS (
    SELECT 
      id,
      name,
      amount,
      stage,
      created_at,
      updated_at,
      actual_closed_at,
      reopened_count,
      CASE 
        WHEN stage IN ('closed_won', 'closed_lost') AND actual_closed_at IS NOT NULL 
        THEN EXTRACT(DAY FROM actual_closed_at - created_at)
        ELSE NULL 
      END as days_to_close,
      EXTRACT(DAY FROM NOW() - created_at) as days_in_pipeline,
      EXTRACT(DAY FROM NOW() - updated_at) as days_since_activity
    FROM deals
    WHERE organization_id = p_organization_id
      AND (p_amount_min IS NULL OR amount >= p_amount_min)
      AND (p_amount_max IS NULL OR amount <= p_amount_max)
  )
  SELECT jsonb_build_object(
    -- ====== SALES CYCLE METRICS (closed deals) ======
    'average_sales_cycle_days', ROUND(AVG(days_to_close) FILTER (WHERE days_to_close IS NOT NULL)),
    'median_sales_cycle_days', ROUND(CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_close) 
                               FILTER (WHERE days_to_close IS NOT NULL) AS NUMERIC)),
    'min_sales_cycle_days', MIN(days_to_close) FILTER (WHERE days_to_close IS NOT NULL),
    'max_sales_cycle_days', MAX(days_to_close) FILTER (WHERE days_to_close IS NOT NULL),
    'closed_deals_analyzed', COUNT(*) FILTER (WHERE days_to_close IS NOT NULL),

    -- ====== WIN vs LOSS COMPARISON ======
    'won_vs_lost_cycle', jsonb_build_object(
      'avg_days_to_win', ROUND(AVG(days_to_close) FILTER (WHERE stage = 'closed_won')),
      'avg_days_to_loss', ROUND(AVG(days_to_close) FILTER (WHERE stage = 'closed_lost')),
      'won_count', COUNT(*) FILTER (WHERE stage = 'closed_won' AND days_to_close IS NOT NULL),
      'lost_count', COUNT(*) FILTER (WHERE stage = 'closed_lost' AND days_to_close IS NOT NULL),
      'insight', CASE 
        WHEN AVG(days_to_close) FILTER (WHERE stage = 'closed_lost') 
             < AVG(days_to_close) FILTER (WHERE stage = 'closed_won')
        THEN 'Losses happen faster than wins - consider earlier qualification'
        WHEN AVG(days_to_close) FILTER (WHERE stage = 'closed_lost') 
             > AVG(days_to_close) FILTER (WHERE stage = 'closed_won') * 1.5
        THEN 'Losses drag on too long - implement faster disqualification'
        ELSE 'Healthy pattern - wins close faster than losses'
      END
    ),

    -- ====== OLDEST OPEN DEAL ======
    'oldest_open_deal', (
      SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'amount', amount,
        'stage', stage,
        'days_in_pipeline', days_in_pipeline,
        'created_at', created_at,
        'reopened_count', reopened_count
      )
      FROM filtered_deals
      WHERE stage NOT IN ('closed_won', 'closed_lost')
      ORDER BY created_at ASC
      LIMIT 1
    ),

    -- ====== PIPELINE AGE ANALYSIS ======
    'average_pipeline_age_days', ROUND(AVG(days_in_pipeline) 
                                       FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost'))),
    'open_deals_count', COUNT(*) FILTER (WHERE stage NOT IN ('closed_won', 'closed_lost')),

    -- ====== STALE DEALS (no activity in 14+ days) ======
    'stale_deals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'amount', amount,
        'stage', stage,
        'days_since_activity', days_since_activity,
        'days_in_pipeline', days_in_pipeline
      ) ORDER BY days_since_activity DESC), '[]'::jsonb)
      FROM filtered_deals
      WHERE stage NOT IN ('closed_won', 'closed_lost')
        AND days_since_activity >= 14
      LIMIT 5
    ),
    'stale_deal_count', (
      SELECT COUNT(*) FROM filtered_deals
      WHERE stage NOT IN ('closed_won', 'closed_lost')
        AND days_since_activity >= 14
    ),

    -- ====== BREAKDOWN BY AMOUNT RANGE ======
    'by_amount_range', (
      SELECT COALESCE(jsonb_agg(range_data ORDER BY range_order), '[]'::jsonb)
      FROM (
        SELECT 
          jsonb_build_object(
            'range', CASE 
              WHEN amount < 10000 THEN 'Under $10k'
              WHEN amount < 50000 THEN '$10k-$50k'
              WHEN amount < 100000 THEN '$50k-$100k'
              ELSE 'Over $100k'
            END,
            'avg_cycle_days', ROUND(AVG(days_to_close)),
            'deal_count', COUNT(*)
          ) as range_data,
          CASE 
            WHEN amount < 10000 THEN 1
            WHEN amount < 50000 THEN 2
            WHEN amount < 100000 THEN 3
            ELSE 4
          END as range_order
        FROM filtered_deals
        WHERE days_to_close IS NOT NULL
        GROUP BY CASE 
          WHEN amount < 10000 THEN 'Under $10k'
          WHEN amount < 50000 THEN '$10k-$50k'
          WHEN amount < 100000 THEN '$50k-$100k'
          ELSE 'Over $100k'
        END,
        CASE 
          WHEN amount < 10000 THEN 1
          WHEN amount < 50000 THEN 2
          WHEN amount < 100000 THEN 3
          ELSE 4
        END
      ) ranges
    ),

    -- ====== REOPENED DEALS (coaching signal) ======
    'reopened_deals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'amount', amount,
        'stage', stage,
        'reopened_count', reopened_count
      )), '[]'::jsonb)
      FROM filtered_deals
      WHERE reopened_count > 0
      LIMIT 5
    ),
    'total_reopened_count', COUNT(*) FILTER (WHERE reopened_count > 0),

    -- ====== METADATA ======
    'analysis_type', p_analysis_type,
    'filters_applied', jsonb_build_object(
      'amount_min', p_amount_min,
      'amount_max', p_amount_max
    ),
    'calculated_at', NOW()
  ) INTO result
  FROM filtered_deals;

  RETURN result;
END;
$_$;


ALTER FUNCTION "public"."get_sales_cycle_analytics"("p_organization_id" "uuid", "p_amount_min" numeric, "p_amount_max" numeric, "p_analysis_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_search_accuracy_metrics"("p_organization_id" "uuid", "p_since" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'zero_result_count', COUNT(*) FILTER (WHERE result_count = 0),
    'zero_result_rate', ROUND(
      (COUNT(*) FILTER (WHERE result_count = 0)::numeric / NULLIF(COUNT(*), 0)) * 100, 
      2
    ),
    'avg_time_ms', ROUND(AVG(time_to_result_ms)),
    'avg_match_score', ROUND(AVG(match_score)::numeric, 2),
    'click_through_rate', ROUND(
      (COUNT(*) FILTER (WHERE user_clicked_result = true)::numeric / NULLIF(COUNT(*), 0)) * 100,
      2
    ),
    'refinement_count', COUNT(*) FILTER (WHERE refinement_attempt > 1),
    'refinement_rate', ROUND(
      (COUNT(*) FILTER (WHERE refinement_attempt > 1)::numeric / NULLIF(COUNT(*), 0)) * 100,
      2
    ),
    'intent_distribution', (
      SELECT COALESCE(jsonb_object_agg(intent, cnt), '{}'::jsonb)
      FROM (
        SELECT intent, COUNT(*) as cnt
        FROM public.query_accuracy_logs
        WHERE organization_id = p_organization_id
          AND created_at >= p_since
        GROUP BY intent
        ORDER BY cnt DESC
        LIMIT 10
      ) sub
    ),
    'is_healthy', (COUNT(*) FILTER (WHERE result_count = 0)::numeric / NULLIF(COUNT(*), 0)) < 0.05
  )
  FROM public.query_accuracy_logs
  WHERE organization_id = p_organization_id
    AND created_at >= p_since;
$$;


ALTER FUNCTION "public"."get_search_accuracy_metrics"("p_organization_id" "uuid", "p_since" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_health_overview"() RETURNS TABLE("overall_score" integer, "grade" "text", "total_organizations" bigint, "total_users" bigint, "orphaned_organizations" bigint, "orphaned_users" bigint, "duplicate_organizations" bigint, "inactive_users_30d" bigint, "incomplete_profiles" bigint, "issues" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  score integer := 100;
  issues_array jsonb := '[]'::jsonb;
  org_count bigint;
  user_count bigint;
  orphaned_orgs bigint;
  orphaned_users bigint;
  duplicate_orgs bigint;
  inactive_users bigint;
  incomplete_profiles bigint;
BEGIN
  -- Get basic counts
  SELECT COUNT(*) INTO org_count FROM public.organizations WHERE is_active = true;
  SELECT COUNT(*) INTO user_count FROM public.profiles;
  
  -- Get orphaned organizations (no active members)
  SELECT COUNT(*) INTO orphaned_orgs
  FROM public.organizations o
  WHERE o.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om 
    WHERE om.organization_id = o.id AND om.is_active = true
  );
  
  -- Get orphaned users (no organization membership)
  SELECT COUNT(*) INTO orphaned_users
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_members om 
    WHERE om.user_id = p.id AND om.is_active = true
  );
  
  -- Get duplicate organizations (same domain)
  SELECT COUNT(*) - COUNT(DISTINCT domain) INTO duplicate_orgs
  FROM public.organizations 
  WHERE domain IS NOT NULL AND is_active = true;
  
  -- Get inactive users (no sign in for 30+ days)
  SELECT COUNT(*) INTO inactive_users
  FROM public.profiles p
  LEFT JOIN auth.users au ON p.id = au.id
  WHERE au.last_sign_in_at < now() - interval '30 days' OR au.last_sign_in_at IS NULL;
  
  -- Get incomplete profiles
  SELECT COUNT(*) INTO incomplete_profiles
  FROM public.profiles
  WHERE full_name IS NULL OR full_name = '' OR email IS NULL OR email = '';
  
  -- Calculate score and add issues
  IF orphaned_orgs > 0 THEN
    score := score - (orphaned_orgs * 5);
    issues_array := issues_array || jsonb_build_object(
      'type', 'orphaned_organizations',
      'severity', 'high',
      'count', orphaned_orgs,
      'description', 'Organizations with no active members',
      'action_label', 'Clean Up',
      'can_auto_fix', true
    );
  END IF;
  
  IF orphaned_users > 0 THEN
    score := score - (orphaned_users * 3);
    issues_array := issues_array || jsonb_build_object(
      'type', 'orphaned_users',
      'severity', 'medium',
      'count', orphaned_users,
      'description', 'Users not associated with any organization',
      'action_label', 'Review',
      'can_auto_fix', false
    );
  END IF;
  
  IF duplicate_orgs > 0 THEN
    score := score - (duplicate_orgs * 4);
    issues_array := issues_array || jsonb_build_object(
      'type', 'duplicate_organizations',
      'severity', 'medium',
      'count', duplicate_orgs,
      'description', 'Organizations with duplicate domains',
      'action_label', 'Merge',
      'can_auto_fix', true
    );
  END IF;
  
  -- Ensure score doesn't go below 0
  score := GREATEST(score, 0);
  
  RETURN QUERY
  SELECT 
    score as overall_score,
    CASE 
      WHEN score >= 90 THEN 'Excellent'
      WHEN score >= 75 THEN 'Good' 
      WHEN score >= 60 THEN 'Fair'
      ELSE 'Poor'
    END as grade,
    org_count as total_organizations,
    user_count as total_users,
    orphaned_orgs as orphaned_organizations,
    orphaned_users as orphaned_users,
    duplicate_orgs as duplicate_organizations,
    inactive_users as inactive_users_30d,
    incomplete_profiles as incomplete_profiles,
    issues_array as issues;
END;
$$;


ALTER FUNCTION "public"."get_system_health_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_analytics_overview"() RETURNS TABLE("id" "uuid", "email" "text", "full_name" "text", "role" "text", "created_at" timestamp with time zone, "last_sign_in_at" timestamp with time zone, "organization_count" bigint, "primary_organization_name" "text", "is_active" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    COALESCE(p.role, 'member') as role,
    p.created_at,
    au.last_sign_in_at,
    COALESCE(org_stats.organization_count, 0) as organization_count,
    org_stats.primary_organization_name,
    COALESCE(org_stats.is_active, false) as is_active
  FROM public.profiles p
  LEFT JOIN auth.users au ON p.id = au.id
  LEFT JOIN (
    SELECT 
      user_id,
      COUNT(*) as organization_count,
      bool_or(is_active) as is_active,
      (SELECT o.name FROM public.organizations o 
       JOIN public.organization_members om2 ON o.id = om2.organization_id 
       WHERE om2.user_id = om.user_id AND om2.is_active = true 
       ORDER BY om2.created_at ASC LIMIT 1) as primary_organization_name
    FROM public.organization_members om
    GROUP BY user_id
  ) org_stats ON p.id = org_stats.user_id
  ORDER BY p.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_user_analytics_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_crm_stats"("user_org_ids" "uuid"[]) RETURNS "json"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  stats JSON;
BEGIN
  SELECT json_build_object(
    'contacts', (SELECT COUNT(*) FROM public.contacts WHERE organization_id = ANY(user_org_ids)),
    'deals', (SELECT COUNT(*) FROM public.deals WHERE organization_id = ANY(user_org_ids)),
    'activities', (SELECT COUNT(*) FROM public.activities WHERE organization_id = ANY(user_org_ids)),
    'tasks', (SELECT COUNT(*) FROM public.tasks WHERE organization_id = ANY(user_org_ids)),
    'recent_activity', (
      SELECT COUNT(*) FROM public.activities 
      WHERE organization_id = ANY(user_org_ids) 
      AND created_at > NOW() - INTERVAL '7 days'
    )
  ) INTO stats;
  
  RETURN stats;
END;
$$;


ALTER FUNCTION "public"."get_user_crm_stats"("user_org_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_crm_stats_optimized"("user_org_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  stats JSONB;
  contact_count INTEGER;
  deal_count INTEGER;
  activity_count INTEGER;
  task_count INTEGER;
  recent_activity_count INTEGER;
  total_deal_value NUMERIC;
BEGIN
  -- Use efficient counting with organization indexes
  SELECT COUNT(*) INTO contact_count 
  FROM public.contacts 
  WHERE organization_id = ANY(user_org_ids);
  
  SELECT COUNT(*), COALESCE(SUM(amount), 0) 
  INTO deal_count, total_deal_value
  FROM public.deals 
  WHERE organization_id = ANY(user_org_ids);
  
  SELECT COUNT(*) INTO activity_count 
  FROM public.activities 
  WHERE organization_id = ANY(user_org_ids);
  
  SELECT COUNT(*) INTO task_count 
  FROM public.tasks 
  WHERE organization_id = ANY(user_org_ids);
  
  -- Recent activity with efficient date range
  SELECT COUNT(*) INTO recent_activity_count
  FROM public.activities 
  WHERE organization_id = ANY(user_org_ids) 
  AND created_at > (CURRENT_TIMESTAMP - INTERVAL '7 days');
  
  SELECT jsonb_build_object(
    'contacts', contact_count,
    'deals', deal_count,
    'activities', activity_count,
    'tasks', task_count,
    'recent_activity', recent_activity_count,
    'total_deal_value', total_deal_value,
    'generated_at', EXTRACT(epoch FROM CURRENT_TIMESTAMP)
  ) INTO stats;
  
  RETURN stats;
END;
$$;


ALTER FUNCTION "public"."get_user_crm_stats_optimized"("user_org_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_last_login"("p_user_id" "uuid") RETURNS timestamp with time zone
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  last_login TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get the most recent login activity
  SELECT created_at INTO last_login
  FROM public.user_activity_logs
  WHERE user_id = p_user_id 
  AND activity_type = 'login'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN last_login;
END;
$$;


ALTER FUNCTION "public"."get_user_last_login"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_organization_ids"() RETURNS "uuid"[]
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN ARRAY(
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."get_user_organization_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  user_permissions jsonb := '{}';
  role_assignment RECORD;
BEGIN
  -- Get base role permissions from profile
  SELECT jsonb_build_object('base_role', role) INTO user_permissions
  FROM public.profiles 
  WHERE id = user_uuid;
  
  -- Aggregate all permissions from assigned custom roles
  FOR role_assignment IN 
    SELECT cr.permissions, cr.territory_scope, cr.product_scope, cr.vertical_scope,
           ura.territory_scope as assignment_territory, 
           ura.product_scope as assignment_product,
           ura.vertical_scope as assignment_vertical
    FROM public.user_role_assignments ura
    JOIN public.custom_roles cr ON ura.role_id = cr.id
    WHERE ura.user_id = user_uuid
    AND ura.is_active = true
    AND cr.is_active = true
    AND (ura.expiration_date IS NULL OR ura.expiration_date > CURRENT_DATE)
  LOOP
    -- Merge permissions (union of all assigned roles)
    user_permissions := user_permissions || role_assignment.permissions;
    
    -- Merge scopes
    user_permissions := jsonb_set(
      user_permissions, 
      '{territory_scope}', 
      COALESCE(user_permissions->'territory_scope', '{}'::jsonb) || 
      COALESCE(role_assignment.assignment_territory, role_assignment.territory_scope, '{}'::jsonb)
    );
    
    user_permissions := jsonb_set(
      user_permissions, 
      '{product_scope}', 
      COALESCE(user_permissions->'product_scope', '{}'::jsonb) || 
      COALESCE(role_assignment.assignment_product, role_assignment.product_scope, '{}'::jsonb)
    );
    
    user_permissions := jsonb_set(
      user_permissions, 
      '{vertical_scope}', 
      COALESCE(user_permissions->'vertical_scope', '{}'::jsonb) || 
      COALESCE(role_assignment.assignment_vertical, role_assignment.vertical_scope, '{}'::jsonb)
    );
  END LOOP;
  
  RETURN user_permissions;
END;
$$;


ALTER FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role_in_org"("p_org_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid();
  RETURN COALESCE(user_role, 'none');
END;
$$;


ALTER FUNCTION "public"."get_user_role_in_org"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_segment_stats"() RETURNS TABLE("segment_type" "text", "segment_value" "text", "user_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  -- Role-based segments
  SELECT 
    'role'::text as segment_type,
    COALESCE(p.role, 'member') as segment_value,
    COUNT(*)::bigint as user_count
  FROM public.profiles p
  GROUP BY p.role
  
  UNION ALL
  
  -- Organization-based segments
  SELECT 
    'organization_count'::text as segment_type,
    CASE 
      WHEN org_stats.organization_count = 0 THEN 'no_organization'
      WHEN org_stats.organization_count = 1 THEN 'single_organization'
      ELSE 'multiple_organizations'
    END as segment_value,
    COUNT(*)::bigint as user_count
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id, COUNT(*) as organization_count
    FROM public.organization_members
    WHERE is_active = true
    GROUP BY user_id
  ) org_stats ON p.id = org_stats.user_id
  GROUP BY 
    CASE 
      WHEN org_stats.organization_count = 0 THEN 'no_organization'
      WHEN org_stats.organization_count = 1 THEN 'single_organization'
      ELSE 'multiple_organizations'
    END;
END;
$$;


ALTER FUNCTION "public"."get_user_segment_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_web_engagement_summary"("p_contact_id" "uuid" DEFAULT NULL::"uuid", "p_account_id" "uuid" DEFAULT NULL::"uuid", "p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_days" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_page_views', COUNT(*),
    'unique_pages', COUNT(DISTINCT we.page_url),
    'total_time_seconds', COALESCE(SUM(we.time_on_page_seconds), 0),
    'avg_scroll_depth', ROUND(COALESCE(AVG(we.scroll_depth_percent), 0)),
    'pages_by_category', (
      SELECT COALESCE(jsonb_object_agg(cat, cnt), '{}'::jsonb)
      FROM (
        SELECT we2.page_category as cat, COUNT(*) as cnt
        FROM web_events we2
        LEFT JOIN visitor_identity_map vim2 ON we2.visitor_id = vim2.visitor_id
        WHERE (
          (p_contact_id IS NOT NULL AND (vim2.contact_id = p_contact_id OR we2.contact_id = p_contact_id))
          OR (p_account_id IS NOT NULL AND (vim2.account_id = p_account_id OR we2.account_id = p_account_id))
          OR (p_organization_id IS NOT NULL AND we2.organization_id = p_organization_id)
        )
          AND we2.occurred_at > NOW() - (p_days || ' days')::INTERVAL
          AND we2.is_bot = false
        GROUP BY we2.page_category
      ) sub
    ),
    'high_intent_signals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'page', we3.page_title,
        'category', we3.page_category,
        'time_spent', we3.time_on_page_seconds,
        'occurred_at', we3.occurred_at
      )), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (we4.page_url) we4.page_title, we4.page_category, we4.time_on_page_seconds, we4.occurred_at
        FROM web_events we4
        LEFT JOIN visitor_identity_map vim4 ON we4.visitor_id = vim4.visitor_id
        WHERE (
          (p_contact_id IS NOT NULL AND (vim4.contact_id = p_contact_id OR we4.contact_id = p_contact_id))
          OR (p_account_id IS NOT NULL AND (vim4.account_id = p_account_id OR we4.account_id = p_account_id))
        )
          AND we4.occurred_at > NOW() - (p_days || ' days')::INTERVAL
          AND we4.is_bot = false
          AND (we4.page_category IN ('pricing', 'demo', 'case_study') OR we4.time_on_page_seconds > 120)
        ORDER BY we4.page_url, we4.occurred_at DESC
        LIMIT 5
      ) we3
    ),
    'last_visit', (
      SELECT MAX(we5.occurred_at)
      FROM web_events we5
      LEFT JOIN visitor_identity_map vim5 ON we5.visitor_id = vim5.visitor_id
      WHERE (
        (p_contact_id IS NOT NULL AND (vim5.contact_id = p_contact_id OR we5.contact_id = p_contact_id))
        OR (p_account_id IS NOT NULL AND (vim5.account_id = p_account_id OR we5.account_id = p_account_id))
      )
    )
  ) INTO result
  FROM web_events we
  LEFT JOIN visitor_identity_map vim ON we.visitor_id = vim.visitor_id
  WHERE (
    (p_contact_id IS NOT NULL AND (vim.contact_id = p_contact_id OR we.contact_id = p_contact_id))
    OR (p_account_id IS NOT NULL AND (vim.account_id = p_account_id OR we.account_id = p_account_id))
    OR (p_organization_id IS NOT NULL AND we.organization_id = p_organization_id)
  )
    AND we.occurred_at > NOW() - (p_days || ' days')::INTERVAL
    AND we.is_bot = false;

  RETURN COALESCE(result, jsonb_build_object(
    'total_page_views', 0,
    'unique_pages', 0,
    'total_time_seconds', 0,
    'avg_scroll_depth', 0,
    'pages_by_category', '{}'::jsonb,
    'high_intent_signals', '[]'::jsonb,
    'last_visit', NULL
  ));
END;
$$;


ALTER FUNCTION "public"."get_web_engagement_summary"("p_contact_id" "uuid", "p_account_id" "uuid", "p_organization_id" "uuid", "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_login"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Log the login activity
  PERFORM public.log_user_activity(
    NEW.id,
    NULL,
    'login',
    jsonb_build_object(
      'last_sign_in_at', NEW.last_sign_in_at,
      'sign_in_count', COALESCE(NEW.raw_user_meta_data->>'sign_in_count', '0')
    )
  );
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_auth_login"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_prompt_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  request_record record;
  approval_count integer;
  required_approvals integer;
  new_prompt_id UUID;
BEGIN
  -- Prevent infinite loops - only process INSERT operations
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Lock the request record to prevent race conditions
  SELECT * INTO request_record 
  FROM public.prompt_change_requests 
  WHERE id = NEW.request_id 
  FOR UPDATE;

  -- Validate request exists and is pending
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prompt change request % not found', NEW.request_id;
  END IF;

  IF request_record.status != 'pending' THEN
    RAISE NOTICE 'Request % already processed with status: %', NEW.request_id, request_record.status;
    RETURN NEW;
  END IF;

  -- Count current approvals for this request
  SELECT COUNT(*) INTO approval_count
  FROM public.prompt_approvals 
  WHERE request_id = NEW.request_id 
  AND decision = 'approved';

  -- Get required approvals (default to 1 if not set)
  required_approvals := COALESCE(request_record.required_approvals, 1);

  -- Check if we have enough approvals
  IF approval_count >= required_approvals AND NEW.decision = 'approved' THEN
    BEGIN
      -- Use new activation function for better error handling and validation
      IF request_record.section_type != 'full_prompt' THEN
        new_prompt_id := public.activate_prompt_section(
          request_record.proposed_content,
          request_record.section_type,
          CASE request_record.section_type
            WHEN 'personality' THEN 'Communication Style & User Adaptation'
            WHEN 'company_rules' THEN 'Data Quality Standards'
            WHEN 'special_instructions' THEN 'Advanced CRM Intelligence'
            ELSE 'Custom Section'
          END,
          CASE request_record.section_type
            WHEN 'personality' THEN 1
            WHEN 'company_rules' THEN 2  
            WHEN 'special_instructions' THEN 3
            ELSE 4
          END
        );
      ELSE
        -- Handle full prompt (legacy behavior) with enhanced deactivation
        PERFORM public.deactivate_prompt_section(NULL, 'replaced_by_full_prompt');
        
        INSERT INTO public.system_prompt_config (content, version, is_active, created_by, created_at, updated_at)
        VALUES (
          request_record.proposed_content,
          COALESCE((SELECT MAX(version) FROM public.system_prompt_config), 0) + 1,
          true,
          request_record.requested_by,
          now(),
          now()
        );
      END IF;
      
      -- Mark request as approved
      UPDATE public.prompt_change_requests 
      SET status = 'approved',
          approved_at = now(),
          updated_at = now()
      WHERE id = NEW.request_id;

      RAISE NOTICE 'Prompt change request % approved and activated as prompt %', NEW.request_id, new_prompt_id;

    EXCEPTION 
      WHEN OTHERS THEN
        -- Log error and mark request as failed
        RAISE LOG 'Failed to activate prompt for request %: %', NEW.request_id, SQLERRM;
        
        UPDATE public.prompt_change_requests 
        SET status = 'failed',
            updated_at = now()
        WHERE id = NEW.request_id;
        
        -- Re-raise the exception
        RAISE;
    END;
  ELSIF NEW.decision = 'rejected' THEN
    -- Mark request as rejected if any approval is rejected
    UPDATE public.prompt_change_requests 
    SET status = 'rejected',
        rejected_at = now(),
        updated_at = now()
    WHERE id = NEW.request_id;
    
    RAISE NOTICE 'Prompt change request % rejected', NEW.request_id;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG 'Prompt approval trigger failed for request %: %', NEW.request_id, SQLERRM;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."handle_prompt_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hybrid_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[] DEFAULT ARRAY['account'::"text", 'contact'::"text", 'deal'::"text"], "p_limit" integer DEFAULT 10) RETURNS TABLE("entity_type" "text", "entity_id" "uuid", "display_name" "text", "semantic_score" double precision, "trigram_score" double precision, "combined_score" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      e.entity_type,
      e.entity_id,
      e.content_text as display_name,
      (1 - (e.embedding <=> p_query_embedding))::FLOAT as score
    FROM embeddings e
    WHERE e.organization_id = p_organization_id
      AND e.entity_type = ANY(p_entity_types)
      AND (1 - (e.embedding <=> p_query_embedding)) > 0.5
    ORDER BY e.embedding <=> p_query_embedding
    LIMIT p_limit * 2
  ),
  trigram_results AS (
    -- Accounts
    SELECT 'account'::TEXT as entity_type, a.id as entity_id,
           a.name as display_name, similarity(LOWER(a.name), LOWER(p_query))::FLOAT as score
    FROM accounts a
    WHERE a.organization_id = p_organization_id
      AND 'account' = ANY(p_entity_types)
      AND similarity(LOWER(a.name), LOWER(p_query)) > 0.3
    UNION ALL
    -- Contacts
    SELECT 'contact'::TEXT, c.id, c.full_name,
           similarity(LOWER(COALESCE(c.full_name, '')), LOWER(p_query))::FLOAT
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND 'contact' = ANY(p_entity_types)
      AND similarity(LOWER(COALESCE(c.full_name, '')), LOWER(p_query)) > 0.3
    UNION ALL
    -- Deals
    SELECT 'deal'::TEXT, d.id, d.name,
           similarity(LOWER(d.name), LOWER(p_query))::FLOAT
    FROM deals d
    WHERE d.organization_id = p_organization_id
      AND 'deal' = ANY(p_entity_types)
      AND similarity(LOWER(d.name), LOWER(p_query)) > 0.3
  ),
  combined AS (
    SELECT
      COALESCE(s.entity_type, t.entity_type) as entity_type,
      COALESCE(s.entity_id, t.entity_id) as entity_id,
      COALESCE(t.display_name, s.display_name) as display_name,
      COALESCE(s.score, 0.0)::FLOAT as semantic_score,
      COALESCE(t.score, 0.0)::FLOAT as trigram_score,
      -- Weighted combination: semantic 60%, trigram 40%
      (COALESCE(s.score, 0.0) * 0.6 + COALESCE(t.score, 0.0) * 0.4)::FLOAT as combined_score
    FROM semantic_results s
    FULL OUTER JOIN trigram_results t
      ON s.entity_type = t.entity_type AND s.entity_id = t.entity_id
  )
  SELECT c.entity_type, c.entity_id, c.display_name,
         c.semantic_score, c.trigram_score, c.combined_score
  FROM combined c
  ORDER BY c.combined_score DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."hybrid_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_limit" integer) OWNER TO "postgres";


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


ALTER FUNCTION "public"."increment_calendar_sync_count"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_search_attempt"("p_session_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE public.chat_sessions 
  SET search_attempt_count = search_attempt_count + 1
  WHERE id = p_session_id
  RETURNING search_attempt_count INTO new_count;
  
  RETURN COALESCE(new_count, 1);
END;
$$;


ALTER FUNCTION "public"."increment_search_attempt"("p_session_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."infer_user_role"("email" "text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Simple role inference based on email patterns
  IF email ~* '^(admin|administrator|ceo|cto|founder)@' THEN
    RETURN 'admin';
  ELSIF email ~* '^(sales|business|bd)@' THEN
    RETURN 'sales_rep';
  ELSIF email ~* '^(marketing|growth)@' THEN
    RETURN 'marketing';
  ELSIF email ~* '^(ops|operations|support)@' THEN
    RETURN 'operations';
  ELSE
    RETURN 'member';
  END IF;
END;
$$;


ALTER FUNCTION "public"."infer_user_role"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('admin', 'owner')
      AND is_active = true
  )
$$;


ALTER FUNCTION "public"."is_org_admin"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_admin_or_role"("p_org_id" "uuid", "p_required_role" "text" DEFAULT 'admin'::"text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = auth.uid()
      AND organization_id = p_org_id
      AND is_active = true
      AND role = p_required_role
  );
END;
$$;


ALTER FUNCTION "public"."is_org_admin_or_role"("p_org_id" "uuid", "p_required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_organization_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND organization_id = org_id 
    AND role = 'admin' 
    AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_organization_admin"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND is_active = true
  )
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.platform_admins 
    WHERE user_id = user_uuid AND is_active = true
  );
END;
$$;


ALTER FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") OWNER TO "postgres";






CREATE OR REPLACE FUNCTION "public"."link_visitor_to_contact"("p_visitor_id" "text", "p_organization_id" "uuid", "p_contact_id" "uuid", "p_account_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO visitor_identity_map (visitor_id, organization_id, contact_id, account_id, identified_at)
  VALUES (p_visitor_id, p_organization_id, p_contact_id, p_account_id, now())
  ON CONFLICT (visitor_id) DO UPDATE SET
    contact_id = COALESCE(EXCLUDED.contact_id, visitor_identity_map.contact_id),
    account_id = COALESCE(EXCLUDED.account_id, visitor_identity_map.account_id),
    identified_at = now();
END;
$$;


ALTER FUNCTION "public"."link_visitor_to_contact"("p_visitor_id" "text", "p_organization_id" "uuid", "p_contact_id" "uuid", "p_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_crm_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  activity_title TEXT;
  activity_type TEXT;
  activity_description TEXT;
  entity_name TEXT;
  table_label TEXT;
  record_id TEXT;
  record_user_id UUID;
  record_org_id UUID;
  ref_contact_id UUID;
  ref_account_id UUID;
  ref_deal_id UUID;
  target_record RECORD;
BEGIN
  -- =========================================================================
  -- RECURSION GUARD: Never fire when the triggering table is 'activities'.
  -- This is the primary safety mechanism. Even though we don't attach the
  -- trigger to the activities table, this guard protects against future
  -- mistakes or manual trigger attachment.
  -- =========================================================================
  IF TG_TABLE_NAME = 'activities' THEN
    RETURN NULL;
  END IF;

  -- =========================================================================
  -- DEPTH GUARD: Prevent cascading triggers. If we're already inside a
  -- trigger execution (depth > 1), skip to avoid any re-entrant scenarios.
  -- =========================================================================
  IF pg_trigger_depth() > 1 THEN
    RETURN NULL;
  END IF;

  -- =========================================================================
  -- Determine the record to work with:
  --   DELETE → use OLD (the row that was removed)
  --   INSERT/UPDATE → use NEW (the row being created/modified)
  -- =========================================================================
  IF TG_OP = 'DELETE' THEN
    target_record := OLD;
  ELSE
    target_record := NEW;
  END IF;

  -- =========================================================================
  -- Extract a human-readable name from the record. Different tables store
  -- the entity name in different columns:
  --   contacts → full_name, or first_name + last_name, or email
  --   accounts → name
  --   deals    → name
  --   tasks    → title
  --
  -- COALESCE chain ensures we always get a non-NULL, non-empty string.
  -- =========================================================================
  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      entity_name := COALESCE(
        NULLIF(TRIM(target_record.full_name), ''),
        NULLIF(TRIM(COALESCE(target_record.first_name, '') || ' ' || COALESCE(target_record.last_name, '')), ''),
        NULLIF(TRIM(target_record.email), ''),
        'Unnamed contact'
      );
      table_label := 'contact';
    WHEN 'accounts' THEN
      entity_name := COALESCE(NULLIF(TRIM(target_record.name), ''), 'Unnamed account');
      table_label := 'account';
    WHEN 'deals' THEN
      entity_name := COALESCE(NULLIF(TRIM(target_record.name), ''), 'Unnamed deal');
      table_label := 'deal';
    WHEN 'tasks' THEN
      entity_name := COALESCE(NULLIF(TRIM(target_record.title), ''), 'Unnamed task');
      table_label := 'task';
    ELSE
      -- Fallback for any unexpected table (shouldn't happen, but safe)
      entity_name := 'Unknown entity';
      table_label := TG_TABLE_NAME;
  END CASE;

  -- =========================================================================
  -- Build the activity title and type based on the operation.
  -- =========================================================================
  CASE TG_OP
    WHEN 'INSERT' THEN
      activity_title := 'Added ' || table_label || ': ' || entity_name;
      activity_type := 'crm_create';
      activity_description := 'New ' || table_label || ' record created.';
    WHEN 'UPDATE' THEN
      activity_title := 'Updated ' || table_label || ': ' || entity_name;
      activity_type := 'crm_update';
      activity_description := 'Existing ' || table_label || ' record modified.';
    WHEN 'DELETE' THEN
      activity_title := 'Removed ' || table_label || ': ' || entity_name;
      activity_type := 'crm_delete';
      activity_description := table_label || ' record "' || entity_name || '" was deleted.';
    ELSE
      RETURN NULL; -- Unknown operation, skip
  END CASE;

  -- =========================================================================
  -- Extract IDs from the record for cross-referencing.
  -- We use dynamic field access safely since we know the schema.
  -- =========================================================================
  record_id := target_record.id::TEXT;
  record_user_id := target_record.user_id;
  record_org_id := target_record.organization_id;

  -- Set entity-specific foreign keys for activity linking
  ref_contact_id := NULL;
  ref_account_id := NULL;
  ref_deal_id := NULL;

  CASE TG_TABLE_NAME
    WHEN 'contacts' THEN
      ref_contact_id := target_record.id;
    WHEN 'accounts' THEN
      ref_account_id := target_record.id;
    WHEN 'deals' THEN
      ref_deal_id := target_record.id;
    WHEN 'tasks' THEN
      -- Tasks may reference deals or contacts; link via deal_id if available
      BEGIN
        ref_deal_id := target_record.deal_id;
      EXCEPTION WHEN undefined_column THEN
        ref_deal_id := NULL;
      END;
  END CASE;

  -- =========================================================================
  -- Insert the activity record. These are historical log entries so they
  -- are always marked as completed. The activity_date is set to NOW().
  --
  -- NOTE: We do NOT link to deleted records (their IDs will become orphaned)
  -- so for DELETE operations we clear the FK references.
  -- =========================================================================
  IF TG_OP = 'DELETE' THEN
    ref_contact_id := NULL;
    ref_account_id := NULL;
    ref_deal_id := NULL;
  END IF;

  INSERT INTO public.activities (
    title,
    type,
    description,
    user_id,
    organization_id,
    contact_id,
    account_id,
    deal_id,
    completed,
    activity_date,
    scheduled_at
  ) VALUES (
    activity_title,
    activity_type,
    activity_description,
    record_user_id,
    record_org_id,
    ref_contact_id,
    ref_account_id,
    ref_deal_id,
    TRUE,           -- Historical entries are always "completed"
    NOW(),          -- When the action happened
    NOW()           -- Also set scheduled_at for ordering
  );

  -- Return the appropriate record to allow the original operation to proceed
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."log_crm_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_deal_contact_history"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_contact_history (
      deal_contact_id, deal_id, contact_id, organization_id,
      support_axis, influence_axis, quadrant, change_type, changed_by
    ) VALUES (
      NEW.id, NEW.deal_id, NEW.contact_id, NEW.organization_id,
      NEW.support_axis, NEW.influence_axis, NEW.quadrant, 'created', NEW.created_by
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.support_axis IS DISTINCT FROM NEW.support_axis) OR (OLD.influence_axis IS DISTINCT FROM NEW.influence_axis) THEN
      INSERT INTO public.deal_contact_history (
        deal_contact_id, deal_id, contact_id, organization_id,
        support_axis, influence_axis, quadrant, change_type, changed_by
      ) VALUES (
        NEW.id, NEW.deal_id, NEW.contact_id, NEW.organization_id,
        NEW.support_axis, NEW.influence_axis, NEW.quadrant, 'ranking_updated', auth.uid()
      );
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.deal_contact_history (
      deal_contact_id, deal_id, contact_id, organization_id,
      support_axis, influence_axis, quadrant, change_type, changed_by
    ) VALUES (
      OLD.id, OLD.deal_id, OLD.contact_id, OLD.organization_id,
      OLD.support_axis, OLD.influence_axis, OLD.quadrant, 'removed', auth.uid()
    );
  END IF;

  RETURN NULL; -- AFTER triggers return NULL
END;
$$;


ALTER FUNCTION "public"."log_deal_contact_history"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_security_event"("p_event_type" "text", "p_details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Log security events for monitoring
  INSERT INTO public.organization_security_logs (
    organization_id,
    event_type,
    user_email,
    user_domain,
    metadata
  )
  SELECT 
    (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1),
    p_event_type,
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    public.extract_root_domain((SELECT email FROM auth.users WHERE id = auth.uid())),
    p_details;
END;
$$;


ALTER FUNCTION "public"."log_security_event"("p_event_type" "text", "p_details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_activity_type" "text" DEFAULT 'login'::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb", "p_ip_address" "inet" DEFAULT NULL::"inet", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  activity_id UUID;
BEGIN
  INSERT INTO public.user_activity_logs (
    user_id, organization_id, activity_type, metadata, ip_address, user_agent
  ) VALUES (
    p_user_id, p_organization_id, p_activity_type, p_metadata, p_ip_address, p_user_agent
  ) RETURNING id INTO activity_id;
  
  RETURN activity_id;
END;
$$;


ALTER FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_organization_id" "uuid", "p_activity_type" "text", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_product_mention_to_catalog"("p_org_id" "uuid", "p_product_name" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_product_id UUID;
BEGIN
  -- Exact match first
  SELECT id INTO v_product_id
  FROM products
  WHERE organization_id = p_org_id
    AND LOWER(name) = LOWER(p_product_name)
  LIMIT 1;

  IF v_product_id IS NOT NULL THEN
    RETURN v_product_id;
  END IF;

  -- Fuzzy LIKE match
  SELECT id INTO v_product_id
  FROM products
  WHERE organization_id = p_org_id
    AND (
      LOWER(name) LIKE '%' || LOWER(p_product_name) || '%'
      OR LOWER(p_product_name) LIKE '%' || LOWER(name) || '%'
    )
  ORDER BY LENGTH(name) ASC
  LIMIT 1;

  RETURN v_product_id;
END;
$$;


ALTER FUNCTION "public"."match_product_mention_to_catalog"("p_org_id" "uuid", "p_product_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_user_async"("p_user_id" "uuid", "p_org_id" "uuid", "p_type" "text", "p_data" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if pg_net is available before attempting HTTP POST
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'net') THEN
    RAISE NOTICE '[notify_user_async] pg_net not available, skipping notification';
    RETURN;
  END IF;
  -- Call notification-router via pg_net (non-blocking HTTP POST)
  PERFORM net.http_post(
    url := (SELECT COALESCE(current_setting('app.settings.supabase_url', true), 'https://your-supabase-project-id.supabase.co')) || '/functions/v1/notification-router',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(
        current_setting('app.settings.service_role_key', true),
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      )
    ),
    body := jsonb_build_object(
      'type', p_type,
      'userId', p_user_id,
      'organizationId', p_org_id,
      'data', p_data
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    -- Log but don't block the trigger
    RAISE WARNING '[notify_user_async] Failed to send notification: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."notify_user_async"("p_user_id" "uuid", "p_org_id" "uuid", "p_type" "text", "p_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_chat_message"("p_message_id" "uuid", "p_content" "text", "p_session_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  extracted_data JSONB := '{}';
  intent_match RECORD;
  entity_mentions TEXT[];
  confidence DECIMAL(3,2) := 0.0;
BEGIN
  -- Classify intent based on patterns
  SELECT INTO intent_match
    pattern_name,
    intent_type,
    entity_type,
    confidence_threshold
  FROM public.chat_intent_patterns
  WHERE organization_id = p_organization_id OR organization_id IS NULL
  AND is_active = true
  AND (
    p_content ~* pattern_regex OR
    keywords && string_to_array(LOWER(p_content), ' ')
  )
  ORDER BY 
    CASE WHEN organization_id = p_organization_id THEN 1 ELSE 2 END, -- Org-specific first
    usage_count DESC
  LIMIT 1;
  
  -- Extract potential entity references
  entity_mentions := regexp_split_to_array(
    p_content, 
    '\s+(?:deal|contact|account|task|activity)\s+\d+|\b[A-Z][a-zA-Z\s&]{2,}\b'
  );
  
  -- Build extracted data
  extracted_data := jsonb_build_object(
    'intent_type', COALESCE(intent_match.intent_type, 'unknown'),
    'entity_type', COALESCE(intent_match.entity_type, 'unknown'),
    'entity_mentions', entity_mentions,
    'confidence', COALESCE(intent_match.confidence_threshold, 0.5),
    'processed_at', NOW()
  );
  
  -- Update the message with extracted intelligence
  UPDATE public.chat_messages 
  SET 
    extracted_entities = extracted_data,
    intent_type = intent_match.intent_type,
    confidence_score = COALESCE(intent_match.confidence_threshold, 0.5),
    processing_status = 'processed'
  WHERE id = p_message_id;
  
  -- Update pattern usage statistics
  IF intent_match.pattern_name IS NOT NULL THEN
    UPDATE public.chat_intent_patterns
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE pattern_name = intent_match.pattern_name;
  END IF;
  
  RETURN extracted_data;
END;
$$;


ALTER FUNCTION "public"."process_chat_message"("p_message_id" "uuid", "p_content" "text", "p_session_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_account_on_closed_won"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only trigger on closed_won deals (new or updated to closed_won)
  IF NEW.stage = 'closed_won' AND (OLD IS NULL OR OLD.stage IS DISTINCT FROM 'closed_won') THEN
    
    -- Update account type to customer if it exists
    IF NEW.account_id IS NOT NULL THEN
      UPDATE public.accounts 
      SET account_type = 'customer', updated_at = now()
      WHERE id = NEW.account_id 
        AND (account_type IS NULL OR account_type != 'customer');
      
      -- SMART PROMOTION: Only promote the SPECIFIC contact on this deal
      -- NOT all leads at the account (allows continued prospecting)
      IF NEW.contact_id IS NOT NULL THEN
        UPDATE public.contacts 
        SET status = 'contact', updated_at = now()
        WHERE id = NEW.contact_id 
          AND status = 'lead';
      END IF;
    END IF;
    
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."promote_account_on_closed_won"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."promote_leads_on_deal_closed"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.stage = 'closed_won' AND (OLD.stage IS DISTINCT FROM 'closed_won') THEN
    UPDATE public.contacts
    SET 
      status = 'customer',
      previous_status = status,
      status_changed_at = NOW(),
      updated_at = NOW()
    WHERE account_id = NEW.account_id
      AND status IN ('lead', 'mql', 'sql')
      AND organization_id = NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."promote_leads_on_deal_closed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_analytics_views"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Refresh views in dependency order
  REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_analytics_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY sales_activity_analytics_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY customer_engagement_mv;
  REFRESH MATERIALIZED VIEW CONCURRENTLY account_health_mv;
  
  -- Log refresh completion
  INSERT INTO public.crm_dashboard_stats (organization_id, total_contacts, total_deals, total_activities)
  SELECT organization_id, 0, 0, 0 FROM organizations LIMIT 1
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."refresh_analytics_views"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_to_join_organization"("org_id" "uuid", "requested_role" "text" DEFAULT 'member'::"text", "message" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  request_id UUID;
  current_user_id UUID;
BEGIN
  -- Get current user ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_members 
    WHERE organization_id = org_id AND user_id = current_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Create the join request
  INSERT INTO public.join_requests (organization_id, user_id, requested_role, message, status)
  VALUES (org_id, current_user_id, requested_role, message, 'pending')
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET 
    requested_role = EXCLUDED.requested_role,
    message = EXCLUDED.message,
    status = 'pending',
    updated_at = now()
  RETURNING id INTO request_id;

  RETURN request_id;
END;
$$;


ALTER FUNCTION "public"."request_to_join_organization"("org_id" "uuid", "requested_role" "text", "message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_to_join_organization_secure"("org_id" "uuid", "requested_role" "text" DEFAULT 'member'::"text", "message" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  request_id UUID;
  current_user_id UUID;
  user_email TEXT;
  user_domain TEXT;
  org_accepts_external BOOLEAN DEFAULT false;
BEGIN
  -- Get current user info
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Get user email
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  user_domain := public.extract_root_domain(user_email);

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM public.organization_members 
    WHERE organization_id = org_id AND user_id = current_user_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'User is already a member of this organization';
  END IF;

  -- Check organization's external request policy
  SELECT 
    COALESCE(accept_external_requests, false)
  INTO org_accepts_external
  FROM public.organizations 
  WHERE id = org_id AND is_active = true;

  -- Verify user can request to join
  IF NOT org_accepts_external THEN
    -- Check if user's domain matches organization domains
    IF NOT EXISTS (
      SELECT 1 FROM public.organizations 
      WHERE id = org_id 
        AND (
          domain = user_domain 
          OR user_domain = ANY(allowed_domains)
          OR user_domain = ANY(domain_aliases)
        )
    ) THEN
      RAISE EXCEPTION 'This organization does not accept external join requests';
    END IF;
  END IF;

  -- Create the join request
  INSERT INTO public.join_requests (organization_id, user_id, requested_role, message, status)
  VALUES (org_id, current_user_id, requested_role, message, 'pending')
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET 
    requested_role = EXCLUDED.requested_role,
    message = EXCLUDED.message,
    status = 'pending',
    updated_at = now()
  RETURNING id INTO request_id;

  -- Log the security event
  INSERT INTO public.organization_security_logs (
    organization_id,
    event_type,
    user_email,
    user_domain,
    metadata
  ) VALUES (
    org_id,
    'join_request',
    user_email,
    user_domain,
    jsonb_build_object(
      'requested_role', requested_role,
      'has_message', message IS NOT NULL AND length(trim(message)) > 0
    )
  );

  RETURN request_id;
END;
$$;


ALTER FUNCTION "public"."request_to_join_organization_secure"("org_id" "uuid", "requested_role" "text", "message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_ambiguous_reference"("p_reference" "text", "p_session_id" "uuid", "p_organization_id" "uuid") RETURNS TABLE("entity_type" "text", "entity_id" "uuid", "entity_name" "text", "confidence" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  active_ctx JSONB;
  recent_results UUID[];
  reference_lower TEXT;
BEGIN
  reference_lower := LOWER(TRIM(p_reference));
  
  -- Get active context from session
  SELECT cs.active_context INTO active_ctx
  FROM chat_sessions cs
  WHERE cs.id = p_session_id;
  
  -- Handle pronouns based on active context
  IF reference_lower IN ('it', 'that', 'this') THEN
    -- Check for active entity
    IF active_ctx ? 'active_entity_id' AND active_ctx ? 'active_entity_type' THEN
      RETURN QUERY
      SELECT 
        (active_ctx->>'active_entity_type')::TEXT,
        (active_ctx->>'active_entity_id')::UUID,
        COALESCE(active_ctx->>'active_entity_name', 'Unknown')::TEXT,
        0.95::DECIMAL(3,2);
      RETURN;
    END IF;
  END IF;
  
  -- Handle positional references
  IF reference_lower IN ('first', 'first one', 'the first') THEN
    IF active_ctx ? 'last_results' THEN
      recent_results := ARRAY(SELECT jsonb_array_elements_text(active_ctx->'last_results'))::UUID[];
      IF array_length(recent_results, 1) > 0 THEN
        RETURN QUERY
        SELECT 
          COALESCE(active_ctx->>'last_results_type', 'unknown')::TEXT,
          recent_results[1],
          'First item from recent results'::TEXT,
          0.90::DECIMAL(3,2);
        RETURN;
      END IF;
    END IF;
  END IF;
  
  IF reference_lower IN ('second', 'second one', 'the second') THEN
    IF active_ctx ? 'last_results' THEN
      recent_results := ARRAY(SELECT jsonb_array_elements_text(active_ctx->'last_results'))::UUID[];
      IF array_length(recent_results, 1) > 1 THEN
        RETURN QUERY
        SELECT 
          COALESCE(active_ctx->>'last_results_type', 'unknown')::TEXT,
          recent_results[2],
          'Second item from recent results'::TEXT,
          0.90::DECIMAL(3,2);
        RETURN;
      END IF;
    END IF;
  END IF;
  
  -- Handle company/account references
  IF reference_lower IN ('them', 'their', 'the company', 'that company') THEN
    IF active_ctx ? 'active_company_id' THEN
      RETURN QUERY
      SELECT 
        'accounts'::TEXT,
        (active_ctx->>'active_company_id')::UUID,
        COALESCE(active_ctx->>'active_company_name', 'Active Company')::TEXT,
        0.85::DECIMAL(3,2);
      RETURN;
    END IF;
  END IF;
  
  -- Handle deal references
  IF reference_lower IN ('the deal', 'that deal') THEN
    IF active_ctx ? 'active_deal_id' THEN
      RETURN QUERY
      SELECT 
        'deals'::TEXT,
        (active_ctx->>'active_deal_id')::UUID,
        COALESCE(active_ctx->>'active_deal_name', 'Active Deal')::TEXT,
        0.85::DECIMAL(3,2);
      RETURN;
    END IF;
  END IF;
  
  -- No resolution found
  RETURN;
END;
$$;


ALTER FUNCTION "public"."resolve_ambiguous_reference"("p_reference" "text", "p_session_id" "uuid", "p_organization_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_entity_reference"("p_organization_id" "uuid", "p_reference_text" "text") RETURNS TABLE("entity_type" "text", "entity_id" "uuid", "confidence" numeric, "match_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Direct number match (highest confidence)
  RETURN QUERY
  SELECT 
    er.entity_type,
    er.entity_id,
    1.0::DECIMAL(3,2) as confidence,
    'exact_number'::TEXT as match_type
  FROM public.entity_references er
  WHERE er.organization_id = p_organization_id
  AND LOWER(er.reference_text) = LOWER(p_reference_text)
  AND er.reference_type = 'number'
  ORDER BY er.usage_count DESC
  LIMIT 1;
  
  -- If no exact match, try partial name matching
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      er.entity_type,
      er.entity_id,
      0.8::DECIMAL(3,2) as confidence,
      'partial_name'::TEXT as match_type
    FROM public.entity_references er
    WHERE er.organization_id = p_organization_id
    AND er.reference_type = 'name'
    AND LOWER(er.reference_text) LIKE '%' || LOWER(p_reference_text) || '%'
    ORDER BY 
      LENGTH(er.reference_text) ASC, -- Shorter matches first
      er.usage_count DESC
    LIMIT 5;
  END IF;
END;
$$;


ALTER FUNCTION "public"."resolve_entity_reference"("p_organization_id" "uuid", "p_reference_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."schedule_analytics_refresh"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- This would typically be scheduled externally
  PERFORM refresh_analytics_views();
END;
$$;


ALTER FUNCTION "public"."schedule_analytics_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_crm_data"("p_table_name" "text", "p_organization_ids" "uuid"[], "p_search_term" "text", "p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "content" "text", "table_name" "text", "created_at" timestamp without time zone, "rank" real)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  sql_query TEXT;
BEGIN
  -- Input validation
  IF p_table_name NOT IN ('contacts', 'deals', 'activities', 'tasks', 'accounts', 'all') THEN
    RAISE EXCEPTION 'Invalid table name: %', p_table_name;
  END IF;
  
  IF p_table_name = 'all' THEN
    -- Search across all tables
    RETURN QUERY
    (
      SELECT c.id, 
             (COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') || ' ' || COALESCE(c.email, ''))::TEXT,
             'contacts'::TEXT,
             c.created_at,
             ts_rank(to_tsvector('english', COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') || ' ' || COALESCE(c.email, '')), plainto_tsquery('english', p_search_term))
      FROM public.contacts c
      WHERE c.organization_id = ANY(p_organization_ids)
      AND to_tsvector('english', COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '') || ' ' || COALESCE(c.email, '')) @@ plainto_tsquery('english', p_search_term)
      
      UNION ALL
      
      SELECT d.id,
             (COALESCE(d.name, '') || ' ' || COALESCE(d.description, ''))::TEXT,
             'deals'::TEXT,
             d.created_at,
             ts_rank(to_tsvector('english', COALESCE(d.name, '') || ' ' || COALESCE(d.description, '')), plainto_tsquery('english', p_search_term))
      FROM public.deals d
      WHERE d.organization_id = ANY(p_organization_ids)
      AND to_tsvector('english', COALESCE(d.name, '') || ' ' || COALESCE(d.description, '')) @@ plainto_tsquery('english', p_search_term)
    )
    ORDER BY rank DESC, created_at DESC
    LIMIT p_limit;
  ELSE
    -- Search specific table
    sql_query := format('
      SELECT id::UUID, content::TEXT, %L::TEXT as table_name, created_at, rank::REAL
      FROM (
        SELECT id, 
               CASE 
                 WHEN %L = ''contacts'' THEN COALESCE(first_name, '''') || '' '' || COALESCE(last_name, '''') || '' '' || COALESCE(email, '''')
                 WHEN %L = ''deals'' THEN COALESCE(name, '''') || '' '' || COALESCE(description, '''')
                 WHEN %L = ''activities'' THEN COALESCE(title, '''') || '' '' || COALESCE(description, '''')
                 WHEN %L = ''tasks'' THEN COALESCE(title, '''') || '' '' || COALESCE(description, '''')
                 WHEN %L = ''accounts'' THEN COALESCE(name, '''') || '' '' || COALESCE(description, '''')
               END as content,
               created_at,
               ts_rank(to_tsvector(''english'', content), plainto_tsquery(''english'', %L)) as rank
        FROM public.%I 
        WHERE organization_id = ANY(%L)
      ) ranked
      WHERE content @@ plainto_tsquery(''english'', %L)
      ORDER BY rank DESC, created_at DESC
      LIMIT %s',
      p_table_name, p_table_name, p_table_name, p_table_name, p_table_name, p_table_name,
      p_search_term, p_table_name, p_organization_ids, p_search_term, p_limit
    );
    
    RETURN QUERY EXECUTE sql_query;
  END IF;
END;
$$;


ALTER FUNCTION "public"."search_crm_data"("p_table_name" "text", "p_organization_ids" "uuid"[], "p_search_term" "text", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."semantic_search"("query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[] DEFAULT NULL::"text"[], "p_similarity_threshold" double precision DEFAULT 0.7, "p_limit" integer DEFAULT 10) RETURNS TABLE("entity_type" "text", "entity_id" "uuid", "content_text" "text", "similarity_score" double precision)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    e.entity_type,
    e.entity_id,
    e.content_text,
    (1 - (e.embedding <=> query_embedding))::FLOAT as similarity_score
  FROM embeddings e
  WHERE e.organization_id = p_organization_id
    AND (p_entity_types IS NULL OR e.entity_type = ANY(p_entity_types))
    AND (1 - (e.embedding <=> query_embedding)) > p_similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT p_limit;
$$;


ALTER FUNCTION "public"."semantic_search"("query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_similarity_threshold" double precision, "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_customer_since_date"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.status = 'customer' 
     AND OLD.status IN ('lead', 'mql', 'sql', 'prospect')
     AND NEW.customer_since IS NULL 
  THEN
    NEW.customer_since := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_customer_since_date"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_deal_closed_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_is_closed boolean;
  old_is_closed boolean;
  voided_count integer;
BEGIN
  -- Determine closed status handling both hyphen and underscore formats
  new_is_closed := NEW.stage IN ('closed-won', 'closed-lost', 'closed_won', 'closed_lost');
  old_is_closed := OLD.stage IN ('closed-won', 'closed-lost', 'closed_won', 'closed_lost');

  -- Deal is being CLOSED
  IF new_is_closed AND NOT old_is_closed THEN
    NEW.actual_closed_at := NOW();
  END IF;

  -- Deal is being RE-OPENED (moved from closed to non-closed)
  IF old_is_closed AND NOT new_is_closed THEN
    NEW.actual_closed_at := NULL;
    NEW.reopened_count := COALESCE(OLD.reopened_count, 0) + 1;

    -- Void pending commission records
    UPDATE public.commission_records
    SET status = 'voided', updated_at = NOW()
    WHERE deal_id = NEW.id AND status = 'pending';

    GET DIAGNOSTICS voided_count = ROW_COUNT;

    -- Cancel deal_terms renewal tracking
    UPDATE public.deal_terms
    SET renewal_status = 'cancelled', updated_at = NOW()
    WHERE deal_id = NEW.id AND renewal_status != 'cancelled';

    -- Dismiss renewal/QBR suggested actions
    UPDATE public.suggested_actions
    SET status = 'dismissed', updated_at = NOW()
    WHERE deal_id = NEW.id
      AND action_type IN ('renewal_outreach', 'schedule_qbr')
      AND status = 'active';

    -- Audit trail: insert activity record if commissions were voided
    IF voided_count > 0 THEN
      INSERT INTO public.activities (
        user_id, organization_id, title, type, description, deal_id
      ) VALUES (
        NEW.user_id,
        NEW.organization_id,
        'System: Commission voided on reopen',
        'crm_update',
        'System voided ' || voided_count || ' pending commission(s) due to deal reopen',
        NEW.id
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_deal_closed_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_invite_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.invite_code IS NULL THEN
    NEW.invite_code := public.generate_invite_code();
  END IF;
  -- Maintain deterministic SHA-256 hash alongside the code
  NEW.invite_code_hash := encode(digest(NEW.invite_code, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_invite_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_contact_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.previous_status := OLD.status;
    NEW.status_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_contact_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."track_first_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    UPDATE contacts
    SET first_activity_at = COALESCE(first_activity_at, NEW.activity_date::TIMESTAMPTZ)
    WHERE id = NEW.contact_id AND first_activity_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."track_first_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_generate_embedding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_entity_type TEXT;
  v_content_changed BOOLEAN := true;
BEGIN
  v_supabase_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);

  -- Fallback to env if app settings not available
  IF v_supabase_url IS NULL THEN
    v_supabase_url := COALESCE(
      current_setting('pgrst.db_uri', true),
      'https://' || current_setting('request.headers', true)::json->>'host'
    );
  END IF;

  -- Skip if we can't determine the URL (local dev without config)
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine entity type from table name
  v_entity_type := TG_TABLE_NAME;
  -- Normalize plural table names to singular for embeddings table
  IF v_entity_type = 'contacts' THEN v_entity_type := 'contact';
  ELSIF v_entity_type = 'accounts' THEN v_entity_type := 'account';
  ELSIF v_entity_type = 'deals' THEN v_entity_type := 'deal';
  ELSIF v_entity_type = 'activities' THEN v_entity_type := 'activity';
  ELSIF v_entity_type = 'tasks' THEN v_entity_type := 'task';
  END IF;

  -- On UPDATE, skip if no content fields changed (avoid embedding churn)
  IF TG_OP = 'UPDATE' THEN
    CASE TG_TABLE_NAME
      WHEN 'contacts' THEN
        v_content_changed := (
          OLD.full_name IS DISTINCT FROM NEW.full_name OR
          OLD.company IS DISTINCT FROM NEW.company OR
          OLD.title IS DISTINCT FROM NEW.title OR
          OLD.notes IS DISTINCT FROM NEW.notes OR
          OLD.email IS DISTINCT FROM NEW.email OR
          OLD.position IS DISTINCT FROM NEW.position
        );
      WHEN 'accounts' THEN
        v_content_changed := (
          OLD.name IS DISTINCT FROM NEW.name OR
          OLD.industry IS DISTINCT FROM NEW.industry OR
          OLD.website IS DISTINCT FROM NEW.website OR
          OLD.description IS DISTINCT FROM NEW.description
        );
      WHEN 'deals' THEN
        v_content_changed := (
          OLD.name IS DISTINCT FROM NEW.name OR
          OLD.description IS DISTINCT FROM NEW.description OR
          OLD.stage IS DISTINCT FROM NEW.stage OR
          OLD.amount IS DISTINCT FROM NEW.amount OR
          OLD.competitor_name IS DISTINCT FROM NEW.competitor_name OR
          OLD.key_use_case IS DISTINCT FROM NEW.key_use_case
        );
      WHEN 'activities' THEN
        v_content_changed := (
          OLD.title IS DISTINCT FROM NEW.title OR
          OLD.description IS DISTINCT FROM NEW.description OR
          OLD.subject IS DISTINCT FROM NEW.subject OR
          OLD.type IS DISTINCT FROM NEW.type
        );
      WHEN 'tasks' THEN
        v_content_changed := (
          OLD.title IS DISTINCT FROM NEW.title OR
          OLD.description IS DISTINCT FROM NEW.description OR
          OLD.status IS DISTINCT FROM NEW.status OR
          OLD.priority IS DISTINCT FROM NEW.priority
        );
      ELSE
        v_content_changed := true;
    END CASE;

    IF NOT v_content_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Fire async HTTP call to generate-embedding edge function
  -- pg_net runs this in the background — does not block the transaction
  PERFORM net.http_post(
    url := v_supabase_url || '/functions/v1/generate-embedding',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'entity_type', v_entity_type,
      'entity_id', NEW.id::TEXT,
      'organization_id', NEW.organization_id::TEXT
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block a CRM write because embedding generation failed
    RAISE WARNING 'trigger_generate_embedding failed for %.%: %', TG_TABLE_NAME, NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_generate_embedding"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_hot_lead_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  contact_record RECORD;
  dedup TEXT;
  evidence_payload JSONB;
BEGIN
  -- Skip if no contact linked
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if the contact was created recently (within 7 days) and has no prior activity
  SELECT id, first_name, last_name, first_activity_at, created_at
  INTO contact_record
  FROM public.contacts
  WHERE id = NEW.contact_id;

  IF contact_record IS NULL THEN
    RETURN NEW;
  END IF;

  -- Contact must be created within the last 7 days
  IF contact_record.created_at < NOW() - INTERVAL '7 days' THEN
    RETURN NEW;
  END IF;

  -- Only fire if this is the first activity (first_activity_at was NULL or matches this activity)
  IF contact_record.first_activity_at IS NOT NULL
     AND contact_record.first_activity_at < NOW() - INTERVAL '1 minute' THEN
    RETURN NEW;
  END IF;

  dedup := 'hot_lead:' || NEW.contact_id || ':' || CURRENT_DATE;

  evidence_payload := jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object(
        'type', 'first_engagement',
        'description', 'First activity recorded for new contact',
        'value', 1,
        'threshold', 1
      )
    ),
    'source_entities', jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'contact',
        'entity_id', NEW.contact_id,
        'entity_name', COALESCE(contact_record.first_name || ' ' || contact_record.last_name, 'Unknown')
      ),
      jsonb_build_object(
        'entity_type', 'activity',
        'entity_id', NEW.id,
        'entity_name', COALESCE(NEW.title, NEW.type, 'Activity')
      )
    ),
    'trigger_event', 'hot_lead_first_activity',
    'data_points', jsonb_build_object(
      'activity_type', COALESCE(NEW.type, 'unknown'),
      'contact_name', COALESCE(contact_record.first_name || ' ' || contact_record.last_name, 'Unknown'),
      'contact_created_at', contact_record.created_at
    )
  );

  INSERT INTO public.suggested_actions (
    contact_id, organization_id, action_type, title, description,
    priority, dedup_key, confidence, status, expires_at, evidence
  ) VALUES (
    NEW.contact_id,
    NEW.organization_id,
    'follow_up',
    'New lead engaged — strike while hot',
    'First activity recorded for ' || COALESCE(contact_record.first_name || ' ' || contact_record.last_name, 'new contact') || '. Follow up promptly to capitalize on momentum.',
    'high',
    dedup,
    0.85,
    'active',
    NOW() + INTERVAL '2 days',
    evidence_payload
  )
  ON CONFLICT (dedup_key) WHERE status = 'active'
  DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_hot_lead_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_overdue_task_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  days_overdue INTEGER;
  alert_priority TEXT;
  dedup TEXT;
  task_org_id UUID;
  evidence_payload JSONB;
BEGIN
  -- Only fire for overdue, incomplete tasks
  IF NEW.due_date IS NULL OR NEW.completed = true OR NEW.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.due_date >= CURRENT_DATE THEN
    RETURN NEW;
  END IF;

  days_overdue := CURRENT_DATE - NEW.due_date;

  -- Determine priority
  IF days_overdue >= 3 THEN
    alert_priority := 'critical';
  ELSE
    alert_priority := 'high';
  END IF;

  -- Get organization_id (may be on the task or need lookup)
  task_org_id := NEW.organization_id;

  IF task_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  dedup := 'overdue_task:' || NEW.id || ':' || CURRENT_DATE;

  evidence_payload := jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object(
        'type', 'task_overdue',
        'description', 'Task is ' || days_overdue || ' day(s) overdue',
        'value', days_overdue,
        'threshold', 0
      )
    ),
    'source_entities', jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'task',
        'entity_id', NEW.id,
        'entity_name', NEW.title
      )
    ),
    'trigger_event', 'task_overdue',
    'data_points', jsonb_build_object(
      'task_title', NEW.title,
      'days_overdue', days_overdue,
      'due_date', NEW.due_date,
      'deal_id', NEW.deal_id,
      'contact_id', NEW.contact_id
    )
  );

  INSERT INTO public.suggested_actions (
    contact_id, deal_id, organization_id, action_type, title, description,
    priority, dedup_key, confidence, status, assigned_to, expires_at, evidence
  ) VALUES (
    NEW.contact_id,
    NEW.deal_id,
    task_org_id,
    'follow_up',
    'Overdue task: ' || NEW.title,
    'Task "' || NEW.title || '" is ' || days_overdue || ' day(s) overdue (due ' || NEW.due_date || '). Complete or reschedule.',
    alert_priority,
    dedup,
    1.0,
    'active',
    NEW.user_id,
    NOW() + INTERVAL '1 day',
    evidence_payload
  )
  ON CONFLICT (dedup_key) WHERE status = 'active'
  DO UPDATE SET
    priority = EXCLUDED.priority,
    description = EXCLUDED.description,
    evidence = EXCLUDED.evidence,
    updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_overdue_task_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_probability_drop_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  drop_amount INTEGER;
  alert_priority TEXT;
  dedup TEXT;
  evidence_payload JSONB;
BEGIN
  -- Only fire if probability actually dropped by 20+
  drop_amount := OLD.probability - NEW.probability;
  IF drop_amount < 20 THEN
    RETURN NEW;
  END IF;

  -- Skip closed deals
  IF NEW.stage IN ('closed_won', 'closed_lost') THEN
    RETURN NEW;
  END IF;

  -- Determine priority based on drop magnitude
  IF drop_amount >= 40 THEN
    alert_priority := 'critical';
  ELSIF drop_amount >= 30 THEN
    alert_priority := 'high';
  ELSE
    alert_priority := 'medium';
  END IF;

  dedup := 'prob_drop:' || NEW.id || ':' || CURRENT_DATE;

  evidence_payload := jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object(
        'type', 'probability_change',
        'description', 'Deal probability dropped by ' || drop_amount || '%',
        'value', NEW.probability,
        'threshold', 20
      )
    ),
    'source_entities', jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'deal',
        'entity_id', NEW.id,
        'entity_name', NEW.name
      )
    ),
    'trigger_event', 'probability_drop',
    'data_points', jsonb_build_object(
      'old_probability', OLD.probability,
      'new_probability', NEW.probability,
      'drop_amount', drop_amount,
      'deal_name', NEW.name,
      'deal_stage', NEW.stage,
      'deal_amount', COALESCE(NEW.amount, 0)
    )
  );

  INSERT INTO public.suggested_actions (
    deal_id, organization_id, action_type, title, description,
    priority, dedup_key, confidence, status, expires_at, evidence
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    'deal_risk',
    'Probability dropped ' || drop_amount || '% on ' || NEW.name,
    'Deal "' || NEW.name || '" probability dropped from ' || OLD.probability || '% to ' || NEW.probability || '%. Review and take action.',
    alert_priority,
    dedup,
    0.95,
    'active',
    NOW() + INTERVAL '3 days',
    evidence_payload
  )
  ON CONFLICT (dedup_key) WHERE status = 'active'
  DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    priority = EXCLUDED.priority,
    evidence = EXCLUDED.evidence,
    updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_probability_drop_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_stage_regression_alert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  old_rank INTEGER;
  new_rank INTEGER;
  dedup TEXT;
  evidence_payload JSONB;
BEGIN
  -- Skip closing stages
  IF NEW.stage IN ('closed_won', 'closed_lost') OR OLD.stage IN ('closed_won', 'closed_lost') THEN
    RETURN NEW;
  END IF;

  -- Define stage ordering
  old_rank := CASE OLD.stage
    WHEN 'prospecting' THEN 1
    WHEN 'qualification' THEN 2
    WHEN 'proposal' THEN 3
    WHEN 'negotiation' THEN 4
    ELSE 0
  END;

  new_rank := CASE NEW.stage
    WHEN 'prospecting' THEN 1
    WHEN 'qualification' THEN 2
    WHEN 'proposal' THEN 3
    WHEN 'negotiation' THEN 4
    ELSE 0
  END;

  -- Only fire if stage went backward
  IF new_rank >= old_rank OR old_rank = 0 OR new_rank = 0 THEN
    RETURN NEW;
  END IF;

  dedup := 'stage_regress:' || NEW.id || ':' || CURRENT_DATE;

  evidence_payload := jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object(
        'type', 'stage_regression',
        'description', 'Deal moved backward from ' || OLD.stage || ' to ' || NEW.stage,
        'value', new_rank,
        'threshold', old_rank
      )
    ),
    'source_entities', jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'deal',
        'entity_id', NEW.id,
        'entity_name', NEW.name
      )
    ),
    'trigger_event', 'stage_regression',
    'data_points', jsonb_build_object(
      'from_stage', OLD.stage,
      'to_stage', NEW.stage,
      'deal_name', NEW.name,
      'deal_amount', COALESCE(NEW.amount, 0)
    )
  );

  INSERT INTO public.suggested_actions (
    deal_id, organization_id, action_type, title, description,
    priority, dedup_key, confidence, status, expires_at, evidence
  ) VALUES (
    NEW.id,
    NEW.organization_id,
    'deal_risk',
    'Deal "' || NEW.name || '" moved backward: ' || OLD.stage || ' → ' || NEW.stage,
    'Stage regression detected. The deal moved from ' || OLD.stage || ' to ' || NEW.stage || '. Investigate what changed and consider re-engagement.',
    'high',
    dedup,
    0.9,
    'active',
    NOW() + INTERVAL '3 days',
    evidence_payload
  )
  ON CONFLICT (dedup_key) WHERE status = 'active'
  DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    evidence = EXCLUDED.evidence,
    updated_at = NOW();

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_stage_regression_alert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unified_search"("p_query" "text", "p_query_embedding" "public"."vector" DEFAULT NULL::"public"."vector", "p_organization_id" "uuid" DEFAULT NULL::"uuid", "p_entity_types" "text"[] DEFAULT ARRAY['account'::"text", 'contact'::"text", 'deal'::"text"], "p_tags" "text"[] DEFAULT NULL::"text"[], "p_limit" integer DEFAULT 20) RETURNS TABLE("entity_type" "text", "entity_id" "uuid", "display_name" "text", "ilike_score" double precision, "tsvector_score" double precision, "semantic_score" double precision, "lead_score_boost" double precision, "final_score" double precision)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_w_ilike FLOAT := 0.10;
  v_w_tsvector FLOAT := 0.35;
  v_w_semantic FLOAT := 0.55;
  v_lead_boost_factor FLOAT := 0.50;
  v_semantic_threshold FLOAT := 0.40;
  v_tsquery tsquery;
BEGIN
  -- Load org-specific weights if configured
  SELECT
    sc.w_ilike::FLOAT, sc.w_tsvector::FLOAT, sc.w_semantic::FLOAT,
    sc.lead_score_boost_factor::FLOAT, sc.semantic_threshold::FLOAT
  INTO v_w_ilike, v_w_tsvector, v_w_semantic, v_lead_boost_factor, v_semantic_threshold
  FROM search_config sc
  WHERE sc.organization_id = p_organization_id;

  -- Build tsquery from search text
  IF p_query IS NOT NULL AND LENGTH(TRIM(p_query)) > 0 THEN
    v_tsquery := plainto_tsquery('english', p_query);
  END IF;

  RETURN QUERY
  WITH
  -- ----------------------------------------------------------------
  -- Layer 1: ILIKE exact matches (score = 1.0 for exact, 0.8 for partial)
  -- ----------------------------------------------------------------
  ilike_matches AS (
    -- Accounts
    SELECT 'account'::TEXT AS etype, a.id AS eid,
           a.name AS dname,
           CASE
             WHEN LOWER(a.name) = LOWER(p_query) THEN 1.0
             ELSE 0.8
           END::FLOAT AS score,
           0::INTEGER AS lead_score
    FROM accounts a
    WHERE a.organization_id = p_organization_id
      AND 'account' = ANY(p_entity_types)
      AND p_query IS NOT NULL
      AND a.name ILIKE '%' || p_query || '%'

    UNION ALL

    -- Contacts
    SELECT 'contact'::TEXT, c.id,
           c.full_name,
           CASE
             WHEN LOWER(COALESCE(c.full_name, '')) = LOWER(p_query) THEN 1.0
             ELSE 0.8
           END::FLOAT,
           COALESCE(c.overall_lead_score, 0)
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND 'contact' = ANY(p_entity_types)
      AND p_query IS NOT NULL
      AND (c.full_name ILIKE '%' || p_query || '%'
           OR c.email ILIKE '%' || p_query || '%'
           OR c.company ILIKE '%' || p_query || '%')

    UNION ALL

    -- Deals
    SELECT 'deal'::TEXT, d.id,
           d.name,
           CASE
             WHEN LOWER(d.name) = LOWER(p_query) THEN 1.0
             ELSE 0.8
           END::FLOAT,
           0
    FROM deals d
    WHERE d.organization_id = p_organization_id
      AND 'deal' = ANY(p_entity_types)
      AND p_query IS NOT NULL
      AND d.name ILIKE '%' || p_query || '%'

    UNION ALL

    -- Activities
    SELECT 'activity'::TEXT, act.id,
           act.title,
           0.8::FLOAT,
           0
    FROM activities act
    WHERE act.organization_id = p_organization_id
      AND 'activity' = ANY(p_entity_types)
      AND p_query IS NOT NULL
      AND (act.title ILIKE '%' || p_query || '%'
           OR act.subject ILIKE '%' || p_query || '%')

    UNION ALL

    -- Tasks
    SELECT 'task'::TEXT, t.id,
           t.title,
           0.8::FLOAT,
           0
    FROM tasks t
    WHERE t.organization_id = p_organization_id
      AND 'task' = ANY(p_entity_types)
      AND p_query IS NOT NULL
      AND t.title ILIKE '%' || p_query || '%'
  ),

  -- ----------------------------------------------------------------
  -- Layer 2: TSVECTOR weighted full-text search (ts_rank_cd with weights)
  -- ----------------------------------------------------------------
  tsvector_matches AS (
    -- Accounts
    SELECT 'account'::TEXT AS etype, a.id AS eid,
           a.name AS dname,
           ts_rank_cd(a.search_vector, v_tsquery)::FLOAT AS score,
           0::INTEGER AS lead_score
    FROM accounts a
    WHERE a.organization_id = p_organization_id
      AND 'account' = ANY(p_entity_types)
      AND v_tsquery IS NOT NULL
      AND a.search_vector @@ v_tsquery

    UNION ALL

    -- Contacts
    SELECT 'contact'::TEXT, c.id,
           c.full_name,
           ts_rank_cd(c.search_vector, v_tsquery)::FLOAT,
           COALESCE(c.overall_lead_score, 0)
    FROM contacts c
    WHERE c.organization_id = p_organization_id
      AND 'contact' = ANY(p_entity_types)
      AND v_tsquery IS NOT NULL
      AND c.search_vector @@ v_tsquery

    UNION ALL

    -- Deals
    SELECT 'deal'::TEXT, d.id,
           d.name,
           ts_rank_cd(d.search_vector, v_tsquery)::FLOAT,
           0
    FROM deals d
    WHERE d.organization_id = p_organization_id
      AND 'deal' = ANY(p_entity_types)
      AND v_tsquery IS NOT NULL
      AND d.search_vector @@ v_tsquery

    UNION ALL

    -- Source documents (use existing search_vector)
    SELECT 'source_document'::TEXT, sd.id,
           COALESCE(sd.title, 'Document'),
           ts_rank_cd(sd.search_vector, v_tsquery)::FLOAT,
           0
    FROM source_documents sd
    WHERE sd.organization_id = p_organization_id
      AND 'source_document' = ANY(p_entity_types)
      AND v_tsquery IS NOT NULL
      AND sd.search_vector IS NOT NULL
      AND sd.search_vector @@ v_tsquery
  ),

  -- ----------------------------------------------------------------
  -- Layer 3: Vector cosine similarity (pgvector HNSW)
  -- ----------------------------------------------------------------
  vector_matches AS (
    SELECT
      e.entity_type AS etype,
      e.entity_id AS eid,
      COALESCE(
        CASE e.entity_type
          WHEN 'account' THEN (SELECT a2.name FROM accounts a2 WHERE a2.id = e.entity_id)
          WHEN 'contact' THEN (SELECT c2.full_name FROM contacts c2 WHERE c2.id = e.entity_id)
          WHEN 'deal' THEN (SELECT d2.name FROM deals d2 WHERE d2.id = e.entity_id)
          WHEN 'activity' THEN (SELECT act2.title FROM activities act2 WHERE act2.id = e.entity_id)
          WHEN 'task' THEN (SELECT t2.title FROM tasks t2 WHERE t2.id = e.entity_id)
          WHEN 'source_document' THEN (SELECT sd2.title FROM source_documents sd2 WHERE sd2.id = e.entity_id)
        END,
        LEFT(e.content_text, 80)
      ) AS dname,
      (1 - (e.embedding <=> p_query_embedding))::FLOAT AS score,
      CASE e.entity_type
        WHEN 'contact' THEN COALESCE((SELECT c3.overall_lead_score FROM contacts c3 WHERE c3.id = e.entity_id), 0)
        ELSE 0
      END::INTEGER AS lead_score
    FROM embeddings e
    WHERE p_query_embedding IS NOT NULL
      AND e.organization_id = p_organization_id
      AND e.entity_type = ANY(p_entity_types)
      AND (1 - (e.embedding <=> p_query_embedding)) > v_semantic_threshold
    ORDER BY e.embedding <=> p_query_embedding
    LIMIT p_limit * 3
  ),

  -- ----------------------------------------------------------------
  -- Combine all layers: deduplicate by (entity_type, entity_id)
  -- ----------------------------------------------------------------
  all_results AS (
    SELECT etype, eid, dname, score, 0.0::FLOAT AS tsv, 0.0::FLOAT AS vec, lead_score FROM ilike_matches
    UNION ALL
    SELECT etype, eid, dname, 0.0::FLOAT, score, 0.0::FLOAT, lead_score FROM tsvector_matches
    UNION ALL
    SELECT etype, eid, dname, 0.0::FLOAT, 0.0::FLOAT, score, lead_score FROM vector_matches
  ),

  merged AS (
    SELECT
      ar.etype,
      ar.eid,
      MAX(ar.dname) AS dname,
      MAX(ar.score) AS max_ilike,
      MAX(ar.tsv) AS max_tsv,
      MAX(ar.vec) AS max_vec,
      MAX(ar.lead_score) AS max_lead_score
    FROM all_results ar
    GROUP BY ar.etype, ar.eid
  ),

  -- ----------------------------------------------------------------
  -- Apply tag filter (if requested)
  -- ----------------------------------------------------------------
  tag_filtered AS (
    SELECT m.*
    FROM merged m
    WHERE p_tags IS NULL
      OR EXISTS (
        SELECT 1 FROM entity_tags et
        WHERE et.organization_id = p_organization_id
          AND et.entity_type = m.etype
          AND et.entity_id = m.eid
          AND et.tag = ANY(p_tags)
      )
  ),

  -- ----------------------------------------------------------------
  -- Compute final weighted score with lead score boost
  -- ----------------------------------------------------------------
  scored AS (
    SELECT
      tf.etype,
      tf.eid,
      tf.dname,
      tf.max_ilike,
      -- Normalize tsvector score to 0-1 range (ts_rank_cd typically returns 0-0.3)
      LEAST(tf.max_tsv / GREATEST(0.1, tf.max_tsv), 1.0) AS norm_tsv,
      tf.max_vec,
      -- Lead score boost: (1 + score/200 * factor) — e.g., score=100, factor=0.5 → 1.25x
      (tf.max_lead_score::FLOAT / 200.0 * v_lead_boost_factor) AS ls_boost,
      -- Raw weighted score before boost
      (tf.max_ilike * v_w_ilike
       + LEAST(tf.max_tsv * 3.33, 1.0) * v_w_tsvector
       + tf.max_vec * v_w_semantic) AS raw_score
    FROM tag_filtered tf
  )

  SELECT
    s.etype AS entity_type,
    s.eid AS entity_id,
    s.dname AS display_name,
    s.max_ilike AS ilike_score,
    s.norm_tsv AS tsvector_score,
    s.max_vec AS semantic_score,
    s.ls_boost AS lead_score_boost,
    (s.raw_score * (1.0 + s.ls_boost))::FLOAT AS final_score
  FROM scored s
  WHERE s.raw_score > 0
  ORDER BY (s.raw_score * (1.0 + s.ls_boost)) DESC
  LIMIT p_limit;
END;
$$;


ALTER FUNCTION "public"."unified_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_tags" "text"[], "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_account_ltv"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_account_id UUID;
  v_total_revenue DECIMAL;
  v_deal_count INTEGER;
  v_first_deal_date DATE;
  v_months_as_customer INTEGER;
  v_monthly_avg DECIMAL;
  v_predicted_ltv DECIMAL;
BEGIN
  -- Only process closed-won deals
  IF NEW.stage NOT IN ('closed-won', 'closed_won') THEN
    RETURN NEW;
  END IF;

  v_account_id := NEW.account_id;
  IF v_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calculate total revenue from all closed-won deals
  SELECT
    COALESCE(SUM(amount), 0),
    COUNT(*),
    MIN(actual_closed_at)::DATE
  INTO v_total_revenue, v_deal_count, v_first_deal_date
  FROM public.deals
  WHERE account_id = v_account_id
    AND stage IN ('closed-won', 'closed_won');

  -- Calculate months as customer
  v_months_as_customer := GREATEST(1,
    EXTRACT(MONTH FROM age(NOW(), v_first_deal_date))::INTEGER +
    EXTRACT(YEAR FROM age(NOW(), v_first_deal_date))::INTEGER * 12
  );

  -- Simple LTV prediction: monthly average * 36 months (3 year horizon)
  v_monthly_avg := v_total_revenue / v_months_as_customer;
  v_predicted_ltv := v_monthly_avg * 36;

  -- Update account
  UPDATE public.accounts
  SET
    total_revenue = v_total_revenue,
    ltv_calculated = v_total_revenue,
    ltv_predicted = v_predicted_ltv,
    ltv_confidence = LEAST(0.95, 0.3 + (v_deal_count * 0.1) + (v_months_as_customer * 0.02)),
    ltv_segment = CASE
      WHEN v_predicted_ltv >= 100000 THEN 'high'
      WHEN v_predicted_ltv >= 25000 THEN 'medium'
      ELSE 'low'
    END,
    ltv_last_calculated_at = NOW(),
    customer_since = COALESCE(customer_since, v_first_deal_date)
  WHERE id = v_account_id;

  -- Record history
  INSERT INTO public.account_ltv_history (
    account_id, organization_id, ltv_calculated, ltv_predicted,
    total_revenue, calculation_method, factors_used
  )
  SELECT
    v_account_id,
    organization_id,
    v_total_revenue,
    v_predicted_ltv,
    v_total_revenue,
    'trigger_update',
    jsonb_build_object(
      'deal_count', v_deal_count,
      'months_as_customer', v_months_as_customer,
      'monthly_avg', v_monthly_avg
    )
  FROM public.accounts WHERE id = v_account_id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_account_ltv"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_calendar_watch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_calendar_watch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_job_progress"("p_job_id" "uuid", "p_stage" "text", "p_progress" integer DEFAULT NULL::integer, "p_message" "text" DEFAULT NULL::"text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  progress_id UUID;
BEGIN
  -- Insert progress record
  INSERT INTO public.admin_job_progress (
    job_id, stage, progress_percentage, message, metadata
  ) VALUES (
    p_job_id, p_stage, p_progress, p_message, p_metadata
  ) RETURNING id INTO progress_id;
  
  -- Update job execution with latest progress
  UPDATE public.admin_job_executions 
  SET 
    current_stage = p_stage,
    progress_percentage = COALESCE(p_progress, progress_percentage),
    updated_at = now()
  WHERE id = p_job_id;
  
  RETURN progress_id;
END;
$$;


ALTER FUNCTION "public"."update_job_progress"("p_job_id" "uuid", "p_stage" "text", "p_progress" integer, "p_message" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_lead_scores"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
    -- Calculate BANT score
    NEW.bant_score := calculate_bant_score(
        NEW.budget_status,
        NEW.authority_level,
        NEW.need_urgency,
        NEW.timeline_status
    );
    
    -- Calculate overall lead score
    NEW.overall_lead_score := calculate_overall_lead_score(
        NEW.fit_score,
        NEW.intent_score,
        NEW.engagement_score,
        NEW.bant_score
    );
    
    -- Auto-progress qualification stage
    IF NEW.qualification_stage = 'captured' AND NEW.fit_score > 0 THEN
        NEW.qualification_stage := 'enriched';
    END IF;
    
    IF NEW.qualification_stage IN ('enriched', 'engaged', 'discovering') 
       AND NEW.bant_score >= 60 THEN
        NEW.qualification_stage := 'qualified';
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lead_scores"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_org_custom_skills_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$ BEGIN
  NEW.updated_at = now();
  NEW.cache_version = OLD.cache_version + 1;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."update_org_custom_skills_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_uploaded_files_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_uploaded_files_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_user_prompt_preferences_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.cache_version = OLD.cache_version + 1;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_user_prompt_preferences_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_belongs_to_org"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT org_id = ANY(public.get_user_organization_ids())
$$;


ALTER FUNCTION "public"."user_belongs_to_org"("org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_email_format"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $_$
BEGIN
  IF NEW.email IS NOT NULL AND NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RAISE EXCEPTION 'Invalid email format: %', NEW.email;
  END IF;
  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."validate_email_format"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_email_format"() IS 'Validates email format before insert/update';



CREATE OR REPLACE FUNCTION "public"."validate_invite_code"("code" "text") RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "role" "text", "invited_by_email" "text", "is_valid" boolean, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  invite_record RECORD;
  code_hash text;
BEGIN
  code_hash := encode(extensions.digest(code, 'sha256'), 'hex');

  SELECT 
    oi.*, 
    o.name as org_name,
    (SELECT email FROM auth.users WHERE id = oi.invited_by) as inviter_email
  INTO invite_record
  FROM public.organization_invites oi
  JOIN public.organizations o ON o.id = oi.org_id
  WHERE (oi.invite_code_hash = code_hash OR oi.invite_code = code)
    AND oi.accepted_at IS NULL
    AND oi.expires_at > now();

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_invites 
      WHERE invite_code_hash = code_hash OR invite_code = code
    ) THEN
      RETURN QUERY SELECT 
        NULL::uuid, NULL::text, NULL::text, NULL::text, 
        false, 'This invitation has expired or has already been used'::text;
    ELSE
      RETURN QUERY SELECT 
        NULL::uuid, NULL::text, NULL::text, NULL::text, 
        false, 'Invalid invitation code'::text;
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT 
    invite_record.org_id,
    invite_record.org_name,
    invite_record.role,
    invite_record.inviter_email,
    true,
    NULL::text;
END;
$$;


ALTER FUNCTION "public"."validate_invite_code"("code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_prompt_section_content"("content" "text", "section_type" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Ensure company_rules section contains required validation keywords
  IF section_type = 'company_rules' AND content !~* 'duplicate|validation|required' THEN
    RETURN FALSE;
  END IF;
  
  -- Ensure personality section contains communication guidance
  IF section_type = 'personality' AND content !~* 'communication|response|tone' THEN
    RETURN FALSE;
  END IF;
  
  -- Ensure special_instructions section contains workflow guidance
  IF section_type = 'special_instructions' AND content !~* 'workflow|process|handling' THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."validate_prompt_section_content"("content" "text", "section_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_email"("verification_code" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- For now, we'll use Supabase's built-in email verification
  -- This function exists to maintain compatibility with the frontend
  -- In a real implementation, you would validate the verification code
  -- against a stored code in the database
  
  -- For demo purposes, return true if code is not empty
  RETURN verification_code IS NOT NULL AND length(trim(verification_code)) > 0;
END;
$$;


ALTER FUNCTION "public"."verify_email"("verification_code" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "industry" "text",
    "website" "text",
    "phone" "text",
    "address" "text",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "assigned_to" "uuid",
    "account_number" integer NOT NULL,
    "scraped_data" "jsonb" DEFAULT '{}'::"jsonb",
    "data_sources" "jsonb" DEFAULT '{}'::"jsonb",
    "confidence_scores" "jsonb" DEFAULT '{}'::"jsonb",
    "enriched_at" timestamp with time zone,
    "version" integer DEFAULT 1,
    "account_type" "text" DEFAULT 'prospect'::"text",
    "domain" "text",
    "is_personal" boolean DEFAULT false,
    "ltv_calculated" numeric(12,2),
    "ltv_predicted" numeric(12,2),
    "ltv_confidence" numeric(3,2),
    "ltv_segment" "text",
    "ltv_last_calculated_at" timestamp with time zone,
    "arr" numeric(12,2),
    "mrr" numeric(12,2),
    "total_revenue" numeric(12,2) DEFAULT 0,
    "customer_since" "date",
    "churn_risk_score" numeric(3,2),
    "expansion_potential" numeric(12,2),
    "health_score" integer,
    "search_vector" "tsvector" GENERATED ALWAYS AS (((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("name", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("industry", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", ((COALESCE("website", ''::"text") || ' '::"text") || COALESCE("domain", ''::"text"))), 'C'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("description", ''::"text")), 'D'::"char"))) STORED
);

ALTER TABLE ONLY "public"."accounts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "type" "text" DEFAULT 'meeting'::"text" NOT NULL,
    "description" "text",
    "scheduled_at" timestamp with time zone,
    "completed" boolean DEFAULT false,
    "contact_id" "uuid",
    "account_id" "uuid",
    "deal_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "assigned_to" "uuid",
    "subject" "text",
    "activity_date" timestamp with time zone DEFAULT "now"(),
    "activity_number" integer NOT NULL,
    "version" integer DEFAULT 1
);

ALTER TABLE ONLY "public"."activities" REPLICA IDENTITY FULL;


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "company" "text",
    "position" "text",
    "address" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "assigned_to" "uuid",
    "account_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "full_name" "text",
    "title" "text",
    "status" "text",
    "contact_number" integer NOT NULL,
    "data_sources" "jsonb" DEFAULT '{}'::"jsonb",
    "enriched_at" timestamp with time zone,
    "enrichment_confidence" numeric(3,2) DEFAULT 0.0,
    "version" integer DEFAULT 1,
    "status_changed_at" timestamp with time zone,
    "previous_status" "text",
    "lead_source" "text",
    "lead_score" integer DEFAULT 0,
    "qualification_notes" "text",
    "nurture_stage" "text",
    "campaign_source" "text",
    "first_touch_date" "date",
    "contact_role" "text",
    "decision_authority" "text",
    "relationship_strength" "text",
    "customer_since" "date",
    "communication_preference" "text",
    "qualification_stage" "text" DEFAULT 'captured'::"text",
    "capture_method" "text",
    "capture_context" "text",
    "fit_score" integer DEFAULT 0,
    "fit_signals" "jsonb" DEFAULT '{}'::"jsonb",
    "intent_score" integer DEFAULT 0,
    "engagement_score" integer DEFAULT 0,
    "bant_score" integer DEFAULT 0,
    "overall_lead_score" integer DEFAULT 0,
    "budget_amount" numeric(15,2),
    "budget_status" "text" DEFAULT 'unknown'::"text",
    "budget_notes" "text",
    "authority_level" "text" DEFAULT 'unknown'::"text",
    "need_urgency" "text" DEFAULT 'unknown'::"text",
    "need_description" "text",
    "timeline_status" "text" DEFAULT 'unknown'::"text",
    "timeline_target_date" "date",
    "enrichment_provider" "text",
    "disqualification_reason" "text",
    "disqualified_at" timestamp with time zone,
    "disqualified_by" "uuid",
    "linkedin_url" "text",
    "first_activity_at" timestamp with time zone,
    "first_touch_source" "text",
    "first_touch_medium" "text",
    "first_touch_campaign" "text",
    "search_vector" "tsvector" GENERATED ALWAYS AS (((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("full_name", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("company", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("position", ''::"text"))), 'C'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", ((COALESCE("notes", ''::"text") || ' '::"text") || COALESCE("email", ''::"text"))), 'D'::"char"))) STORED,
    CONSTRAINT "chk_lead_score" CHECK ((("lead_score" >= 0) AND ("lead_score" <= 100)))
);

ALTER TABLE ONLY "public"."contacts" REPLICA IDENTITY FULL;


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(10,2),
    "currency" "text" DEFAULT 'USD'::"text",
    "stage" "text" DEFAULT 'prospecting'::"text" NOT NULL,
    "probability" integer DEFAULT 0,
    "close_date" "date",
    "contact_id" "uuid",
    "account_id" "uuid",
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "assigned_to" "uuid",
    "name" "text" DEFAULT 'Untitled Deal'::"text" NOT NULL,
    "expected_close_date" "date",
    "deal_number" integer NOT NULL,
    "data_sources" "jsonb" DEFAULT '{}'::"jsonb",
    "enriched_at" timestamp with time zone,
    "version" integer DEFAULT 1,
    "key_use_case" "text",
    "products_positioned" "text"[],
    "actual_closed_at" timestamp with time zone,
    "reopened_count" integer DEFAULT 0,
    "probability_source" "text" DEFAULT 'stage_default'::"text",
    "close_reason" "text",
    "close_notes" "text",
    "competitor_name" "text",
    "forecast_category" "text",
    "first_touch_campaign_id" "uuid",
    "last_touch_campaign_id" "uuid",
    "lead_source" "text",
    "search_vector" "tsvector" GENERATED ALWAYS AS (((("setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("name", ''::"text")), 'A'::"char") || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("description", ''::"text")), 'B'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", ((COALESCE("competitor_name", ''::"text") || ' '::"text") || COALESCE("key_use_case", ''::"text"))), 'C'::"char")) || "setweight"("to_tsvector"('"english"'::"regconfig", COALESCE("lead_source", ''::"text")), 'D'::"char"))) STORED,
    CONSTRAINT "check_deal_amount_positive" CHECK ((("amount" IS NULL) OR ("amount" >= (0)::numeric))),
    CONSTRAINT "check_probability_range" CHECK ((("probability" IS NULL) OR (("probability" >= 0) AND ("probability" <= 100)))),
    CONSTRAINT "deals_forecast_category_check" CHECK (("forecast_category" = ANY (ARRAY['commit'::"text", 'best_case'::"text", 'upside'::"text", 'pipeline'::"text", 'omit'::"text"]))),
    CONSTRAINT "deals_probability_source_check" CHECK (("probability_source" = ANY (ARRAY['stage_default'::"text", 'manual'::"text", 'ai_suggested'::"text", 'imported'::"text"])))
);

ALTER TABLE ONLY "public"."deals" REPLICA IDENTITY FULL;


ALTER TABLE "public"."deals" OWNER TO "postgres";


COMMENT ON COLUMN "public"."deals"."forecast_category" IS 'Forecast category: commit (>80% confidence), best_case (50-80%), upside (20-50%), pipeline (<20%), omit (excluded from forecast)';



CREATE MATERIALIZED VIEW "public"."account_health_mv" AS
 WITH "account_metrics" AS (
         SELECT "a"."id" AS "account_id",
            "a"."organization_id",
            "a"."name" AS "account_name",
            "a"."industry",
            "a"."created_at" AS "account_created",
            "count"(DISTINCT "c"."id") AS "contact_count",
            "count"(DISTINCT "d"."id") AS "total_deals",
            "sum"(
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "total_revenue",
            "max"(
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."close_date"
                    ELSE NULL::"date"
                END) AS "last_won_date",
            "count"(DISTINCT "act"."id") AS "total_activities",
            "count"(DISTINCT
                CASE
                    WHEN ("act"."created_at" > (CURRENT_DATE - '90 days'::interval)) THEN "act"."id"
                    ELSE NULL::"uuid"
                END) AS "recent_activities",
            "max"("act"."created_at") AS "last_activity_date",
                CASE
                    WHEN (("sum"(
                    CASE
                        WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                        ELSE (0)::numeric
                    END) > (100000)::numeric) AND ("count"(DISTINCT
                    CASE
                        WHEN ("act"."created_at" > (CURRENT_DATE - '30 days'::interval)) THEN "act"."id"
                        ELSE NULL::"uuid"
                    END) > 5)) THEN 'excellent'::"text"
                    WHEN (("sum"(
                    CASE
                        WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                        ELSE (0)::numeric
                    END) > (50000)::numeric) AND ("count"(DISTINCT
                    CASE
                        WHEN ("act"."created_at" > (CURRENT_DATE - '60 days'::interval)) THEN "act"."id"
                        ELSE NULL::"uuid"
                    END) > 3)) THEN 'good'::"text"
                    WHEN ("count"(DISTINCT
                    CASE
                        WHEN ("act"."created_at" > (CURRENT_DATE - '90 days'::interval)) THEN "act"."id"
                        ELSE NULL::"uuid"
                    END) > 0) THEN 'fair'::"text"
                    ELSE 'at_risk'::"text"
                END AS "health_status",
            "sum"(
                CASE
                    WHEN (("d"."stage" = 'won'::"text") AND ("d"."close_date" > (CURRENT_DATE - '1 year'::interval))) THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "revenue_last_12m",
            "sum"(
                CASE
                    WHEN (("d"."stage" = 'won'::"text") AND ("d"."close_date" > (CURRENT_DATE - '6 mons'::interval))) THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "revenue_last_6m"
           FROM ((("public"."accounts" "a"
             LEFT JOIN "public"."contacts" "c" ON (("a"."id" = "c"."account_id")))
             LEFT JOIN "public"."deals" "d" ON (("a"."id" = "d"."account_id")))
             LEFT JOIN "public"."activities" "act" ON (("a"."id" = "act"."account_id")))
          GROUP BY "a"."id", "a"."organization_id", "a"."name", "a"."industry", "a"."created_at"
        )
 SELECT "account_metrics"."account_id",
    "account_metrics"."organization_id",
    "account_metrics"."account_name",
    "account_metrics"."industry",
    "account_metrics"."account_created",
    "account_metrics"."contact_count",
    "account_metrics"."total_deals",
    "account_metrics"."total_revenue",
    "account_metrics"."last_won_date",
    "account_metrics"."total_activities",
    "account_metrics"."recent_activities",
    "account_metrics"."last_activity_date",
    "account_metrics"."health_status",
    "account_metrics"."revenue_last_12m",
    "account_metrics"."revenue_last_6m",
        CASE
            WHEN ("account_metrics"."revenue_last_6m" > ("account_metrics"."revenue_last_12m" * 0.6)) THEN 'growing'::"text"
            WHEN ("account_metrics"."revenue_last_6m" < ("account_metrics"."revenue_last_12m" * 0.3)) THEN 'declining'::"text"
            ELSE 'stable'::"text"
        END AS "growth_trend"
   FROM "account_metrics"
  WITH NO DATA;


ALTER TABLE "public"."account_health_mv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_ltv_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "ltv_calculated" numeric(12,2),
    "ltv_predicted" numeric(12,2),
    "arr" numeric(12,2),
    "mrr" numeric(12,2),
    "total_revenue" numeric(12,2),
    "health_score" integer,
    "churn_risk_score" numeric(3,2),
    "calculation_method" "text",
    "factors_used" "jsonb",
    "recorded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."account_ltv_history" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."accounts_account_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."accounts_account_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."accounts_account_number_seq" OWNED BY "public"."accounts"."account_number";



CREATE SEQUENCE IF NOT EXISTS "public"."activities_activity_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."activities_activity_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activities_activity_number_seq" OWNED BY "public"."activities"."activity_number";



CREATE TABLE IF NOT EXISTS "public"."admin_email_whitelist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "grant_website_admin" boolean DEFAULT false,
    "grant_platform_admin" boolean DEFAULT false,
    "added_by" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."admin_email_whitelist" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_job_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "triggered_by_user_id" "uuid",
    "job_type" "text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "priority" integer DEFAULT 1,
    "progress_percentage" integer DEFAULT 0,
    "current_stage" "text",
    "queue_position" integer,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "timeout_at" timestamp with time zone,
    "estimated_completion" timestamp with time zone,
    "results" "jsonb" DEFAULT '{}'::"jsonb",
    "error_details" "jsonb" DEFAULT '{}'::"jsonb",
    "retry_count" integer DEFAULT 0,
    "max_retries" integer DEFAULT 3,
    "resource_usage" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_job_executions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_job_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "stage" "text" NOT NULL,
    "progress_percentage" integer DEFAULT 0,
    "message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."admin_job_progress" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "job_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "action_label" "text",
    "action_data" "jsonb" DEFAULT '{}'::"jsonb",
    "is_read" boolean DEFAULT false,
    "is_persistent" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone
);


ALTER TABLE "public"."admin_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "rule_name" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "field_name" "text",
    "condition_type" "text" NOT NULL,
    "threshold_value" numeric(10,2),
    "threshold_text" "text",
    "requires_approval" boolean DEFAULT true,
    "approver_role" "text" DEFAULT 'admin'::"text",
    "notification_template" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."approval_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "table_name" "text" NOT NULL,
    "record_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "changes" "jsonb",
    "reason" "text",
    "chat_message_id" "uuid",
    "approved_by" "uuid",
    "approval_required" boolean DEFAULT false,
    "approval_status" "text" DEFAULT 'auto_approved'::"text",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audit_log_approval_status_check" CHECK (("approval_status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'auto_approved'::"text"]))),
    CONSTRAINT "audit_log_operation_check" CHECK (("operation" = ANY (ARRAY['INSERT'::"text", 'UPDATE'::"text", 'DELETE'::"text"])))
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";




CREATE TABLE IF NOT EXISTS "public"."calendar_event_sync" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "google_event_id" "text" NOT NULL,
    "google_calendar_id" "text" DEFAULT 'primary'::"text" NOT NULL,
    "google_updated_at" timestamp with time zone,
    "google_etag" "text",
    "activity_id" "uuid",
    "sync_direction" "text",
    "last_synced_at" timestamp with time zone DEFAULT "now"(),
    "sync_status" "text" DEFAULT 'synced'::"text",
    "conflict_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "calendar_event_sync_sync_direction_check" CHECK (("sync_direction" = ANY (ARRAY['google_to_crm'::"text", 'crm_to_google'::"text", 'bidirectional'::"text"]))),
    CONSTRAINT "calendar_event_sync_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['synced'::"text", 'pending'::"text", 'conflict'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."calendar_event_sync" OWNER TO "postgres";


COMMENT ON TABLE "public"."calendar_event_sync" IS 'Maps Google Calendar events to CRM activities for sync tracking';



CREATE TABLE IF NOT EXISTS "public"."calendar_tokens" (
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'google'::"text",
    "email" "text",
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."calendar_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_watch_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "resource_id" "text",
    "calendar_id" "text" DEFAULT 'primary'::"text" NOT NULL,
    "expiration" timestamp with time zone NOT NULL,
    "sync_token" "text",
    "last_notification_at" timestamp with time zone,
    "notification_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    CONSTRAINT "calendar_watch_channels_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'stopped'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."calendar_watch_channels" OWNER TO "postgres";


COMMENT ON TABLE "public"."calendar_watch_channels" IS 'Tracks Google Calendar push notification subscriptions. Set up pg_cron jobs for auto-renewal.';



CREATE TABLE IF NOT EXISTS "public"."campaign_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "attribution_type" "text" DEFAULT 'influenced'::"text" NOT NULL,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "campaign_contacts_attribution_type_check" CHECK (("attribution_type" = ANY (ARRAY['first_touch'::"text", 'last_touch'::"text", 'influenced'::"text"])))
);


ALTER TABLE "public"."campaign_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_deals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "attribution_type" "text" DEFAULT 'influenced'::"text" NOT NULL,
    "attributed_amount" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "campaign_deals_attribution_type_check" CHECK (("attribution_type" = ANY (ARRAY['sourced'::"text", 'influenced'::"text"])))
);


ALTER TABLE "public"."campaign_deals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text",
    "channel" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "start_date" "date",
    "end_date" "date",
    "budget" numeric(12,2),
    "actual_spend" numeric(12,2) DEFAULT 0,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "campaigns_type_check" CHECK (("type" = ANY (ARRAY['email'::"text", 'social'::"text", 'paid_search'::"text", 'paid_social'::"text", 'content'::"text", 'event'::"text", 'webinar'::"text", 'referral'::"text", 'direct_mail'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_context_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "organization_id" "uuid",
    "user_id" "uuid",
    "context_type" "text" NOT NULL,
    "context_data" "jsonb" NOT NULL,
    "relevance_score" numeric(3,2) DEFAULT 1.0,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_context_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_intent_patterns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "pattern_name" "text" NOT NULL,
    "pattern_regex" "text",
    "keywords" "text"[],
    "intent_type" "text" NOT NULL,
    "entity_type" "text",
    "confidence_threshold" numeric(3,2) DEFAULT 0.7,
    "is_active" boolean DEFAULT true,
    "success_rate" numeric(3,2),
    "usage_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."chat_intent_patterns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "message_type" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "extracted_entities" "jsonb" DEFAULT '{}'::"jsonb",
    "data_queries" "jsonb" DEFAULT '{}'::"jsonb",
    "action_items" "text"[],
    "query_results" "jsonb" DEFAULT '{}'::"jsonb",
    "processing_status" "text" DEFAULT 'pending'::"text",
    "intent_type" "text",
    "confidence_score" numeric(3,2),
    "context_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "resolved_references" "jsonb" DEFAULT '{}'::"jsonb",
    "attached_file_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    CONSTRAINT "chat_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['user'::"text", 'assistant'::"text", 'system'::"text"]))),
    CONSTRAINT "chat_messages_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'processed'::"text", 'completed'::"text", 'failed'::"text"])))
);

ALTER TABLE ONLY "public"."chat_messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chat_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_pending_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "organization_id" "uuid",
    "action_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:10:00'::interval),
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_action_type" CHECK (("action_type" = ANY (ARRAY['confirm_enrichment'::"text", 'confirm_delete'::"text", 'confirm_update'::"text", 'multi_choice'::"text"])))
);


ALTER TABLE "public"."chat_pending_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chat_response_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "query_hash" "text" NOT NULL,
    "query_text" "text",
    "response_payload" "jsonb" NOT NULL,
    "cache_type" "text" DEFAULT 'read_only_response'::"text" NOT NULL,
    "tool_names" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hit_count" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_accessed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."chat_response_cache" OWNER TO "postgres";


COMMENT ON TABLE "public"."chat_response_cache" IS 'Short-TTL cached responses for read-only chat queries.';



CREATE TABLE IF NOT EXISTS "public"."chat_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "title" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "active_context" "jsonb" DEFAULT '{}'::"jsonb",
    "context_stack" "jsonb"[] DEFAULT ARRAY[]::"jsonb"[],
    "conversation_state" "public"."conversation_state_enum" DEFAULT 'IDLE'::"public"."conversation_state_enum" NOT NULL,
    "awaiting_context" "jsonb" DEFAULT '{}'::"jsonb",
    "search_attempt_count" integer DEFAULT 0,
    "entity_context" "jsonb",
    "pending_extraction" "jsonb",
    "pending_extraction_at" timestamp with time zone,
    "pending_deal_creation" "jsonb",
    "pending_deal_creation_at" timestamp with time zone,
    "pending_coaching_tasks" "jsonb",
    "pending_contact_creation" "jsonb",
    "pending_contact_creation_at" timestamp with time zone,
    "pending_scheduling" "jsonb",
    "pending_scheduling_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."chat_sessions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."chat_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."chat_sessions"."conversation_state" IS 'Current conversation state for multi-turn interactions. IDLE = normal processing, other states = waiting for specific user input.';



COMMENT ON COLUMN "public"."chat_sessions"."awaiting_context" IS 'Partial entity data being collected during multi-turn conversations (e.g., account details being gathered).';



COMMENT ON COLUMN "public"."chat_sessions"."entity_context" IS 'Stores recent CRM entity references for pronoun resolution.
Structure: {
  referencedEntities: { deals: [...], accounts: [...], contacts: [...] },
  primaryEntity: { id, name, type },
  updatedAt: timestamp
}
Max 5 entities per type, auto-expires after 24 hours.';



COMMENT ON COLUMN "public"."chat_sessions"."pending_extraction" IS 'Stores extraction awaiting user confirmation for batch save';



COMMENT ON COLUMN "public"."chat_sessions"."pending_extraction_at" IS 'Timestamp when extraction was created, used for expiry checking';



COMMENT ON COLUMN "public"."chat_sessions"."pending_coaching_tasks" IS 'Stores coaching-recommended tasks so user can select by typing a number (1-4)';



CREATE TABLE IF NOT EXISTS "public"."client_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "memory" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "fact_count" integer DEFAULT 0 NOT NULL,
    "last_encoded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_analyzed_at" timestamp with time zone,
    "last_compacted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."client_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."commission_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "deal_amount" numeric DEFAULT 0 NOT NULL,
    "commission_rate" numeric DEFAULT 0 NOT NULL,
    "commission_earned" numeric DEFAULT 0 NOT NULL,
    "status" "public"."commission_status" DEFAULT 'pending'::"public"."commission_status" NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."commission_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "company_name" "text" NOT NULL,
    "tagline" "text",
    "industry" "text",
    "website_url" "text",
    "value_proposition" "text",
    "elevator_pitch" "text",
    "boilerplate_about" "text",
    "products_services" "jsonb" DEFAULT '[]'::"jsonb",
    "differentiators" "text"[] DEFAULT '{}'::"text"[],
    "target_personas" "jsonb" DEFAULT '[]'::"jsonb",
    "proof_points" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "updated_by" "uuid"
);


ALTER TABLE "public"."company_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."company_profiles" IS 'Organization GTM messaging and identity for AI-powered features';



COMMENT ON COLUMN "public"."company_profiles"."value_proposition" IS 'Core value proposition (2-3 sentences)';



COMMENT ON COLUMN "public"."company_profiles"."elevator_pitch" IS 'Concise 30-second pitch';



COMMENT ON COLUMN "public"."company_profiles"."products_services" IS 'JSON array of products with name, description, features';



COMMENT ON COLUMN "public"."company_profiles"."differentiators" IS 'Key competitive advantages';



COMMENT ON COLUMN "public"."company_profiles"."proof_points" IS 'Social proof: stats, customer quotes, logos';



CREATE TABLE IF NOT EXISTS "public"."compensation_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_commission_rate" numeric DEFAULT 0.05 NOT NULL,
    "tiers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "bonus_criteria" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."compensation_plans" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contacts_contact_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contacts_contact_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contacts_contact_number_seq" OWNED BY "public"."contacts"."contact_number";



CREATE TABLE IF NOT EXISTS "public"."organization_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_active" boolean DEFAULT true,
    "sales_role" "text" DEFAULT 'ae'::"text",
    "sales_role_status" "text" DEFAULT 'approved'::"text",
    "sales_role_updated_by" "uuid",
    CONSTRAINT "organization_members_sales_role_check" CHECK (("sales_role" = ANY (ARRAY['sdr'::"text", 'ae'::"text", 'manager'::"text", 'revops'::"text", 'marketing'::"text", 'product'::"text"]))),
    CONSTRAINT "organization_members_sales_role_status_check" CHECK (("sales_role_status" = ANY (ARRAY['pending'::"text", 'approved'::"text"])))
);


ALTER TABLE "public"."organization_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "description" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'open'::"text",
    "due_date" "date",
    "completed" boolean DEFAULT false,
    "contact_id" "uuid",
    "account_id" "uuid",
    "deal_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "organization_id" "uuid",
    "assigned_to" "uuid",
    "title" "text" DEFAULT 'Untitled Task'::"text" NOT NULL,
    "task_number" integer NOT NULL,
    "version" integer DEFAULT 1,
    "google_event_id" "text",
    "calendar_synced_at" timestamp with time zone,
    "source_document_id" "uuid"
);

ALTER TABLE ONLY "public"."tasks" REPLICA IDENTITY FULL;


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."crm_dashboard_stats" WITH ("security_invoker"='on') AS
 SELECT "om"."organization_id",
    "count"(DISTINCT "c"."id") AS "total_contacts",
    "count"(DISTINCT "d"."id") AS "total_deals",
    "count"(DISTINCT "a"."id") AS "total_activities",
    "count"(DISTINCT "t"."id") AS "total_tasks",
    COALESCE("sum"("d"."amount"), (0)::numeric) AS "total_deal_value",
    "count"(DISTINCT
        CASE
            WHEN ("a"."created_at" > (CURRENT_TIMESTAMP - '7 days'::interval)) THEN "a"."id"
            ELSE NULL::"uuid"
        END) AS "recent_activities",
    "count"(DISTINCT
        CASE
            WHEN ("d"."stage" = 'won'::"text") THEN "d"."id"
            ELSE NULL::"uuid"
        END) AS "won_deals",
    "count"(DISTINCT
        CASE
            WHEN (("t"."completed" = false) AND ("t"."due_date" < CURRENT_DATE)) THEN "t"."id"
            ELSE NULL::"uuid"
        END) AS "overdue_tasks",
    "avg"("d"."amount") AS "avg_deal_value",
    "count"(DISTINCT
        CASE
            WHEN ("d"."stage" = ANY (ARRAY['prospecting'::"text", 'qualification'::"text", 'proposal'::"text"])) THEN "d"."id"
            ELSE NULL::"uuid"
        END) AS "active_deals"
   FROM (((("public"."organization_members" "om"
     LEFT JOIN "public"."contacts" "c" ON (("c"."organization_id" = "om"."organization_id")))
     LEFT JOIN "public"."deals" "d" ON (("d"."organization_id" = "om"."organization_id")))
     LEFT JOIN "public"."activities" "a" ON (("a"."organization_id" = "om"."organization_id")))
     LEFT JOIN "public"."tasks" "t" ON (("t"."organization_id" = "om"."organization_id")))
  WHERE ("om"."is_active" = true)
  GROUP BY "om"."organization_id";


ALTER TABLE "public"."crm_dashboard_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."custom_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_role" "text" DEFAULT 'user'::"text",
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "territory_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "product_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "vertical_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "custom_roles_base_role_check" CHECK (("base_role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."custom_roles" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."customer_engagement_mv" AS
 WITH "engagement_data" AS (
         SELECT "c"."id" AS "contact_id",
            "c"."organization_id",
            "c"."created_at" AS "customer_since",
            "count"(DISTINCT "a"."id") AS "total_activities",
            "count"(DISTINCT
                CASE
                    WHEN ("a"."created_at" > (CURRENT_DATE - '30 days'::interval)) THEN "a"."id"
                    ELSE NULL::"uuid"
                END) AS "recent_activities",
            "count"(DISTINCT
                CASE
                    WHEN ("a"."created_at" > (CURRENT_DATE - '90 days'::interval)) THEN "a"."id"
                    ELSE NULL::"uuid"
                END) AS "quarterly_activities",
            "max"("a"."created_at") AS "last_activity_date",
            "count"(DISTINCT "d"."id") AS "total_deals",
            "sum"(
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "lifetime_value",
            "avg"(
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                    ELSE NULL::numeric
                END) AS "avg_deal_value",
            (EXTRACT(epoch FROM (CURRENT_TIMESTAMP - "max"("a"."created_at"))) / (86400)::numeric) AS "days_since_last_activity",
                CASE
                    WHEN ("count"(DISTINCT
                    CASE
                        WHEN ("a"."created_at" > (CURRENT_DATE - '30 days'::interval)) THEN "a"."id"
                        ELSE NULL::"uuid"
                    END) >= 5) THEN 'highly_engaged'::"text"
                    WHEN ("count"(DISTINCT
                    CASE
                        WHEN ("a"."created_at" > (CURRENT_DATE - '30 days'::interval)) THEN "a"."id"
                        ELSE NULL::"uuid"
                    END) >= 2) THEN 'engaged'::"text"
                    WHEN ("count"(DISTINCT
                    CASE
                        WHEN ("a"."created_at" > (CURRENT_DATE - '90 days'::interval)) THEN "a"."id"
                        ELSE NULL::"uuid"
                    END) >= 1) THEN 'low_engagement'::"text"
                    ELSE 'dormant'::"text"
                END AS "engagement_level",
                CASE
                    WHEN ((EXTRACT(epoch FROM (CURRENT_TIMESTAMP - "max"("a"."created_at"))) / (86400)::numeric) > (60)::numeric) THEN 'high'::"text"
                    WHEN ((EXTRACT(epoch FROM (CURRENT_TIMESTAMP - "max"("a"."created_at"))) / (86400)::numeric) > (30)::numeric) THEN 'medium'::"text"
                    ELSE 'low'::"text"
                END AS "churn_risk"
           FROM (("public"."contacts" "c"
             LEFT JOIN "public"."activities" "a" ON (("c"."id" = "a"."contact_id")))
             LEFT JOIN "public"."deals" "d" ON (("c"."id" = "d"."contact_id")))
          GROUP BY "c"."id", "c"."organization_id", "c"."created_at"
        )
 SELECT "engagement_data"."contact_id",
    "engagement_data"."organization_id",
    "engagement_data"."customer_since",
    "engagement_data"."total_activities",
    "engagement_data"."recent_activities",
    "engagement_data"."quarterly_activities",
    "engagement_data"."last_activity_date",
    "engagement_data"."total_deals",
    "engagement_data"."lifetime_value",
    "engagement_data"."avg_deal_value",
    "engagement_data"."days_since_last_activity",
    "engagement_data"."engagement_level",
    "engagement_data"."churn_risk"
   FROM "engagement_data"
  WITH NO DATA;


ALTER TABLE "public"."customer_engagement_mv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_briefings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "briefing_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "momentum" "jsonb" DEFAULT '{}'::"jsonb",
    "priority_play" "jsonb",
    "available_plays" "jsonb" DEFAULT '[]'::"jsonb",
    "in_motion" "jsonb" DEFAULT '[]'::"jsonb",
    "todays_meetings" "jsonb" DEFAULT '[]'::"jsonb",
    "deals_moved_forward" integer DEFAULT 0,
    "pipeline_change_amount" numeric(12,2) DEFAULT 0,
    "quota_percentage" numeric(5,2) DEFAULT 0,
    "plays_available_count" integer DEFAULT 0,
    "generated_at" timestamp with time zone DEFAULT "now"(),
    "generation_time_ms" integer,
    "llm_model" "text",
    "token_count" integer,
    "viewed_at" timestamp with time zone,
    "priority_play_actioned" boolean DEFAULT false,
    "plays_actioned" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."daily_briefings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."data_quality_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "overall_score" integer DEFAULT 0,
    "grade" "text" DEFAULT 'Needs Improvement'::"text",
    "metrics_data" "jsonb" DEFAULT '{}'::"jsonb",
    "analyzed_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "data_quality_metrics_grade_check" CHECK (("grade" = ANY (ARRAY['Excellent'::"text", 'Good'::"text", 'Fair'::"text", 'Needs Improvement'::"text"])))
);


ALTER TABLE "public"."data_quality_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_type" "text",
    "file_size" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "source_document_id" "uuid"
);


ALTER TABLE "public"."deal_attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_contact_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_contact_id" "uuid",
    "deal_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "support_axis" numeric(3,2),
    "influence_axis" numeric(3,2),
    "quadrant" "text",
    "change_type" "text" NOT NULL,
    "changed_by" "uuid",
    "change_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "deal_contact_history_change_type_check" CHECK (("change_type" = ANY (ARRAY['created'::"text", 'ranking_updated'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."deal_contact_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "support_axis" numeric(3,2),
    "influence_axis" numeric(3,2),
    "quadrant" "text",
    "role_in_deal" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "deal_contacts_influence_axis_check" CHECK ((("influence_axis" >= ('-1'::integer)::numeric) AND ("influence_axis" <= (1)::numeric))),
    CONSTRAINT "deal_contacts_quadrant_check" CHECK (("quadrant" = ANY (ARRAY['champion_influential'::"text", 'champion_peripheral'::"text", 'adversarial_influential'::"text", 'adversarial_peripheral'::"text"]))),
    CONSTRAINT "deal_contacts_role_in_deal_check" CHECK (("role_in_deal" = ANY (ARRAY['decision_maker'::"text", 'influencer'::"text", 'gatekeeper'::"text", 'user'::"text", 'champion'::"text", 'blocker'::"text", 'technical_buyer'::"text", 'economic_buyer'::"text"]))),
    CONSTRAINT "deal_contacts_support_axis_check" CHECK ((("support_axis" >= ('-1'::integer)::numeric) AND ("support_axis" <= (1)::numeric)))
);


ALTER TABLE "public"."deal_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_feature_gaps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "feature_id" "uuid",
    "feature_name" "text" NOT NULL,
    "impact_level" "text" DEFAULT 'medium'::"text",
    "was_dealbreaker" boolean DEFAULT false,
    "attributed_amount" numeric(12,2),
    "prospect_feedback" "text",
    "workaround_offered" "text",
    "workaround_rejected_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."deal_feature_gaps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "content" "text" NOT NULL,
    "note_type" "text" DEFAULT 'general'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "source_document_id" "uuid",
    "meeting_date" "date"
);


ALTER TABLE "public"."deal_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deal_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "deal_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contract_type" "text" DEFAULT 'one_time'::"text" NOT NULL,
    "contract_start_date" "date",
    "contract_end_date" "date",
    "contract_duration_months" integer,
    "auto_renew" boolean DEFAULT false NOT NULL,
    "renewal_notice_days" integer DEFAULT 90 NOT NULL,
    "renewal_status" "text" DEFAULT 'not_due'::"text" NOT NULL,
    "renewal_owner_id" "uuid",
    "renewal_notes" "text",
    "next_qbr_date" "date",
    "qbr_frequency_months" integer DEFAULT 3 NOT NULL,
    "last_qbr_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deal_terms" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."deals_deal_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."deals_deal_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."deals_deal_number_seq" OWNED BY "public"."deals"."deal_number";



CREATE TABLE IF NOT EXISTS "public"."decision_traces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "session_id" "uuid",
    "channel" "text",
    "tool_name" "text" NOT NULL,
    "tool_args" "jsonb" DEFAULT '{}'::"jsonb",
    "result_summary" "text",
    "result_status" "text" DEFAULT 'success'::"text" NOT NULL,
    "execution_time_ms" integer,
    "error_message" "text",
    "preceding_tool" "text",
    "entities_affected" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "decision_traces_result_status_check" CHECK (("result_status" = ANY (ARRAY['success'::"text", 'error'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."decision_traces" OWNER TO "postgres";


COMMENT ON TABLE "public"."decision_traces" IS 'Tool call audit log. Retain 90 days. Cleanup: DELETE FROM decision_traces WHERE created_at < NOW() - INTERVAL ''90 days'';';



CREATE TABLE IF NOT EXISTS "public"."email_engagement_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "total_emails_sent" integer DEFAULT 0,
    "total_emails_received" integer DEFAULT 0,
    "last_email_sent_at" timestamp with time zone,
    "last_email_received_at" timestamp with time zone,
    "avg_gap_days" numeric,
    "stddev_gap_days" numeric,
    "avg_response_hours" numeric,
    "last_30d_sent" integer DEFAULT 0,
    "last_30d_received" integer DEFAULT 0,
    "engagement_score" numeric,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."email_engagement_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_message_id" "text" NOT NULL,
    "provider_thread_id" "text",
    "direction" "text" NOT NULL,
    "from_email" "text" NOT NULL,
    "from_name" "text",
    "to_emails" "text"[],
    "cc_emails" "text"[],
    "subject" "text",
    "snippet" "text",
    "received_at" timestamp with time zone NOT NULL,
    "label_ids" "text"[],
    "has_attachments" boolean DEFAULT false,
    "contact_id" "uuid",
    "account_id" "uuid",
    "deal_id" "uuid",
    "activity_id" "uuid",
    "match_status" "text" DEFAULT 'unmatched'::"text" NOT NULL,
    "match_method" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "email_messages_match_status_check" CHECK (("match_status" = ANY (ARRAY['matched'::"text", 'unmatched'::"text", 'ignored'::"text"]))),
    CONSTRAINT "email_messages_provider_check" CHECK (("provider" = ANY (ARRAY['gmail'::"text", 'outlook'::"text"])))
);


ALTER TABLE "public"."email_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."email_sync_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_email" "text",
    "history_id" "text",
    "last_full_sync_at" timestamp with time zone,
    "last_incremental_sync_at" timestamp with time zone,
    "sync_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "error_message" "text",
    "messages_synced_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "email_sync_state_provider_check" CHECK (("provider" = ANY (ARRAY['gmail'::"text", 'outlook'::"text"]))),
    CONSTRAINT "email_sync_state_sync_status_check" CHECK (("sync_status" = ANY (ARRAY['active'::"text", 'paused'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."email_sync_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."embeddings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "content_text" "text" NOT NULL,
    "content_hash" "text" NOT NULL,
    "embedding" "public"."vector"(1536) NOT NULL,
    "model_used" "text" DEFAULT 'text-embedding-3-small'::"text" NOT NULL,
    "token_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "embeddings_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['source_document'::"text", 'activity'::"text", 'deal_note'::"text", 'chat_message'::"text", 'account'::"text", 'contact'::"text", 'deal'::"text", 'client_memory'::"text", 'task'::"text"])))
);


ALTER TABLE "public"."embeddings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrichment_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "provider_key" "text" NOT NULL,
    "request_type" "text" NOT NULL,
    "lookup_value" "text" NOT NULL,
    "success" boolean NOT NULL,
    "response_data" "jsonb",
    "raw_response" "jsonb",
    "error_message" "text",
    "response_time_ms" integer,
    "fit_score_delta" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enrichment_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrichment_provider_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "provider_definition_id" "uuid" NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true,
    "priority" integer DEFAULT 100,
    "monthly_quota" integer,
    "requests_this_month" integer DEFAULT 0,
    "quota_reset_at" timestamp with time zone,
    "config_overrides" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enrichment_provider_configs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."enrichment_provider_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider_key" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "is_system_default" boolean DEFAULT false,
    "created_by_org" "uuid",
    "api_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "response_mapping" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "fit_scoring_rules" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_mapping" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."enrichment_provider_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_name" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "display_name_plural" "text" NOT NULL,
    "primary_key" "text" DEFAULT 'id'::"text" NOT NULL,
    "description" "text",
    "icon" "text",
    "organization_id" "uuid",
    "query_config" "jsonb" DEFAULT '{"pageSize": 25, "defaultSort": "created_at", "searchFields": [], "defaultSortDirection": "desc"}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entity_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_definition_id" "uuid" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_list_field" boolean DEFAULT false NOT NULL,
    "is_form_field" boolean DEFAULT false NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "is_searchable" boolean DEFAULT false NOT NULL,
    "width" "text",
    "placeholder" "text",
    "options" "jsonb",
    "validation" "jsonb",
    "default_value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "position" integer DEFAULT 0
);


ALTER TABLE "public"."entity_fields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "user_id" "uuid",
    "organization_id" "uuid",
    "channel" "text" NOT NULL,
    "channel_message_id" "text",
    "direction" "text" NOT NULL,
    "content" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text",
    "media_url" "text",
    "intent_detected" "text",
    "entities_extracted" "jsonb",
    "tool_calls_made" "jsonb",
    "processing_time_ms" integer,
    "status" "text" DEFAULT 'pending'::"text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "failed_at" timestamp with time zone,
    "error_message" "text",
    "retry_count" integer DEFAULT 0,
    "next_retry_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_log_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."message_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messaging_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "channel_user_id" "text" NOT NULL,
    "context_entity_type" "text",
    "context_entity_id" "uuid",
    "conversation_history" "jsonb" DEFAULT '[]'::"jsonb",
    "last_message_at" timestamp with time zone DEFAULT "now"(),
    "session_expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "entity_context" "jsonb",
    "pending_deal_creation" "jsonb",
    "pending_deal_creation_at" timestamp with time zone,
    "pending_extraction" "jsonb",
    "pending_extraction_at" timestamp with time zone,
    "pending_coaching_tasks" "jsonb",
    "pending_contact_creation" "jsonb",
    "pending_contact_creation_at" timestamp with time zone,
    "pending_scheduling" "jsonb",
    "pending_scheduling_at" timestamp with time zone
);


ALTER TABLE "public"."messaging_sessions" OWNER TO "postgres";


COMMENT ON COLUMN "public"."messaging_sessions"."entity_context" IS 'Full entity context from unified-chat for cross-message pronoun resolution.
Structure: {
  referencedEntities: { deals: [...], accounts: [...], contacts: [...] },
  primaryEntity: { id, name, type },
  updatedAt: timestamp
}
Passed back to unified-chat on each subsequent message in the session.';



COMMENT ON COLUMN "public"."messaging_sessions"."pending_extraction" IS 'Stores raw LLM extraction JSON while awaiting user confirmation via WhatsApp/SMS';



COMMENT ON COLUMN "public"."messaging_sessions"."pending_extraction_at" IS 'Timestamp when pending_extraction was stored; used for 10-minute expiry check';



COMMENT ON COLUMN "public"."messaging_sessions"."pending_coaching_tasks" IS 'Stores coaching-recommended tasks so user can select by typing a number (1-4)';



CREATE OR REPLACE VIEW "public"."entity_messages_unified" AS
 SELECT "cm"."id",
    'chat_messages'::"text" AS "source_table",
    'chat'::"text" AS "channel",
        CASE "cm"."message_type"
            WHEN 'user'::"text" THEN 'outbound'::"text"
            WHEN 'assistant'::"text" THEN 'inbound'::"text"
            ELSE "cm"."message_type"
        END AS "direction",
    "left"("cm"."content", 300) AS "content_preview",
    "cm"."message_type" AS "sender_type",
    "cm"."created_at" AS "timestamp",
    "cs"."organization_id",
    ("cs"."active_context" ->> 'entityType'::"text") AS "entity_type",
    (("cs"."active_context" ->> 'entityId'::"text"))::"uuid" AS "entity_id"
   FROM ("public"."chat_messages" "cm"
     JOIN "public"."chat_sessions" "cs" ON (("cs"."id" = "cm"."session_id")))
  WHERE (("cs"."active_context" IS NOT NULL) AND (("cs"."active_context" ->> 'entityId'::"text") IS NOT NULL))
UNION ALL
 SELECT "ml"."id",
    'message_log'::"text" AS "source_table",
    "ml"."channel",
    "ml"."direction",
    "left"("ml"."content", 300) AS "content_preview",
    "ml"."direction" AS "sender_type",
    COALESCE("ml"."sent_at", "ml"."created_at") AS "timestamp",
    "ml"."organization_id",
    "ms"."context_entity_type" AS "entity_type",
    "ms"."context_entity_id" AS "entity_id"
   FROM ("public"."message_log" "ml"
     JOIN "public"."messaging_sessions" "ms" ON (("ms"."id" = "ml"."session_id")))
  WHERE (("ms"."context_entity_type" IS NOT NULL) AND ("ms"."context_entity_id" IS NOT NULL))
UNION ALL
 SELECT "a"."id",
    'activities'::"text" AS "source_table",
    "a"."type" AS "channel",
    'outbound'::"text" AS "direction",
    "left"("a"."description", 300) AS "content_preview",
    'user'::"text" AS "sender_type",
    COALESCE("a"."scheduled_at", "a"."created_at") AS "timestamp",
    "a"."organization_id",
    'deal'::"text" AS "entity_type",
    "a"."deal_id" AS "entity_id"
   FROM "public"."activities" "a"
  WHERE (("a"."type" = ANY (ARRAY['email'::"text", 'call'::"text"])) AND ("a"."deal_id" IS NOT NULL))
UNION ALL
 SELECT "a"."id",
    'activities'::"text" AS "source_table",
    "a"."type" AS "channel",
    'outbound'::"text" AS "direction",
    "left"("a"."description", 300) AS "content_preview",
    'user'::"text" AS "sender_type",
    COALESCE("a"."scheduled_at", "a"."created_at") AS "timestamp",
    "a"."organization_id",
    'contact'::"text" AS "entity_type",
    "a"."contact_id" AS "entity_id"
   FROM "public"."activities" "a"
  WHERE (("a"."type" = ANY (ARRAY['email'::"text", 'call'::"text"])) AND ("a"."contact_id" IS NOT NULL) AND ("a"."deal_id" IS NULL))
UNION ALL
 SELECT "a"."id",
    'activities'::"text" AS "source_table",
    "a"."type" AS "channel",
    'outbound'::"text" AS "direction",
    "left"("a"."description", 300) AS "content_preview",
    'user'::"text" AS "sender_type",
    COALESCE("a"."scheduled_at", "a"."created_at") AS "timestamp",
    "a"."organization_id",
    'account'::"text" AS "entity_type",
    "a"."account_id" AS "entity_id"
   FROM "public"."activities" "a"
  WHERE (("a"."type" = ANY (ARRAY['email'::"text", 'call'::"text"])) AND ("a"."account_id" IS NOT NULL) AND ("a"."deal_id" IS NULL) AND ("a"."contact_id" IS NULL));


ALTER TABLE "public"."entity_messages_unified" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_definition_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "can_view" boolean DEFAULT true NOT NULL,
    "can_create" boolean DEFAULT false NOT NULL,
    "can_update" boolean DEFAULT false NOT NULL,
    "can_delete" boolean DEFAULT false NOT NULL,
    "can_export" boolean DEFAULT false NOT NULL,
    "can_bulk_edit" boolean DEFAULT false NOT NULL,
    "field_restrictions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entity_permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_references" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "reference_text" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "reference_type" "text" NOT NULL,
    "confidence_score" numeric(3,2) DEFAULT 1.0,
    "usage_count" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."entity_references" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "tag" "text" NOT NULL,
    "tag_category" "text" DEFAULT 'user'::"text" NOT NULL,
    "confidence" numeric(3,2),
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "entity_tags_confidence_check" CHECK ((("confidence" IS NULL) OR (("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))),
    CONSTRAINT "entity_tags_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['contact'::"text", 'account'::"text", 'deal'::"text", 'activity'::"text", 'task'::"text", 'source_document'::"text"]))),
    CONSTRAINT "entity_tags_tag_category_check" CHECK (("tag_category" = ANY (ARRAY['user'::"text", 'system'::"text", 'ai'::"text"])))
);


ALTER TABLE "public"."entity_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."extraction_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_document_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "extraction_json" "jsonb" NOT NULL,
    "extraction_version" "text" DEFAULT 'v1'::"text",
    "entities_created" "jsonb" DEFAULT '{}'::"jsonb",
    "confidence_overall" numeric,
    "model_used" "text",
    "processing_time_ms" integer,
    "review_status" "text" DEFAULT 'auto_saved'::"text",
    "user_modifications" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "extraction_records_review_status_check" CHECK (("review_status" = ANY (ARRAY['pending_review'::"text", 'auto_saved'::"text", 'user_confirmed'::"text", 'user_modified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."extraction_records" OWNER TO "postgres";




CREATE TABLE IF NOT EXISTS "public"."feature_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_deal_id" "uuid",
    "source_account_id" "uuid",
    "source_contact_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "total_opportunity_value" numeric(12,2) DEFAULT 0,
    "request_count" integer DEFAULT 1,
    "status" "text" DEFAULT 'new'::"text",
    "linked_feature_id" "uuid",
    "priority_score" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."feature_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."file_extraction_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uploaded_file_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "source_row" integer,
    "extracted_data" "jsonb" NOT NULL,
    "normalized_data" "jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "error_message" "text",
    "duplicate_of" "uuid",
    "confidence_score" numeric(3,2) DEFAULT 0.0,
    "data_completeness" numeric(3,2) DEFAULT 0.0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "file_extraction_log_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'created'::"text", 'duplicate'::"text", 'failed'::"text", 'skipped'::"text"])))
);


ALTER TABLE "public"."file_extraction_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_presentations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_id" "uuid",
    "generation_mode" "public"."slide_generation_mode" DEFAULT 'template_based'::"public"."slide_generation_mode" NOT NULL,
    "personalization_level" "public"."slide_personalization_level" DEFAULT 'account'::"public"."slide_personalization_level" NOT NULL,
    "account_id" "uuid",
    "deal_id" "uuid",
    "contact_id" "uuid",
    "storage_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "slot_values_used" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_calls_made" "jsonb" DEFAULT '[]'::"jsonb",
    "generation_time_ms" integer,
    "version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "content_path" "text",
    "output_path" "text",
    "thumbnail_path" "text",
    "generation_config" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "generated_presentations_status_check" CHECK (("status" = ANY (ARRAY['generating'::"text", 'draft'::"text", 'ready'::"text", 'failed'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."generated_presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."google_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "refresh_token" "text" NOT NULL,
    "access_token" "text",
    "expires_at" timestamp with time zone,
    "scopes" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."google_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intervention_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "suggested_action_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "snapshot_before" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "snapshot_after" "jsonb",
    "outcome_type" "text",
    "outcome_signal" "text",
    "outcome_delta" "jsonb",
    "action_taken_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "measured_at" timestamp with time zone,
    "measurement_window_days" integer DEFAULT 14 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "intervention_outcomes_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['deal'::"text", 'contact'::"text", 'account'::"text", 'task'::"text", 'activity'::"text"]))),
    CONSTRAINT "intervention_outcomes_outcome_type_check" CHECK (("outcome_type" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text"])))
);


ALTER TABLE "public"."intervention_outcomes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitation_rate_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "invitations_sent" integer DEFAULT 0,
    "last_invitation_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invitation_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "demographic_score" integer DEFAULT 0,
    "behavioral_score" integer DEFAULT 0,
    "company_score" integer DEFAULT 0,
    "total_score" integer DEFAULT 0,
    "score_grade" "text" DEFAULT 'F'::"text",
    "score_breakdown" "jsonb" DEFAULT '{}'::"jsonb",
    "last_calculated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_scores_score_grade_check" CHECK (("score_grade" = ANY (ARRAY['A+'::"text", 'A'::"text", 'B+'::"text", 'B'::"text", 'C+'::"text", 'C'::"text", 'D'::"text", 'F'::"text"])))
);


ALTER TABLE "public"."lead_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lead_scoring_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "rule_name" "text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "field_name" "text" NOT NULL,
    "field_value" "text",
    "score_points" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_scoring_rules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['demographic'::"text", 'behavioral'::"text", 'company'::"text"])))
);


ALTER TABLE "public"."lead_scoring_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ltv_benchmarks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "segment_type" "text" NOT NULL,
    "segment_value" "text" NOT NULL,
    "avg_ltv" numeric(12,2),
    "median_ltv" numeric(12,2),
    "avg_contract_length_months" integer,
    "avg_deal_size" numeric(12,2),
    "churn_rate" numeric(5,4),
    "expansion_rate" numeric(5,4),
    "sample_size" integer DEFAULT 0,
    "last_calculated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ltv_benchmarks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "name" "text" NOT NULL,
    "template_sid" "text",
    "category" "text" NOT NULL,
    "body_template" "text" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "notification_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "data" "jsonb",
    "channel" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "requires_template" boolean DEFAULT false,
    "template_id" "uuid",
    "scheduled_for" timestamp with time zone DEFAULT "now"(),
    "sent_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_custom_skills" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "skill_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "description" "text" NOT NULL,
    "instructions" "text" NOT NULL,
    "parameters" "jsonb" DEFAULT '[]'::"jsonb",
    "trigger_examples" "jsonb" DEFAULT '[]'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "cache_version" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "organization_custom_skills_description_check" CHECK (("char_length"("description") <= 500)),
    CONSTRAINT "organization_custom_skills_display_name_check" CHECK (("char_length"("display_name") <= 100)),
    CONSTRAINT "organization_custom_skills_instructions_check" CHECK (("char_length"("instructions") <= 5000)),
    CONSTRAINT "organization_custom_skills_skill_name_check" CHECK (("skill_name" ~ '^[a-z][a-z0-9_]*$'::"text")),
    CONSTRAINT "organization_custom_skills_skill_name_check1" CHECK ((("char_length"("skill_name") >= 2) AND ("char_length"("skill_name") <= 50)))
);


ALTER TABLE "public"."organization_custom_skills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "invited_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "invite_code" "text",
    "invite_code_hash" "text"
);


ALTER TABLE "public"."organization_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_join_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_domain" "text" NOT NULL,
    "user_name" "text",
    "requested_role" "text" DEFAULT 'member'::"text" NOT NULL,
    "message" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "attempts_count" integer DEFAULT 1,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "admin_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    CONSTRAINT "organization_join_requests_attempts_count_check" CHECK (("attempts_count" <= 5)),
    CONSTRAINT "organization_join_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."organization_join_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_security_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "user_email" "text" NOT NULL,
    "user_domain" "text" NOT NULL,
    "admin_user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_security_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organization_tracking_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "allowed_domains" "text"[] DEFAULT '{}'::"text"[],
    "tracking_enabled" boolean DEFAULT true,
    "data_retention_days" integer DEFAULT 90,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_tracking_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "domain" "text",
    "industry" "text",
    "company_size" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "is_active" boolean DEFAULT true,
    "is_demo" boolean DEFAULT false,
    "demo_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "allowed_domains" "text"[] DEFAULT '{}'::"text"[],
    "domain_aliases" "text"[] DEFAULT '{}'::"text"[],
    "auto_approve_domains" boolean DEFAULT false,
    "signup_locked" boolean DEFAULT false,
    "signup_locked_reason" "text",
    "environment_domains" "jsonb" DEFAULT '{}'::"jsonb",
    "accept_external_requests" boolean DEFAULT false,
    "allow_public_domains" boolean DEFAULT false,
    "require_admin_approval" boolean DEFAULT true,
    "max_auto_approvals_per_day" integer DEFAULT 50,
    "sso_required" boolean DEFAULT false,
    "ip_whitelist" "inet"[],
    "auto_join_enabled" boolean DEFAULT false
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "probability" integer DEFAULT 0,
    "position" integer DEFAULT 0,
    "is_closed" boolean DEFAULT false,
    "is_won" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_velocity_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "stage_name" "text" NOT NULL,
    "avg_days" integer DEFAULT 0,
    "conversion_rate" numeric(5,2) DEFAULT 0.00,
    "deal_count" integer DEFAULT 0,
    "velocity_data" "jsonb" DEFAULT '{}'::"jsonb",
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pipeline_velocity_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_admins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'platform_admin'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "is_active" boolean DEFAULT true
);


ALTER TABLE "public"."platform_admins" OWNER TO "postgres";




CREATE TABLE IF NOT EXISTS "public"."proactive_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "max_actions_per_day" integer DEFAULT 10 NOT NULL,
    "max_critical_per_day" integer DEFAULT 3 NOT NULL,
    "cooldown_after_dismiss_hours" integer DEFAULT 4 NOT NULL,
    "min_confidence" numeric(3,2) DEFAULT 0.50 NOT NULL,
    "role_urgency_overrides" "jsonb" DEFAULT '{}'::"jsonb",
    "quiet_hours_enabled" boolean DEFAULT false NOT NULL,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "quiet_hours_timezone" "text" DEFAULT 'America/New_York'::"text",
    "default_expiry_days" integer DEFAULT 7 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."proactive_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_features" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "status" "text" DEFAULT 'available'::"text",
    "roadmap_eta" "date",
    "roadmap_priority" "text",
    "is_premium" boolean DEFAULT false,
    "minimum_tier" "text",
    "competitors_with_feature" "text"[],
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."product_features" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."product_gap_insights" AS
 SELECT "dfg"."organization_id",
    "dfg"."feature_name",
    "dfg"."feature_id",
    "pf"."category" AS "feature_category",
    "pf"."status" AS "feature_status",
    "pf"."roadmap_eta",
    "pf"."roadmap_priority",
    "count"(DISTINCT "dfg"."deal_id") AS "deals_affected",
    "count"(DISTINCT "dfg"."deal_id") FILTER (WHERE "dfg"."was_dealbreaker") AS "dealbreaker_count",
    "sum"("dfg"."attributed_amount") AS "total_opportunity_cost",
    "sum"("d"."amount") AS "total_deal_value",
    "avg"("dfg"."attributed_amount") AS "avg_impact_per_deal",
    "array_agg"(DISTINCT "dfg"."impact_level") AS "impact_levels",
    "max"("dfg"."created_at") AS "last_occurrence"
   FROM (("public"."deal_feature_gaps" "dfg"
     LEFT JOIN "public"."product_features" "pf" ON (("dfg"."feature_id" = "pf"."id")))
     LEFT JOIN "public"."deals" "d" ON (("dfg"."deal_id" = "d"."id")))
  WHERE ("d"."stage" = ANY (ARRAY['closed-lost'::"text", 'closed_lost'::"text"]))
  GROUP BY "dfg"."organization_id", "dfg"."feature_name", "dfg"."feature_id", "pf"."category", "pf"."status", "pf"."roadmap_eta", "pf"."roadmap_priority";


ALTER TABLE "public"."product_gap_insights" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "product_name" "text" NOT NULL,
    "product_id" "uuid",
    "deal_id" "uuid",
    "account_id" "uuid",
    "source_document_id" "uuid",
    "extraction_record_id" "uuid",
    "mention_type" "text" DEFAULT 'positioned'::"text" NOT NULL,
    "context_snippet" "text",
    "attributed_amount" numeric,
    "amount_type" "text",
    "customer_requirements" "text"[],
    "meeting_date" "date",
    "mentioned_by" "text",
    "sentiment" "text" DEFAULT 'neutral'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "product_mentions_amount_type_check" CHECK (("amount_type" = ANY (ARRAY['total'::"text", 'annual'::"text", 'monthly'::"text", 'one_time'::"text"]))),
    CONSTRAINT "product_mentions_mention_type_check" CHECK (("mention_type" = ANY (ARRAY['positioned'::"text", 'customer_workload'::"text", 'competitor_product'::"text", 'requirement'::"text"]))),
    CONSTRAINT "product_mentions_sentiment_check" CHECK (("sentiment" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text", 'requirement'::"text"])))
);


ALTER TABLE "public"."product_mentions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."product_mention_summary" AS
 SELECT "pm"."organization_id",
    "pm"."product_name",
    "pm"."mention_type",
    "count"(DISTINCT "pm"."deal_id") AS "deal_count",
    "count"(*) AS "total_mentions",
    COALESCE("sum"("pm"."attributed_amount"), (0)::numeric) AS "total_attributed_revenue",
    "array_agg"(DISTINCT "a"."name") FILTER (WHERE ("a"."name" IS NOT NULL)) AS "accounts",
    "min"("pm"."meeting_date") AS "first_mentioned",
    "max"("pm"."meeting_date") AS "last_mentioned",
    "count"(*) FILTER (WHERE ("pm"."sentiment" = 'positive'::"text")) AS "positive_mentions",
    "count"(*) FILTER (WHERE ("pm"."sentiment" = 'negative'::"text")) AS "negative_mentions"
   FROM ("public"."product_mentions" "pm"
     LEFT JOIN "public"."accounts" "a" ON (("pm"."account_id" = "a"."id")))
  GROUP BY "pm"."organization_id", "pm"."product_name", "pm"."mention_type";


ALTER TABLE "public"."product_mention_summary" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sku" "text",
    "icon" "text",
    "category" "text",
    "pricing_model" "text" DEFAULT 'subscription'::"text",
    "base_price" numeric(12,2),
    "billing_frequency" "text" DEFAULT 'monthly'::"text",
    "pricing_tiers" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'active'::"text",
    "roadmap_eta" "date",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "role" "text" DEFAULT 'user'::"text",
    "territory" "text",
    "department" "text",
    "manager_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "signup_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "onboarding_completed_at" timestamp with time zone,
    "calendar_last_synced_at" timestamp with time zone,
    "calendar_sync_count" integer DEFAULT 0,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'user'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";





COMMENT ON COLUMN "public"."profiles"."onboarding_completed_at" IS 'Timestamp when user completed the onboarding flow (calendar sync)';



COMMENT ON COLUMN "public"."profiles"."calendar_last_synced_at" IS 'Timestamp of last calendar-to-CRM sync';



COMMENT ON COLUMN "public"."profiles"."calendar_sync_count" IS 'Number of times user has synced their calendar';



CREATE TABLE IF NOT EXISTS "public"."prompt_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "approved_by" "uuid" NOT NULL,
    "decision" "text" NOT NULL,
    "comments" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prompt_approvals_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."prompt_approvals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prompt_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "proposed_content" "text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "approved_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "required_approvals" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_content" "text",
    "section_type" "text" DEFAULT 'full_prompt'::"text",
    "justification" "text",
    CONSTRAINT "prompt_change_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."prompt_change_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public_email_domains" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "domain" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."public_email_domains" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."query_accuracy_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "intent" "text" NOT NULL,
    "search_query" "text" NOT NULL,
    "expected_entity_type" "text",
    "result_count" integer DEFAULT 0,
    "exact_match_count" integer DEFAULT 0,
    "similar_match_count" integer DEFAULT 0,
    "user_clicked_result" boolean DEFAULT false,
    "match_score" numeric(3,2),
    "time_to_result_ms" integer,
    "refinement_attempt" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."query_accuracy_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."query_plan_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "query_hash" "text" NOT NULL,
    "query_plan" "jsonb" NOT NULL,
    "hit_count" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_accessed_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."query_plan_cache" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."revenue_analytics_mv" AS
 WITH "revenue_by_period" AS (
         SELECT "d"."organization_id",
            "date_trunc"('day'::"text", ("d"."close_date")::timestamp with time zone) AS "period_day",
            "date_trunc"('week'::"text", ("d"."close_date")::timestamp with time zone) AS "period_week",
            "date_trunc"('month'::"text", ("d"."close_date")::timestamp with time zone) AS "period_month",
            "date_trunc"('quarter'::"text", ("d"."close_date")::timestamp with time zone) AS "period_quarter",
            "date_trunc"('year'::"text", ("d"."close_date")::timestamp with time zone) AS "period_year",
            "d"."stage",
            "d"."assigned_to",
            "c"."company" AS "contact_industry",
            "a"."industry" AS "account_industry",
            "count"(DISTINCT "d"."id") AS "deal_count",
            "sum"("d"."amount") AS "total_revenue",
            "avg"("d"."amount") AS "avg_deal_size",
            "sum"(
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "won_revenue",
            "sum"(
                CASE
                    WHEN ("d"."stage" = 'lost'::"text") THEN "d"."amount"
                    ELSE (0)::numeric
                END) AS "lost_revenue",
            "count"(DISTINCT
                CASE
                    WHEN ("d"."stage" = 'won'::"text") THEN "d"."id"
                    ELSE NULL::"uuid"
                END) AS "won_count",
            "count"(DISTINCT
                CASE
                    WHEN ("d"."stage" = 'lost'::"text") THEN "d"."id"
                    ELSE NULL::"uuid"
                END) AS "lost_count",
            "avg"((EXTRACT(epoch FROM ("d"."updated_at" - "d"."created_at")) / (86400)::numeric)) AS "avg_cycle_days"
           FROM (("public"."deals" "d"
             LEFT JOIN "public"."contacts" "c" ON (("d"."contact_id" = "c"."id")))
             LEFT JOIN "public"."accounts" "a" ON (("d"."account_id" = "a"."id")))
          WHERE ("d"."close_date" IS NOT NULL)
          GROUP BY "d"."organization_id", ("date_trunc"('day'::"text", ("d"."close_date")::timestamp with time zone)), ("date_trunc"('week'::"text", ("d"."close_date")::timestamp with time zone)), ("date_trunc"('month'::"text", ("d"."close_date")::timestamp with time zone)), ("date_trunc"('quarter'::"text", ("d"."close_date")::timestamp with time zone)), ("date_trunc"('year'::"text", ("d"."close_date")::timestamp with time zone)), "d"."stage", "d"."assigned_to", "c"."company", "a"."industry"
        )
 SELECT "revenue_by_period"."organization_id",
    "revenue_by_period"."period_day",
    "revenue_by_period"."period_week",
    "revenue_by_period"."period_month",
    "revenue_by_period"."period_quarter",
    "revenue_by_period"."period_year",
    "revenue_by_period"."stage",
    "revenue_by_period"."assigned_to",
    "revenue_by_period"."contact_industry",
    "revenue_by_period"."account_industry",
    "revenue_by_period"."deal_count",
    "revenue_by_period"."total_revenue",
    "revenue_by_period"."avg_deal_size",
    "revenue_by_period"."won_revenue",
    "revenue_by_period"."lost_revenue",
    "revenue_by_period"."won_count",
    "revenue_by_period"."lost_count",
    "revenue_by_period"."avg_cycle_days"
   FROM "revenue_by_period"
  WITH NO DATA;


ALTER TABLE "public"."revenue_analytics_mv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "permissions_template" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "role_templates_category_check" CHECK (("category" = ANY (ARRAY['overlay'::"text", 'specialist'::"text", 'regional'::"text", 'executive'::"text"])))
);


ALTER TABLE "public"."role_templates" OWNER TO "postgres";


CREATE MATERIALIZED VIEW "public"."sales_activity_analytics_mv" AS
 WITH "activity_metrics" AS (
         SELECT "a"."organization_id",
            "a"."user_id",
            "date_trunc"('day'::"text", "a"."activity_date") AS "activity_day",
            "date_trunc"('week'::"text", "a"."activity_date") AS "activity_week",
            "date_trunc"('month'::"text", "a"."activity_date") AS "activity_month",
            "a"."type" AS "activity_type",
            "d"."stage" AS "deal_stage",
            "d"."amount" AS "deal_amount",
            "count"(DISTINCT "a"."id") AS "activity_count",
            "count"(DISTINCT "a"."contact_id") AS "contacts_touched",
            "count"(DISTINCT "a"."deal_id") AS "deals_touched"
           FROM (("public"."activities" "a"
             LEFT JOIN "public"."deals" "d" ON (("a"."deal_id" = "d"."id")))
             LEFT JOIN "public"."contacts" "c" ON (("a"."contact_id" = "c"."id")))
          WHERE ("a"."activity_date" >= (CURRENT_DATE - '1 year'::interval))
          GROUP BY "a"."organization_id", "a"."user_id", ("date_trunc"('day'::"text", "a"."activity_date")), ("date_trunc"('week'::"text", "a"."activity_date")), ("date_trunc"('month'::"text", "a"."activity_date")), "a"."type", "d"."stage", "d"."amount"
        )
 SELECT "activity_metrics"."organization_id",
    "activity_metrics"."user_id",
    "activity_metrics"."activity_day",
    "activity_metrics"."activity_week",
    "activity_metrics"."activity_month",
    "activity_metrics"."activity_type",
    "activity_metrics"."deal_stage",
    "activity_metrics"."deal_amount",
    "activity_metrics"."activity_count",
    "activity_metrics"."contacts_touched",
    "activity_metrics"."deals_touched"
   FROM "activity_metrics"
  WITH NO DATA;


ALTER TABLE "public"."sales_activity_analytics_mv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_learning_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "deal_id" "uuid",
    "account_id" "uuid",
    "contact_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_key" "text",
    "segment_key" "text",
    "industry" "text",
    "amount_band" "text",
    "outcome_label" "text",
    "objection_key" "text",
    "feature_key" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_learning_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['interaction'::"text", 'outcome'::"text"]))),
    CONSTRAINT "sales_learning_events_outcome_label_check" CHECK (("outcome_label" = ANY (ARRAY['won'::"text", 'lost'::"text"])))
);


ALTER TABLE "public"."sales_learning_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_learning_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "segment_key" "text" DEFAULT 'all'::"text" NOT NULL,
    "recommendation_type" "text" NOT NULL,
    "item_key" "text" NOT NULL,
    "item_label" "text",
    "guidance_text" "text" NOT NULL,
    "confidence" numeric(4,3) DEFAULT 0.500 NOT NULL,
    "lift" numeric(6,4) DEFAULT 0 NOT NULL,
    "support_count" integer DEFAULT 0 NOT NULL,
    "rank_score" numeric(8,4) DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_computed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sales_learning_profiles_recommendation_type_check" CHECK (("recommendation_type" = ANY (ARRAY['promote_feature'::"text", 'deprioritize_feature'::"text", 'handle_objection'::"text", 'pursue_segment'::"text", 'avoid_segment'::"text"])))
);


ALTER TABLE "public"."sales_learning_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "amount" numeric NOT NULL,
    "period" "text" NOT NULL,
    "fiscal_year_start" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    CONSTRAINT "sales_quotas_fiscal_year_start_check" CHECK ((("fiscal_year_start" >= 1) AND ("fiscal_year_start" <= 12))),
    CONSTRAINT "sales_quotas_period_check" CHECK (("period" = ANY (ARRAY['monthly'::"text", 'quarterly'::"text", 'annual'::"text"])))
);


ALTER TABLE "public"."sales_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."saved_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "title" "text" NOT NULL,
    "original_prompt" "text",
    "query_config" "jsonb" NOT NULL,
    "chart_config" "jsonb" DEFAULT '{}'::"jsonb",
    "last_result" "jsonb" DEFAULT '{}'::"jsonb",
    "is_pinned" boolean DEFAULT false,
    "is_shared" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_refreshed_at" timestamp with time zone
);


ALTER TABLE "public"."saved_artifacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."search_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "w_ilike" numeric(3,2) DEFAULT 0.10 NOT NULL,
    "w_tsvector" numeric(3,2) DEFAULT 0.35 NOT NULL,
    "w_semantic" numeric(3,2) DEFAULT 0.55 NOT NULL,
    "lead_score_boost_factor" numeric(3,2) DEFAULT 0.50 NOT NULL,
    "semantic_threshold" numeric(3,2) DEFAULT 0.40 NOT NULL,
    "trigram_threshold" numeric(3,2) DEFAULT 0.25 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."search_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sequence_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "current_step" integer DEFAULT 1,
    "status" "text" DEFAULT 'active'::"text",
    "exit_reason" "text",
    "enrolled_at" timestamp with time zone DEFAULT "now"(),
    "last_step_at" timestamp with time zone,
    "next_step_at" timestamp with time zone,
    "enrolled_by" "uuid",
    CONSTRAINT "sequence_enrollments_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'exited'::"text", 'paused'::"text"])))
);


ALTER TABLE "public"."sequence_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "exit_criteria" "jsonb" DEFAULT '{"on_dq": true, "on_reply": true, "max_steps": null, "on_meeting_booked": true}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."sequences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."signup_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "domain" "text" NOT NULL,
    "decision" "text" NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "conversion_source" "text",
    "utm_parameters" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."signup_decisions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slide_generation_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "brand_colors" "jsonb" DEFAULT '{"accent": "#0f3460", "primary": "#1a1a2e", "secondary": "#16213e"}'::"jsonb",
    "font_preferences" "jsonb" DEFAULT '{"body": "Inter", "heading": "Inter", "size_scale": "default"}'::"jsonb",
    "logo_storage_path" "text",
    "default_ai_model" "text" DEFAULT 'claude'::"text",
    "style_keywords" "text"[] DEFAULT ARRAY['professional'::"text", 'modern'::"text"],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slide_generation_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."slide_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "template_type" "public"."slide_template_type" DEFAULT 'custom'::"public"."slide_template_type" NOT NULL,
    "stage_alignment" "text"[] DEFAULT '{}'::"text"[],
    "storage_path" "text",
    "thumbnail_path" "text",
    "slide_count" integer,
    "extracted_structure" "jsonb" DEFAULT '{}'::"jsonb",
    "is_ai_base_template" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slide_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."source_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "raw_content" "text",
    "storage_path" "text",
    "storage_bucket" "text" DEFAULT 'source-documents'::"text",
    "file_name" "text",
    "file_type" "text",
    "file_size" bigint,
    "title" "text",
    "chat_session_id" "uuid",
    "deal_id" "uuid",
    "account_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_archived" boolean DEFAULT false,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", ((COALESCE("raw_content", ''::"text") || ' '::"text") || COALESCE("title", ''::"text")))) STORED,
    "meeting_date" "date",
    CONSTRAINT "source_documents_org_check" CHECK (("organization_id" IS NOT NULL)),
    CONSTRAINT "source_documents_source_type_check" CHECK (("source_type" = ANY (ARRAY['chat_note'::"text", 'pdf'::"text", 'email'::"text", 'voice_transcript'::"text", 'csv'::"text", 'image'::"text", 'document'::"text", 'meeting_recording'::"text"])))
);


ALTER TABLE "public"."source_documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."suggested_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid",
    "deal_id" "uuid",
    "organization_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "dedup_key" "text" NOT NULL,
    "reasoning" "text",
    "confidence" numeric DEFAULT 0.5 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "assigned_to" "uuid",
    "expires_at" timestamp with time zone,
    "dismissed_at" timestamp with time zone,
    "acted_on_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "dismissed_reason" "text",
    "evidence" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "suggested_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['follow_up'::"text", 're_engage'::"text", 'date_reminder'::"text", 'relationship_nurture'::"text", 'deal_risk'::"text", 'memory_insight'::"text", 'compaction_summary'::"text", 'renewal_outreach'::"text", 'schedule_qbr'::"text"]))),
    CONSTRAINT "suggested_actions_dismissed_reason_check" CHECK (("dismissed_reason" = ANY (ARRAY['not_relevant'::"text", 'remind_later'::"text", 'completed'::"text", 'wrong_timing'::"text", 'duplicate'::"text"])))
);

ALTER TABLE ONLY "public"."suggested_actions" REPLICA IDENTITY FULL;


ALTER TABLE "public"."suggested_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_prompt_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "content" "text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "section_type" "text" DEFAULT 'full_prompt'::"text",
    "section_order" integer DEFAULT 1,
    "section_title" "text",
    "deactivated_by" "uuid",
    "deactivation_reason" "text",
    "performance_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "organization_id" "uuid"
);


ALTER TABLE "public"."system_prompt_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tasks_task_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."tasks_task_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tasks_task_number_seq" OWNED BY "public"."tasks"."task_number";



CREATE TABLE IF NOT EXISTS "public"."template_slot_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "template_id" "uuid" NOT NULL,
    "slide_index" integer NOT NULL,
    "element_id" "text" NOT NULL,
    "element_type" "public"."slide_element_type" DEFAULT 'text'::"public"."slide_element_type" NOT NULL,
    "placeholder_text" "text",
    "bounding_box" "jsonb",
    "slot_name" "text" NOT NULL,
    "mapping_type" "public"."slot_mapping_type" DEFAULT 'direct'::"public"."slot_mapping_type" NOT NULL,
    "data_source" "text",
    "ai_prompt" "text",
    "ai_model" "text" DEFAULT 'claude'::"text",
    "ai_max_tokens" integer DEFAULT 150,
    "ai_temperature" numeric DEFAULT 0.7,
    "condition_logic" "jsonb",
    "max_characters" integer,
    "format_as" "text",
    "fallback_value" "text",
    "display_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."template_slot_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."uploaded_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "chat_session_id" "uuid",
    "filename" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "processing_status" "text" DEFAULT 'pending'::"text",
    "processing_started_at" timestamp with time zone,
    "processing_completed_at" timestamp with time zone,
    "processing_error" "text",
    "extracted_data" "jsonb" DEFAULT '{}'::"jsonb",
    "parsed_entities" "jsonb" DEFAULT '{}'::"jsonb",
    "entity_count" integer DEFAULT 0,
    "entities_created" integer DEFAULT 0,
    "entities_failed" integer DEFAULT 0,
    "document_summary" "text",
    "key_insights" "text"[],
    "tags" "text"[],
    "confidence_score" numeric(3,2) DEFAULT 0.0,
    "searchable_content" "text",
    "content_vector" "public"."vector"(1536),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "uploaded_files_processing_status_check" CHECK (("processing_status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'partially_completed'::"text"])))
);


ALTER TABLE "public"."uploaded_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_activity_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "activity_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_activity_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_ai_preferences" (
    "user_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'groq'::"text" NOT NULL,
    "model" "text" DEFAULT 'moonshotai/kimi-k2-instruct-0905'::"text" NOT NULL,
    "temperature" numeric(3,2) DEFAULT 0.3,
    "max_tokens" integer DEFAULT 4096,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_ai_preferences_max_tokens_check" CHECK ((("max_tokens" >= 100) AND ("max_tokens" <= 32000))),
    CONSTRAINT "user_ai_preferences_temperature_check" CHECK ((("temperature" >= (0)::numeric) AND ("temperature" <= (2)::numeric))),
    CONSTRAINT "valid_provider" CHECK (("provider" = ANY (ARRAY['groq'::"text", 'openai'::"text", 'anthropic'::"text", 'perplexity'::"text"])))
);


ALTER TABLE "public"."user_ai_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_channel_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "channel_user_id" "text" NOT NULL,
    "channel_user_id_hash" "text" NOT NULL,
    "channel_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "verified_at" timestamp with time zone,
    "verification_code" "text",
    "verification_expires_at" timestamp with time zone,
    "is_primary" boolean DEFAULT true,
    "last_inbound_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_channel" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'telegram'::"text", 'sms'::"text"])))
);


ALTER TABLE "public"."user_channel_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_compensation_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "compensation_plan_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "effective_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "end_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_compensation_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "preferred_channel" "text" DEFAULT 'whatsapp'::"text",
    "whatsapp_enabled" boolean DEFAULT true,
    "notify_high_intent_visits" boolean DEFAULT true,
    "notify_deal_stagnation" boolean DEFAULT true,
    "notify_task_reminders" boolean DEFAULT true,
    "notify_daily_digest" boolean DEFAULT false,
    "stagnation_days_threshold" integer DEFAULT 7,
    "high_intent_page_views_threshold" integer DEFAULT 2,
    "quiet_hours_enabled" boolean DEFAULT false,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "quiet_hours_timezone" "text" DEFAULT 'America/New_York'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "max_actions_per_day" integer,
    "min_confidence" numeric(3,2),
    "email_enabled" boolean DEFAULT true,
    "push_enabled" boolean DEFAULT true,
    "weekly_report_enabled" boolean DEFAULT true,
    "theme" "text" DEFAULT 'light'::"text",
    "compact_mode" boolean DEFAULT false,
    "sidebar_position" "text" DEFAULT 'left'::"text"
);


ALTER TABLE "public"."user_notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_prompt_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "tone" "text" DEFAULT 'professional'::"text",
    "verbosity" "text" DEFAULT 'balanced'::"text",
    "format_preference" "text" DEFAULT 'mixed'::"text",
    "custom_instructions" "text",
    "cache_version" integer DEFAULT 1,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "communication_style" "text" DEFAULT 'professional'::"text",
    "energy_level" "text" DEFAULT 'balanced'::"text",
    "signature_phrases" "text"[] DEFAULT '{}'::"text"[],
    "avoid_phrases" "text"[] DEFAULT '{}'::"text"[],
    "rep_title" "text",
    "rep_bio" "text",
    "rep_photo_path" "text",
    "rep_linkedin_url" "text",
    "rep_calendar_url" "text",
    CONSTRAINT "check_communication_style" CHECK (("communication_style" = ANY (ARRAY['consultative'::"text", 'direct'::"text", 'storyteller'::"text", 'technical'::"text", 'professional'::"text"]))),
    CONSTRAINT "check_energy_level" CHECK (("energy_level" = ANY (ARRAY['warm_enthusiastic'::"text", 'calm_measured'::"text", 'bold_confident'::"text", 'balanced'::"text"]))),
    CONSTRAINT "user_prompt_preferences_custom_instructions_check" CHECK (("char_length"("custom_instructions") <= 500)),
    CONSTRAINT "user_prompt_preferences_format_preference_check" CHECK (("format_preference" = ANY (ARRAY['bullets'::"text", 'paragraphs'::"text", 'mixed'::"text"]))),
    CONSTRAINT "user_prompt_preferences_tone_check" CHECK (("tone" = ANY (ARRAY['casual'::"text", 'professional'::"text", 'formal'::"text"]))),
    CONSTRAINT "user_prompt_preferences_verbosity_check" CHECK (("verbosity" = ANY (ARRAY['concise'::"text", 'balanced'::"text", 'detailed'::"text"])))
);


ALTER TABLE "public"."user_prompt_preferences" OWNER TO "postgres";


COMMENT ON COLUMN "public"."user_prompt_preferences"."communication_style" IS 'Overall communication approach: consultative, direct, storyteller, technical, professional';



COMMENT ON COLUMN "public"."user_prompt_preferences"."energy_level" IS 'Emotional tone: warm_enthusiastic, calm_measured, bold_confident, balanced';



COMMENT ON COLUMN "public"."user_prompt_preferences"."signature_phrases" IS 'Phrases the rep likes to use naturally';



COMMENT ON COLUMN "public"."user_prompt_preferences"."avoid_phrases" IS 'Phrases the rep does not want the AI to use on their behalf';



COMMENT ON COLUMN "public"."user_prompt_preferences"."rep_title" IS 'Job title for intro slides (e.g., Senior Account Executive)';



COMMENT ON COLUMN "public"."user_prompt_preferences"."rep_bio" IS 'Short personal intro for About/Team slides';



COMMENT ON COLUMN "public"."user_prompt_preferences"."rep_photo_path" IS 'Storage path for headshot image';



CREATE TABLE IF NOT EXISTS "public"."user_quotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "period" "public"."compensation_period" DEFAULT 'quarterly'::"public"."compensation_period" NOT NULL,
    "fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_quotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "role_id" "uuid",
    "territory_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "product_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "vertical_scope" "jsonb" DEFAULT '{}'::"jsonb",
    "effective_date" "date" DEFAULT CURRENT_DATE,
    "expiration_date" "date",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_role_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."visitor_identity_map" (
    "visitor_id" "text" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "identified_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."visitor_identity_map" OWNER TO "postgres";




CREATE TABLE IF NOT EXISTS "public"."web_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
)
PARTITION BY RANGE ("occurred_at");


ALTER TABLE "public"."web_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_01" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_01" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_02" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_02" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_03" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_03" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_04" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_04" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_05" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_05" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_06" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_06" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_2026_07" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "visitor_id" "text" NOT NULL,
    "contact_id" "uuid",
    "account_id" "uuid",
    "event_type" "text" NOT NULL,
    "page_url" "text" NOT NULL,
    "page_title" "text",
    "page_category" "text",
    "time_on_page_seconds" integer,
    "scroll_depth_percent" integer,
    "referrer" "text",
    "utm_source" "text",
    "utm_medium" "text",
    "utm_campaign" "text",
    "ip_hash" "text",
    "country_code" "text",
    "is_bot" boolean DEFAULT false,
    "user_agent" "text",
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."web_events_2026_07" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_events_monthly_summary" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "account_id" "uuid",
    "month" "date" NOT NULL,
    "page_category" "text",
    "total_views" integer DEFAULT 0,
    "unique_visitors" integer DEFAULT 0,
    "total_time_seconds" integer DEFAULT 0,
    "avg_scroll_depth" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."web_events_monthly_summary" OWNER TO "postgres";






CREATE TABLE IF NOT EXISTS "public"."workflow_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_entity" "text" NOT NULL,
    "trigger_event" "text" NOT NULL,
    "trigger_condition" "text" DEFAULT 'equals'::"text",
    "trigger_value" "text",
    "action_type" "text" NOT NULL,
    "action_config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "run_count" integer DEFAULT 0,
    "last_run_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_rules" OWNER TO "postgres";


ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_01" FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2026-02-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_02" FOR VALUES FROM ('2026-02-01 00:00:00+00') TO ('2026-03-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_03" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_04" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_05" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_06" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');



ALTER TABLE ONLY "public"."web_events" ATTACH PARTITION "public"."web_events_2026_07" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');



ALTER TABLE ONLY "public"."accounts" ALTER COLUMN "account_number" SET DEFAULT "nextval"('"public"."accounts_account_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities" ALTER COLUMN "activity_number" SET DEFAULT "nextval"('"public"."activities_activity_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."contacts" ALTER COLUMN "contact_number" SET DEFAULT "nextval"('"public"."contacts_contact_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."deals" ALTER COLUMN "deal_number" SET DEFAULT "nextval"('"public"."deals_deal_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."tasks" ALTER COLUMN "task_number" SET DEFAULT "nextval"('"public"."tasks_task_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."account_ltv_history"
    ADD CONSTRAINT "account_ltv_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_account_number_key" UNIQUE ("account_number");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_activity_number_key" UNIQUE ("activity_number");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_email_whitelist"
    ADD CONSTRAINT "admin_email_whitelist_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."admin_email_whitelist"
    ADD CONSTRAINT "admin_email_whitelist_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_job_executions"
    ADD CONSTRAINT "admin_job_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_job_progress"
    ADD CONSTRAINT "admin_job_progress_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");









ALTER TABLE ONLY "public"."calendar_event_sync"
    ADD CONSTRAINT "calendar_event_sync_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_event_sync"
    ADD CONSTRAINT "calendar_event_sync_user_id_google_event_id_google_calendar_key" UNIQUE ("user_id", "google_event_id", "google_calendar_id");



ALTER TABLE ONLY "public"."calendar_tokens"
    ADD CONSTRAINT "calendar_tokens_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."calendar_watch_channels"
    ADD CONSTRAINT "calendar_watch_channels_channel_id_key" UNIQUE ("channel_id");



ALTER TABLE ONLY "public"."calendar_watch_channels"
    ADD CONSTRAINT "calendar_watch_channels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."calendar_watch_channels"
    ADD CONSTRAINT "calendar_watch_channels_user_id_calendar_id_key" UNIQUE ("user_id", "calendar_id");



ALTER TABLE ONLY "public"."campaign_contacts"
    ADD CONSTRAINT "campaign_contacts_campaign_id_contact_id_attribution_type_key" UNIQUE ("campaign_id", "contact_id", "attribution_type");



ALTER TABLE ONLY "public"."campaign_contacts"
    ADD CONSTRAINT "campaign_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_deals"
    ADD CONSTRAINT "campaign_deals_campaign_id_deal_id_key" UNIQUE ("campaign_id", "deal_id");



ALTER TABLE ONLY "public"."campaign_deals"
    ADD CONSTRAINT "campaign_deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_context_memory"
    ADD CONSTRAINT "chat_context_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_intent_patterns"
    ADD CONSTRAINT "chat_intent_patterns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_pending_actions"
    ADD CONSTRAINT "chat_pending_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_response_cache"
    ADD CONSTRAINT "chat_response_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chat_response_cache"
    ADD CONSTRAINT "chat_response_cache_query_hash_key" UNIQUE ("query_hash");



ALTER TABLE ONLY "public"."chat_sessions"
    ADD CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_memory"
    ADD CONSTRAINT "client_memory_contact_id_organization_id_key" UNIQUE ("contact_id", "organization_id");



ALTER TABLE ONLY "public"."client_memory"
    ADD CONSTRAINT "client_memory_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_deal_id_user_id_key" UNIQUE ("deal_id", "user_id");



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compensation_plans"
    ADD CONSTRAINT "compensation_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_contact_number_key" UNIQUE ("contact_number");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_briefings"
    ADD CONSTRAINT "daily_briefings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_briefings"
    ADD CONSTRAINT "daily_briefings_user_id_briefing_date_key" UNIQUE ("user_id", "briefing_date");



ALTER TABLE ONLY "public"."data_quality_metrics"
    ADD CONSTRAINT "data_quality_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_attachments"
    ADD CONSTRAINT "deal_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_contact_history"
    ADD CONSTRAINT "deal_contact_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_deal_id_contact_id_key" UNIQUE ("deal_id", "contact_id");



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_deal_id_feature_id_key" UNIQUE ("deal_id", "feature_id");



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "deal_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deal_terms"
    ADD CONSTRAINT "deal_terms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_deal_number_key" UNIQUE ("deal_number");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."decision_traces"
    ADD CONSTRAINT "decision_traces_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_engagement_stats"
    ADD CONSTRAINT "email_engagement_stats_contact_id_key" UNIQUE ("contact_id");



ALTER TABLE ONLY "public"."email_engagement_stats"
    ADD CONSTRAINT "email_engagement_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_user_id_provider_provider_message_id_key" UNIQUE ("user_id", "provider", "provider_message_id");



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_user_id_provider_key" UNIQUE ("user_id", "provider");



ALTER TABLE ONLY "public"."embeddings"
    ADD CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_logs"
    ADD CONSTRAINT "enrichment_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_provider_configs"
    ADD CONSTRAINT "enrichment_provider_configs_organization_id_provider_defini_key" UNIQUE ("organization_id", "provider_definition_id");



ALTER TABLE ONLY "public"."enrichment_provider_configs"
    ADD CONSTRAINT "enrichment_provider_configs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_provider_definitions"
    ADD CONSTRAINT "enrichment_provider_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."enrichment_provider_definitions"
    ADD CONSTRAINT "enrichment_provider_definitions_provider_key_key" UNIQUE ("provider_key");



ALTER TABLE ONLY "public"."entity_definitions"
    ADD CONSTRAINT "entity_definitions_entity_name_key" UNIQUE ("entity_name");



ALTER TABLE ONLY "public"."entity_definitions"
    ADD CONSTRAINT "entity_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_fields"
    ADD CONSTRAINT "entity_fields_entity_definition_id_field_name_key" UNIQUE ("entity_definition_id", "field_name");



ALTER TABLE ONLY "public"."entity_fields"
    ADD CONSTRAINT "entity_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_permissions"
    ADD CONSTRAINT "entity_permissions_entity_definition_id_role_key" UNIQUE ("entity_definition_id", "role");



ALTER TABLE ONLY "public"."entity_permissions"
    ADD CONSTRAINT "entity_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_references"
    ADD CONSTRAINT "entity_references_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_tags"
    ADD CONSTRAINT "entity_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."extraction_records"
    ADD CONSTRAINT "extraction_records_pkey" PRIMARY KEY ("id");






ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_organization_id_title_key" UNIQUE ("organization_id", "title");



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."file_extraction_log"
    ADD CONSTRAINT "file_extraction_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_tokens"
    ADD CONSTRAINT "google_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."google_tokens"
    ADD CONSTRAINT "google_tokens_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."intervention_outcomes"
    ADD CONSTRAINT "intervention_outcomes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitation_rate_limits"
    ADD CONSTRAINT "invitation_rate_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitation_rate_limits"
    ADD CONSTRAINT "invitation_rate_limits_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "lead_scores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."lead_scoring_rules"
    ADD CONSTRAINT "lead_scoring_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ltv_benchmarks"
    ADD CONSTRAINT "ltv_benchmarks_organization_id_segment_type_segment_value_key" UNIQUE ("organization_id", "segment_type", "segment_value");



ALTER TABLE ONLY "public"."ltv_benchmarks"
    ADD CONSTRAINT "ltv_benchmarks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_log"
    ADD CONSTRAINT "message_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messaging_sessions"
    ADD CONSTRAINT "messaging_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_custom_skills"
    ADD CONSTRAINT "organization_custom_skills_organization_id_skill_name_key" UNIQUE ("organization_id", "skill_name");



ALTER TABLE ONLY "public"."organization_custom_skills"
    ADD CONSTRAINT "organization_custom_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_join_requests"
    ADD CONSTRAINT "organization_join_requests_organization_id_user_email_key" UNIQUE ("organization_id", "user_email");



ALTER TABLE ONLY "public"."organization_join_requests"
    ADD CONSTRAINT "organization_join_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_security_logs"
    ADD CONSTRAINT "organization_security_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_tracking_config"
    ADD CONSTRAINT "organization_tracking_config_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."organization_tracking_config"
    ADD CONSTRAINT "organization_tracking_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_velocity_metrics"
    ADD CONSTRAINT "pipeline_velocity_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_admins"
    ADD CONSTRAINT "platform_admins_user_id_key" UNIQUE ("user_id");









ALTER TABLE ONLY "public"."proactive_policies"
    ADD CONSTRAINT "proactive_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_features"
    ADD CONSTRAINT "product_features_organization_id_name_key" UNIQUE ("organization_id", "name");



ALTER TABLE ONLY "public"."product_features"
    ADD CONSTRAINT "product_features_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_sku_key" UNIQUE ("organization_id", "sku");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_approvals"
    ADD CONSTRAINT "prompt_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prompt_approvals"
    ADD CONSTRAINT "prompt_approvals_request_id_approved_by_key" UNIQUE ("request_id", "approved_by");



ALTER TABLE ONLY "public"."prompt_change_requests"
    ADD CONSTRAINT "prompt_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public_email_domains"
    ADD CONSTRAINT "public_email_domains_domain_key" UNIQUE ("domain");



ALTER TABLE ONLY "public"."public_email_domains"
    ADD CONSTRAINT "public_email_domains_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_accuracy_logs"
    ADD CONSTRAINT "query_accuracy_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_plan_cache"
    ADD CONSTRAINT "query_plan_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."query_plan_cache"
    ADD CONSTRAINT "query_plan_cache_query_hash_key" UNIQUE ("query_hash");



ALTER TABLE ONLY "public"."role_templates"
    ADD CONSTRAINT "role_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_learning_profiles"
    ADD CONSTRAINT "sales_learning_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_learning_profiles"
    ADD CONSTRAINT "sales_learning_profiles_unique" UNIQUE ("organization_id", "segment_key", "recommendation_type", "item_key");



ALTER TABLE ONLY "public"."sales_quotas"
    ADD CONSTRAINT "sales_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."saved_artifacts"
    ADD CONSTRAINT "saved_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_config"
    ADD CONSTRAINT "search_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_sequence_id_contact_id_key" UNIQUE ("sequence_id", "contact_id");



ALTER TABLE ONLY "public"."sequences"
    ADD CONSTRAINT "sequences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."signup_decisions"
    ADD CONSTRAINT "signup_decisions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slide_generation_preferences"
    ADD CONSTRAINT "slide_generation_preferences_organization_id_key" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."slide_generation_preferences"
    ADD CONSTRAINT "slide_generation_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."slide_templates"
    ADD CONSTRAINT "slide_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."suggested_actions"
    ADD CONSTRAINT "suggested_actions_dedup_key_key" UNIQUE ("dedup_key");



ALTER TABLE ONLY "public"."suggested_actions"
    ADD CONSTRAINT "suggested_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_prompt_config"
    ADD CONSTRAINT "system_prompt_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_task_number_key" UNIQUE ("task_number");



ALTER TABLE ONLY "public"."template_slot_mappings"
    ADD CONSTRAINT "template_slot_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "unique_active_invitation" UNIQUE ("organization_id", "email") DEFERRABLE INITIALLY DEFERRED;



ALTER TABLE ONLY "public"."user_channel_registrations"
    ADD CONSTRAINT "unique_channel_user" UNIQUE ("channel", "channel_user_id_hash");



ALTER TABLE ONLY "public"."lead_scores"
    ADD CONSTRAINT "unique_contact_org_score" UNIQUE ("contact_id", "organization_id");



ALTER TABLE ONLY "public"."embeddings"
    ADD CONSTRAINT "unique_entity_embedding" UNIQUE ("entity_type", "entity_id");



ALTER TABLE ONLY "public"."entity_tags"
    ADD CONSTRAINT "unique_entity_tag" UNIQUE ("organization_id", "entity_type", "entity_id", "tag");



ALTER TABLE ONLY "public"."proactive_policies"
    ADD CONSTRAINT "unique_policy_per_org" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."search_config"
    ADD CONSTRAINT "unique_search_config_per_org" UNIQUE ("organization_id");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "unique_user_notification_prefs" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "unique_user_org" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_activity_logs"
    ADD CONSTRAINT "user_activity_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_ai_preferences"
    ADD CONSTRAINT "user_ai_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."user_channel_registrations"
    ADD CONSTRAINT "user_channel_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_user_id_compensation_plan_id__key" UNIQUE ("user_id", "compensation_plan_id", "effective_date");



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_prompt_preferences"
    ADD CONSTRAINT "user_prompt_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_prompt_preferences"
    ADD CONSTRAINT "user_prompt_preferences_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_user_id_organization_id_period_is_active_key" UNIQUE ("user_id", "organization_id", "period", "is_active");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_role_id_key" UNIQUE ("user_id", "role_id");



ALTER TABLE ONLY "public"."visitor_identity_map"
    ADD CONSTRAINT "visitor_identity_map_pkey" PRIMARY KEY ("visitor_id");









ALTER TABLE ONLY "public"."web_events"
    ADD CONSTRAINT "web_events_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_01"
    ADD CONSTRAINT "web_events_2026_01_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_02"
    ADD CONSTRAINT "web_events_2026_02_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_03"
    ADD CONSTRAINT "web_events_2026_03_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_04"
    ADD CONSTRAINT "web_events_2026_04_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_05"
    ADD CONSTRAINT "web_events_2026_05_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_06"
    ADD CONSTRAINT "web_events_2026_06_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_2026_07"
    ADD CONSTRAINT "web_events_2026_07_pkey" PRIMARY KEY ("id", "occurred_at");



ALTER TABLE ONLY "public"."web_events_monthly_summary"
    ADD CONSTRAINT "web_events_monthly_summary_organization_id_account_id_month_key" UNIQUE ("organization_id", "account_id", "month", "page_category");



ALTER TABLE ONLY "public"."web_events_monthly_summary"
    ADD CONSTRAINT "web_events_monthly_summary_pkey" PRIMARY KEY ("id");















ALTER TABLE ONLY "public"."workflow_rules"
    ADD CONSTRAINT "workflow_rules_pkey" PRIMARY KEY ("id");












CREATE INDEX "idx_account_health_org" ON "public"."account_health_mv" USING "btree" ("organization_id");



CREATE INDEX "idx_account_health_status" ON "public"."account_health_mv" USING "btree" ("health_status");



CREATE INDEX "idx_account_ltv_history_account" ON "public"."account_ltv_history" USING "btree" ("account_id", "recorded_at" DESC);



CREATE INDEX "idx_accounts_account_type" ON "public"."accounts" USING "btree" ("account_type");



CREATE INDEX "idx_accounts_created_at" ON "public"."accounts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_accounts_domain" ON "public"."accounts" USING "btree" ("domain");



CREATE INDEX "idx_accounts_fulltext_search" ON "public"."accounts" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("description", ''::"text")) || ' '::"text") || COALESCE("industry", ''::"text"))));



CREATE INDEX "idx_accounts_is_personal" ON "public"."accounts" USING "btree" ("is_personal") WHERE ("is_personal" = true);



CREATE INDEX "idx_accounts_ltv_predicted" ON "public"."accounts" USING "btree" ("organization_id", "ltv_predicted" DESC NULLS LAST);



CREATE INDEX "idx_accounts_ltv_segment" ON "public"."accounts" USING "btree" ("organization_id", "ltv_segment");



CREATE INDEX "idx_accounts_name" ON "public"."accounts" USING "btree" ("name");



CREATE INDEX "idx_accounts_name_trgm" ON "public"."accounts" USING "gist" ("name" "public"."gist_trgm_ops");



COMMENT ON INDEX "public"."idx_accounts_name_trgm" IS 'Trigram index for fast fuzzy search on account names (e.g., "Pepsi" finds "PepsiCo")';



CREATE INDEX "idx_accounts_org_user" ON "public"."accounts" USING "btree" ("organization_id", "user_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_accounts_organization_id" ON "public"."accounts" USING "btree" ("organization_id");



CREATE INDEX "idx_accounts_organization_search" ON "public"."accounts" USING "btree" ("organization_id", "industry", "name");



CREATE INDEX "idx_accounts_text_search" ON "public"."accounts" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("description", ''::"text")) || ' '::"text") || COALESCE("industry", ''::"text"))));



CREATE INDEX "idx_accounts_updated_at" ON "public"."accounts" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_accounts_weighted_search" ON "public"."accounts" USING "gin" ("search_vector");



CREATE INDEX "idx_activities_account_type" ON "public"."activities" USING "btree" ("account_id", "type") WHERE ("type" = ANY (ARRAY['email'::"text", 'call'::"text"]));



CREATE INDEX "idx_activities_contact_id" ON "public"."activities" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);



CREATE INDEX "idx_activities_contact_type" ON "public"."activities" USING "btree" ("contact_id", "type") WHERE ("type" = ANY (ARRAY['email'::"text", 'call'::"text"]));



CREATE INDEX "idx_activities_created_at" ON "public"."activities" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activities_deal_id" ON "public"."activities" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);



CREATE INDEX "idx_activities_deal_type" ON "public"."activities" USING "btree" ("deal_id", "type") WHERE ("type" = ANY (ARRAY['email'::"text", 'call'::"text"]));



CREATE INDEX "idx_activities_fulltext_search" ON "public"."activities" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text")) || ' '::"text") || COALESCE("subject", ''::"text"))));



CREATE INDEX "idx_activities_org_created_id" ON "public"."activities" USING "btree" ("organization_id", "created_at" DESC, "id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_activities_org_scheduled" ON "public"."activities" USING "btree" ("organization_id", "scheduled_at" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_activities_org_user" ON "public"."activities" USING "btree" ("organization_id", "user_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_activities_organization_id" ON "public"."activities" USING "btree" ("organization_id");



CREATE INDEX "idx_activities_organization_search" ON "public"."activities" USING "btree" ("organization_id", "type", "completed", "scheduled_at");



CREATE INDEX "idx_activities_text_search" ON "public"."activities" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))));



CREATE INDEX "idx_activities_updated_at" ON "public"."activities" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_activities_user_date" ON "public"."activities" USING "btree" ("user_id", "activity_date");



CREATE INDEX "idx_activity_analytics_month" ON "public"."sales_activity_analytics_mv" USING "btree" ("activity_month");



CREATE INDEX "idx_activity_analytics_org_user" ON "public"."sales_activity_analytics_mv" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_activity_analytics_type" ON "public"."sales_activity_analytics_mv" USING "btree" ("activity_type");



CREATE INDEX "idx_admin_jobs_org_status" ON "public"."admin_job_executions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_admin_jobs_user_created" ON "public"."admin_job_executions" USING "btree" ("triggered_by_user_id", "created_at" DESC);



CREATE INDEX "idx_admin_notifications_user_read" ON "public"."admin_notifications" USING "btree" ("user_id", "is_read", "created_at" DESC);



CREATE INDEX "idx_admin_progress_job_timestamp" ON "public"."admin_job_progress" USING "btree" ("job_id", "timestamp" DESC);



CREATE INDEX "idx_audit_log_table_record" ON "public"."audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_audit_log_user_org" ON "public"."audit_log" USING "btree" ("user_id", "organization_id", "created_at" DESC);



CREATE INDEX "idx_briefings_generated_at" ON "public"."daily_briefings" USING "btree" ("generated_at");



CREATE INDEX "idx_briefings_org_date" ON "public"."daily_briefings" USING "btree" ("organization_id", "briefing_date" DESC);



CREATE INDEX "idx_briefings_user_date" ON "public"."daily_briefings" USING "btree" ("user_id", "briefing_date" DESC);



CREATE INDEX "idx_calendar_event_sync_activity" ON "public"."calendar_event_sync" USING "btree" ("activity_id") WHERE ("activity_id" IS NOT NULL);



CREATE INDEX "idx_calendar_event_sync_google" ON "public"."calendar_event_sync" USING "btree" ("google_event_id", "google_calendar_id");



CREATE INDEX "idx_calendar_event_sync_org_user" ON "public"."calendar_event_sync" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_calendar_watch_channel_id" ON "public"."calendar_watch_channels" USING "btree" ("channel_id");



CREATE INDEX "idx_calendar_watch_channels_org_user" ON "public"."calendar_watch_channels" USING "btree" ("organization_id", "user_id");



CREATE INDEX "idx_calendar_watch_expiring" ON "public"."calendar_watch_channels" USING "btree" ("expiration") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_campaign_contacts_campaign" ON "public"."campaign_contacts" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_contacts_contact" ON "public"."campaign_contacts" USING "btree" ("contact_id");



CREATE INDEX "idx_campaign_contacts_contact_org" ON "public"."campaign_contacts" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_campaign_deals_campaign" ON "public"."campaign_deals" USING "btree" ("campaign_id");



CREATE INDEX "idx_campaign_deals_deal" ON "public"."campaign_deals" USING "btree" ("deal_id");



CREATE INDEX "idx_campaigns_org" ON "public"."campaigns" USING "btree" ("organization_id");



CREATE INDEX "idx_campaigns_status" ON "public"."campaigns" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_channel_registrations_lookup" ON "public"."user_channel_registrations" USING "btree" ("channel", "channel_user_id_hash");



CREATE INDEX "idx_channel_registrations_user" ON "public"."user_channel_registrations" USING "btree" ("user_id");



CREATE INDEX "idx_chat_context_session" ON "public"."chat_context_memory" USING "btree" ("session_id", "context_type");



CREATE INDEX "idx_chat_messages_content_search" ON "public"."chat_messages" USING "gin" ("to_tsvector"('"english"'::"regconfig", "content"));



CREATE INDEX "idx_chat_messages_files" ON "public"."chat_messages" USING "gin" ("attached_file_ids");



CREATE INDEX "idx_chat_messages_session" ON "public"."chat_messages" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_chat_response_cache_expires" ON "public"."chat_response_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_chat_response_cache_hash" ON "public"."chat_response_cache" USING "btree" ("query_hash");



CREATE INDEX "idx_chat_response_cache_org_time" ON "public"."chat_response_cache" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_chat_response_cache_user_time" ON "public"."chat_response_cache" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_chat_sessions_active_context_entity_id" ON "public"."chat_sessions" USING "gin" ("active_context" "jsonb_path_ops");



CREATE INDEX "idx_chat_sessions_entity_context_not_null" ON "public"."chat_sessions" USING "btree" ("id") WHERE ("entity_context" IS NOT NULL);



CREATE INDEX "idx_chat_sessions_pending_extraction" ON "public"."chat_sessions" USING "btree" ("pending_extraction_at") WHERE ("pending_extraction" IS NOT NULL);



CREATE INDEX "idx_chat_sessions_state" ON "public"."chat_sessions" USING "btree" ("conversation_state") WHERE ("conversation_state" <> 'IDLE'::"public"."conversation_state_enum");



CREATE INDEX "idx_chat_sessions_user_org" ON "public"."chat_sessions" USING "btree" ("user_id", "organization_id", "created_at" DESC);



CREATE INDEX "idx_client_memory_contact_id" ON "public"."client_memory" USING "btree" ("contact_id");



CREATE INDEX "idx_client_memory_organization_id" ON "public"."client_memory" USING "btree" ("organization_id");



CREATE INDEX "idx_commission_records_deal" ON "public"."commission_records" USING "btree" ("deal_id");



CREATE INDEX "idx_commission_records_status" ON "public"."commission_records" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_commission_records_user" ON "public"."commission_records" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_company_profiles_org" ON "public"."company_profiles" USING "btree" ("organization_id");



CREATE INDEX "idx_compensation_plans_org" ON "public"."compensation_plans" USING "btree" ("organization_id", "is_active");



CREATE INDEX "idx_contacts_bant_score" ON "public"."contacts" USING "btree" ("organization_id", "bant_score" DESC);



CREATE INDEX "idx_contacts_created_at" ON "public"."contacts" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("email");



CREATE INDEX "idx_contacts_email_hash" ON "public"."contacts" USING "hash" ("email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_contacts_fit_score" ON "public"."contacts" USING "btree" ("organization_id", "fit_score" DESC);



CREATE INDEX "idx_contacts_full_name" ON "public"."contacts" USING "btree" ("full_name");



CREATE INDEX "idx_contacts_full_name_trgm" ON "public"."contacts" USING "gin" ("full_name" "public"."gin_trgm_ops");



CREATE INDEX "idx_contacts_fulltext_search" ON "public"."contacts" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((((((((COALESCE("first_name", ''::"text") || ' '::"text") || COALESCE("last_name", ''::"text")) || ' '::"text") || COALESCE("full_name", ''::"text")) || ' '::"text") || COALESCE("email", ''::"text")) || ' '::"text") || COALESCE("company", ''::"text")) || ' '::"text") || COALESCE("title", ''::"text"))));



CREATE INDEX "idx_contacts_lead_score" ON "public"."contacts" USING "btree" ("lead_score" DESC) WHERE ("lead_score" > 0);



CREATE INDEX "idx_contacts_lead_source" ON "public"."contacts" USING "btree" ("lead_source") WHERE ("lead_source" IS NOT NULL);



CREATE INDEX "idx_contacts_linkedin_url" ON "public"."contacts" USING "btree" ("linkedin_url") WHERE ("linkedin_url" IS NOT NULL);



CREATE INDEX "idx_contacts_name_trgm" ON "public"."contacts" USING "gist" ("full_name" "public"."gist_trgm_ops");



COMMENT ON INDEX "public"."idx_contacts_name_trgm" IS 'Trigram index for fast fuzzy search on contact full names';



CREATE INDEX "idx_contacts_org_created_id" ON "public"."contacts" USING "btree" ("organization_id", "created_at" DESC, "id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_contacts_org_email" ON "public"."contacts" USING "btree" ("organization_id", "email") WHERE (("organization_id" IS NOT NULL) AND ("email" IS NOT NULL));



CREATE INDEX "idx_contacts_org_status" ON "public"."contacts" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_contacts_org_user" ON "public"."contacts" USING "btree" ("organization_id", "user_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_contacts_organization_id" ON "public"."contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_contacts_organization_search" ON "public"."contacts" USING "btree" ("organization_id", "full_name", "email", "company");



CREATE INDEX "idx_contacts_overall_lead_score" ON "public"."contacts" USING "btree" ("organization_id", "overall_lead_score" DESC);



CREATE INDEX "idx_contacts_qualification_stage" ON "public"."contacts" USING "btree" ("organization_id", "qualification_stage");



CREATE INDEX "idx_contacts_status" ON "public"."contacts" USING "btree" ("status");



CREATE INDEX "idx_contacts_status_changed" ON "public"."contacts" USING "btree" ("status_changed_at" DESC) WHERE ("status_changed_at" IS NOT NULL);



CREATE INDEX "idx_contacts_text_search" ON "public"."contacts" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("full_name", ''::"text") || ' '::"text") || COALESCE("email", ''::"text")) || ' '::"text") || COALESCE("company", ''::"text"))));



CREATE INDEX "idx_contacts_updated_at" ON "public"."contacts" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_contacts_weighted_search" ON "public"."contacts" USING "gin" ("search_vector");



CREATE INDEX "idx_data_quality_metrics_organization_id" ON "public"."data_quality_metrics" USING "btree" ("organization_id");



CREATE INDEX "idx_deal_attachments_deal_id" ON "public"."deal_attachments" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_attachments_source" ON "public"."deal_attachments" USING "btree" ("source_document_id") WHERE ("source_document_id" IS NOT NULL);



CREATE INDEX "idx_deal_contact_history_created_at" ON "public"."deal_contact_history" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_deal_contact_history_deal_contact_id" ON "public"."deal_contact_history" USING "btree" ("deal_contact_id");



CREATE INDEX "idx_deal_contact_history_deal_id" ON "public"."deal_contact_history" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_contacts_contact_id" ON "public"."deal_contacts" USING "btree" ("contact_id");



CREATE INDEX "idx_deal_contacts_deal_id" ON "public"."deal_contacts" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_contacts_deal_org" ON "public"."deal_contacts" USING "btree" ("deal_id", "organization_id");



CREATE INDEX "idx_deal_contacts_organization_id" ON "public"."deal_contacts" USING "btree" ("organization_id");



CREATE INDEX "idx_deal_contacts_quadrant" ON "public"."deal_contacts" USING "btree" ("quadrant");



CREATE INDEX "idx_deal_feature_gaps_feature" ON "public"."deal_feature_gaps" USING "btree" ("feature_id") WHERE ("feature_id" IS NOT NULL);



CREATE INDEX "idx_deal_feature_gaps_org_created" ON "public"."deal_feature_gaps" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_deal_notes_deal_id" ON "public"."deal_notes" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_notes_deal_org" ON "public"."deal_notes" USING "btree" ("deal_id", "organization_id");



CREATE INDEX "idx_deal_notes_meeting_date" ON "public"."deal_notes" USING "btree" ("meeting_date") WHERE ("meeting_date" IS NOT NULL);



CREATE INDEX "idx_deal_notes_source" ON "public"."deal_notes" USING "btree" ("source_document_id") WHERE ("source_document_id" IS NOT NULL);



CREATE INDEX "idx_deal_terms_deal_id" ON "public"."deal_terms" USING "btree" ("deal_id");



CREATE INDEX "idx_deal_terms_deal_org" ON "public"."deal_terms" USING "btree" ("deal_id", "organization_id");



CREATE INDEX "idx_deal_terms_end_date" ON "public"."deal_terms" USING "btree" ("contract_end_date") WHERE ("renewal_status" = ANY (ARRAY['not_due'::"text", 'upcoming'::"text"]));



CREATE INDEX "idx_deal_terms_org_renewal" ON "public"."deal_terms" USING "btree" ("organization_id", "renewal_status") WHERE ("renewal_status" <> 'cancelled'::"text");



CREATE INDEX "idx_deal_terms_qbr" ON "public"."deal_terms" USING "btree" ("next_qbr_date") WHERE ("next_qbr_date" IS NOT NULL);



CREATE INDEX "idx_deals_account_id" ON "public"."deals" USING "btree" ("account_id");



CREATE INDEX "idx_deals_account_stage" ON "public"."deals" USING "btree" ("account_id", "stage");



CREATE INDEX "idx_deals_actual_closed_at" ON "public"."deals" USING "btree" ("actual_closed_at") WHERE ("actual_closed_at" IS NOT NULL);



CREATE INDEX "idx_deals_close_date" ON "public"."deals" USING "btree" ("close_date") WHERE ("stage" <> ALL (ARRAY['closed-won'::"text", 'closed-lost'::"text", 'closed_won'::"text", 'closed_lost'::"text"]));



CREATE INDEX "idx_deals_contact_id" ON "public"."deals" USING "btree" ("contact_id");



CREATE INDEX "idx_deals_created_at" ON "public"."deals" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_deals_forecast_category" ON "public"."deals" USING "btree" ("organization_id", "forecast_category");



CREATE INDEX "idx_deals_fulltext_search" ON "public"."deals" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))));



CREATE INDEX "idx_deals_lead_source" ON "public"."deals" USING "btree" ("lead_source") WHERE ("lead_source" IS NOT NULL);



CREATE INDEX "idx_deals_name_trgm" ON "public"."deals" USING "gist" ("name" "public"."gist_trgm_ops");



COMMENT ON INDEX "public"."idx_deals_name_trgm" IS 'Trigram index for fast fuzzy search on deal names';



CREATE INDEX "idx_deals_org_amount" ON "public"."deals" USING "btree" ("organization_id", "amount" DESC) WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_deals_org_created_id" ON "public"."deals" USING "btree" ("organization_id", "created_at" DESC, "id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_deals_org_stage" ON "public"."deals" USING "btree" ("organization_id", "stage", "close_date") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_deals_org_user" ON "public"."deals" USING "btree" ("organization_id", "user_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_deals_organization_id" ON "public"."deals" USING "btree" ("organization_id");



CREATE INDEX "idx_deals_organization_search" ON "public"."deals" USING "btree" ("organization_id", "stage", "amount", "close_date");



CREATE INDEX "idx_deals_pipeline_age" ON "public"."deals" USING "btree" ("organization_id", "stage", "created_at") WHERE ("stage" <> ALL (ARRAY['closed_won'::"text", 'closed_lost'::"text"]));



CREATE INDEX "idx_deals_probability_source" ON "public"."deals" USING "btree" ("probability_source");



CREATE INDEX "idx_deals_stage_org" ON "public"."deals" USING "btree" ("organization_id", "stage");



CREATE INDEX "idx_deals_stale_check" ON "public"."deals" USING "btree" ("organization_id", "stage", "updated_at") WHERE ("stage" <> ALL (ARRAY['closed_won'::"text", 'closed_lost'::"text"]));



CREATE INDEX "idx_deals_text_search" ON "public"."deals" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))));



CREATE INDEX "idx_deals_updated_at" ON "public"."deals" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_deals_user_org_stage" ON "public"."deals" USING "btree" ("user_id", "organization_id", "stage");



CREATE INDEX "idx_deals_weighted_search" ON "public"."deals" USING "gin" ("search_vector");



CREATE INDEX "idx_decision_traces_org_time" ON "public"."decision_traces" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_decision_traces_session" ON "public"."decision_traces" USING "btree" ("session_id") WHERE ("session_id" IS NOT NULL);



CREATE INDEX "idx_decision_traces_tool_time" ON "public"."decision_traces" USING "btree" ("tool_name", "created_at" DESC);



CREATE INDEX "idx_email_messages_account" ON "public"."email_messages" USING "btree" ("account_id") WHERE ("account_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_contact" ON "public"."email_messages" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_deal" ON "public"."email_messages" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);



CREATE INDEX "idx_email_messages_from" ON "public"."email_messages" USING "btree" ("from_email");



CREATE INDEX "idx_email_messages_received" ON "public"."email_messages" USING "btree" ("user_id", "received_at" DESC);



CREATE INDEX "idx_email_messages_unmatched" ON "public"."email_messages" USING "btree" ("organization_id", "match_status") WHERE ("match_status" = 'unmatched'::"text");



CREATE INDEX "idx_embeddings_entity" ON "public"."embeddings" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_embeddings_hash" ON "public"."embeddings" USING "btree" ("content_hash");



CREATE INDEX "idx_embeddings_org" ON "public"."embeddings" USING "btree" ("organization_id");



CREATE INDEX "idx_embeddings_vector" ON "public"."embeddings" USING "hnsw" ("embedding" "public"."vector_cosine_ops") WITH ("m"='16', "ef_construction"='64');



CREATE INDEX "idx_engagement_churn_risk" ON "public"."customer_engagement_mv" USING "btree" ("churn_risk");



CREATE INDEX "idx_engagement_level" ON "public"."customer_engagement_mv" USING "btree" ("engagement_level");



CREATE INDEX "idx_engagement_org_contact" ON "public"."customer_engagement_mv" USING "btree" ("organization_id", "contact_id");



CREATE INDEX "idx_enrichment_logs_contact" ON "public"."enrichment_logs" USING "btree" ("contact_id") WHERE ("contact_id" IS NOT NULL);



CREATE INDEX "idx_enrichment_logs_org" ON "public"."enrichment_logs" USING "btree" ("organization_id", "created_at" DESC);



CREATE INDEX "idx_enrichment_provider_configs_active" ON "public"."enrichment_provider_configs" USING "btree" ("organization_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_enrichment_provider_configs_org" ON "public"."enrichment_provider_configs" USING "btree" ("organization_id");



CREATE INDEX "idx_enrichment_provider_definitions_key" ON "public"."enrichment_provider_definitions" USING "btree" ("provider_key");



CREATE INDEX "idx_entity_definitions_entity_name" ON "public"."entity_definitions" USING "btree" ("entity_name");



CREATE INDEX "idx_entity_definitions_org" ON "public"."entity_definitions" USING "btree" ("organization_id");



CREATE INDEX "idx_entity_fields_definition" ON "public"."entity_fields" USING "btree" ("entity_definition_id");



CREATE INDEX "idx_entity_fields_form" ON "public"."entity_fields" USING "btree" ("entity_definition_id") WHERE ("is_form_field" = true);



CREATE INDEX "idx_entity_fields_list" ON "public"."entity_fields" USING "btree" ("entity_definition_id") WHERE ("is_list_field" = true);



CREATE INDEX "idx_entity_permissions_definition" ON "public"."entity_permissions" USING "btree" ("entity_definition_id");



CREATE INDEX "idx_entity_references_lookup" ON "public"."entity_references" USING "btree" ("organization_id", "reference_text", "entity_type");



CREATE INDEX "idx_entity_tags_category" ON "public"."entity_tags" USING "btree" ("organization_id", "tag_category");



CREATE INDEX "idx_entity_tags_org_entity" ON "public"."entity_tags" USING "btree" ("organization_id", "entity_type", "entity_id");



CREATE INDEX "idx_entity_tags_org_tag" ON "public"."entity_tags" USING "btree" ("organization_id", "tag");



CREATE INDEX "idx_extraction_records_created" ON "public"."extraction_records" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_extraction_records_org" ON "public"."extraction_records" USING "btree" ("organization_id");



CREATE INDEX "idx_extraction_records_source" ON "public"."extraction_records" USING "btree" ("source_document_id");



CREATE INDEX "idx_extraction_records_status" ON "public"."extraction_records" USING "btree" ("review_status");



CREATE INDEX "idx_feature_requests_opportunity" ON "public"."feature_requests" USING "btree" ("organization_id", "total_opportunity_value" DESC);



CREATE INDEX "idx_feature_requests_priority" ON "public"."feature_requests" USING "btree" ("organization_id", "priority_score" DESC);



CREATE INDEX "idx_feature_requests_status" ON "public"."feature_requests" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_file_extraction_entity" ON "public"."file_extraction_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_file_extraction_file" ON "public"."file_extraction_log" USING "btree" ("uploaded_file_id");



CREATE INDEX "idx_file_extraction_org" ON "public"."file_extraction_log" USING "btree" ("organization_id");



CREATE INDEX "idx_file_extraction_status" ON "public"."file_extraction_log" USING "btree" ("status");



CREATE INDEX "idx_generated_presentations_account" ON "public"."generated_presentations" USING "btree" ("account_id");



CREATE INDEX "idx_generated_presentations_deal" ON "public"."generated_presentations" USING "btree" ("deal_id");



CREATE INDEX "idx_generated_presentations_org" ON "public"."generated_presentations" USING "btree" ("organization_id");



CREATE INDEX "idx_generated_presentations_org_status" ON "public"."generated_presentations" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_generated_presentations_user" ON "public"."generated_presentations" USING "btree" ("user_id");



CREATE INDEX "idx_generated_presentations_user_recent" ON "public"."generated_presentations" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_identity_account" ON "public"."visitor_identity_map" USING "btree" ("account_id");



CREATE INDEX "idx_identity_contact" ON "public"."visitor_identity_map" USING "btree" ("contact_id");



CREATE INDEX "idx_identity_org" ON "public"."visitor_identity_map" USING "btree" ("organization_id");



CREATE INDEX "idx_intervention_outcomes_action" ON "public"."intervention_outcomes" USING "btree" ("suggested_action_id");



CREATE INDEX "idx_intervention_outcomes_entity" ON "public"."intervention_outcomes" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_intervention_outcomes_org" ON "public"."intervention_outcomes" USING "btree" ("organization_id");



CREATE INDEX "idx_intervention_outcomes_pending" ON "public"."intervention_outcomes" USING "btree" ("action_taken_at") WHERE ("measured_at" IS NULL);



CREATE INDEX "idx_invites_email" ON "public"."organization_invites" USING "btree" ("email") WHERE ("accepted_at" IS NULL);



CREATE INDEX "idx_invites_expires" ON "public"."organization_invites" USING "btree" ("expires_at") WHERE ("accepted_at" IS NULL);



CREATE INDEX "idx_join_requests_created" ON "public"."organization_join_requests" USING "btree" ("created_at");



CREATE INDEX "idx_join_requests_expires" ON "public"."organization_join_requests" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_join_requests_org_id" ON "public"."join_requests" USING "btree" ("organization_id");



CREATE INDEX "idx_join_requests_org_status" ON "public"."organization_join_requests" USING "btree" ("organization_id", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_join_requests_status" ON "public"."join_requests" USING "btree" ("status");



CREATE INDEX "idx_join_requests_user_id" ON "public"."join_requests" USING "btree" ("user_id");



CREATE INDEX "idx_lead_scores_contact_id" ON "public"."lead_scores" USING "btree" ("contact_id");



CREATE INDEX "idx_lead_scores_contact_org" ON "public"."lead_scores" USING "btree" ("contact_id", "organization_id");



CREATE INDEX "idx_lead_scores_organization_id" ON "public"."lead_scores" USING "btree" ("organization_id");



CREATE INDEX "idx_lead_scores_score_grade" ON "public"."lead_scores" USING "btree" ("score_grade");



CREATE INDEX "idx_lead_scoring_rules_organization_id" ON "public"."lead_scoring_rules" USING "btree" ("organization_id");



CREATE INDEX "idx_message_log_session" ON "public"."message_log" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_message_log_status" ON "public"."message_log" USING "btree" ("status") WHERE ("status" = ANY (ARRAY['pending'::"text", 'failed'::"text"]));



CREATE INDEX "idx_message_log_user" ON "public"."message_log" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_messaging_sessions_active" ON "public"."messaging_sessions" USING "btree" ("channel", "channel_user_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_messaging_sessions_entity_lookup" ON "public"."messaging_sessions" USING "btree" ("context_entity_type", "context_entity_id", "organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_messaging_sessions_pending_extraction" ON "public"."messaging_sessions" USING "btree" ("pending_extraction_at") WHERE ("pending_extraction" IS NOT NULL);



CREATE INDEX "idx_monthly_summary_account" ON "public"."web_events_monthly_summary" USING "btree" ("account_id", "month" DESC);



CREATE INDEX "idx_monthly_summary_org" ON "public"."web_events_monthly_summary" USING "btree" ("organization_id", "month" DESC);



CREATE INDEX "idx_notification_queue_pending" ON "public"."notification_queue" USING "btree" ("scheduled_for", "status") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_org_custom_skills_active" ON "public"."organization_custom_skills" USING "btree" ("organization_id", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_org_invites_code_hash" ON "public"."organization_invites" USING "btree" ("invite_code_hash");



CREATE INDEX "idx_org_members_active_org" ON "public"."organization_members" USING "btree" ("organization_id") WHERE ("is_active" = true);



CREATE INDEX "idx_org_members_sales_role" ON "public"."organization_members" USING "btree" ("organization_id", "sales_role");



CREATE INDEX "idx_org_members_sales_role_status" ON "public"."organization_members" USING "btree" ("organization_id", "sales_role_status");



CREATE UNIQUE INDEX "idx_organization_invites_invite_code" ON "public"."organization_invites" USING "btree" ("invite_code") WHERE ("invite_code" IS NOT NULL);



CREATE INDEX "idx_organization_members_org_id" ON "public"."organization_members" USING "btree" ("organization_id");



CREATE INDEX "idx_organization_members_user_id" ON "public"."organization_members" USING "btree" ("user_id");



CREATE INDEX "idx_organizations_allowed_domains" ON "public"."organizations" USING "gin" ("allowed_domains") WHERE ("is_active" = true);



CREATE INDEX "idx_organizations_domain" ON "public"."organizations" USING "btree" ("domain");



CREATE INDEX "idx_organizations_name" ON "public"."organizations" USING "btree" ("name");



CREATE INDEX "idx_pending_actions_session" ON "public"."chat_pending_actions" USING "btree" ("session_id", "expires_at" DESC);



CREATE INDEX "idx_pipeline_stages_org" ON "public"."pipeline_stages" USING "btree" ("organization_id", "position");



CREATE INDEX "idx_pipeline_velocity_metrics_organization_id" ON "public"."pipeline_velocity_metrics" USING "btree" ("organization_id");



CREATE INDEX "idx_product_features_org_status" ON "public"."product_features" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_product_mentions_account" ON "public"."product_mentions" USING "btree" ("account_id") WHERE ("account_id" IS NOT NULL);



CREATE INDEX "idx_product_mentions_deal" ON "public"."product_mentions" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);



CREATE INDEX "idx_product_mentions_meeting_date" ON "public"."product_mentions" USING "btree" ("meeting_date") WHERE ("meeting_date" IS NOT NULL);



CREATE INDEX "idx_product_mentions_org" ON "public"."product_mentions" USING "btree" ("organization_id");



CREATE INDEX "idx_product_mentions_product_name" ON "public"."product_mentions" USING "btree" ("organization_id", "product_name");



CREATE INDEX "idx_product_mentions_type" ON "public"."product_mentions" USING "btree" ("mention_type");



CREATE INDEX "idx_products_org_status" ON "public"."products" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_profiles_onboarding_incomplete" ON "public"."profiles" USING "btree" ("id") WHERE ("onboarding_completed_at" IS NULL);



CREATE INDEX "idx_profiles_signup_metadata" ON "public"."profiles" USING "gin" ("signup_metadata");



CREATE INDEX "idx_prompt_approvals_request_decision" ON "public"."prompt_approvals" USING "btree" ("request_id", "decision");



CREATE INDEX "idx_prompt_change_requests_status" ON "public"."prompt_change_requests" USING "btree" ("status");



CREATE INDEX "idx_prompt_config_active_section_order" ON "public"."system_prompt_config" USING "btree" ("is_active", "section_type", "section_order") WHERE ("is_active" = true);



CREATE INDEX "idx_prompt_config_org_section" ON "public"."system_prompt_config" USING "btree" ("organization_id", "section_type", "is_active");



CREATE INDEX "idx_prompt_config_section_version" ON "public"."system_prompt_config" USING "btree" ("section_type", "version" DESC);



CREATE INDEX "idx_query_logs_created" ON "public"."query_accuracy_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_query_logs_intent" ON "public"."query_accuracy_logs" USING "btree" ("intent");



CREATE INDEX "idx_query_logs_org" ON "public"."query_accuracy_logs" USING "btree" ("organization_id");



CREATE INDEX "idx_query_logs_session" ON "public"."query_accuracy_logs" USING "btree" ("session_id");



CREATE INDEX "idx_query_logs_zero_results" ON "public"."query_accuracy_logs" USING "btree" ("organization_id", "created_at" DESC) WHERE ("result_count" = 0);



CREATE INDEX "idx_query_plan_cache_expires" ON "public"."query_plan_cache" USING "btree" ("expires_at");



CREATE INDEX "idx_query_plan_cache_hash" ON "public"."query_plan_cache" USING "btree" ("query_hash");



CREATE INDEX "idx_revenue_analytics_assigned" ON "public"."revenue_analytics_mv" USING "btree" ("assigned_to");



CREATE INDEX "idx_revenue_analytics_org_period" ON "public"."revenue_analytics_mv" USING "btree" ("organization_id", "period_month");



CREATE INDEX "idx_revenue_analytics_stage" ON "public"."revenue_analytics_mv" USING "btree" ("stage");



CREATE INDEX "idx_sales_learning_events_deal" ON "public"."sales_learning_events" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);



CREATE INDEX "idx_sales_learning_events_org_time" ON "public"."sales_learning_events" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "idx_sales_learning_events_org_type" ON "public"."sales_learning_events" USING "btree" ("organization_id", "event_type", "occurred_at" DESC);



CREATE INDEX "idx_sales_learning_events_segment" ON "public"."sales_learning_events" USING "btree" ("organization_id", "segment_key") WHERE ("segment_key" IS NOT NULL);



CREATE INDEX "idx_sales_learning_profiles_org_segment" ON "public"."sales_learning_profiles" USING "btree" ("organization_id", "segment_key", "rank_score" DESC);



CREATE INDEX "idx_sales_quotas_org_active" ON "public"."sales_quotas" USING "btree" ("organization_id", "is_active");



CREATE INDEX "idx_sales_quotas_user" ON "public"."sales_quotas" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_saved_artifacts_org_shared" ON "public"."saved_artifacts" USING "btree" ("organization_id", "is_shared") WHERE ("is_shared" = true);



CREATE INDEX "idx_saved_artifacts_user_id" ON "public"."saved_artifacts" USING "btree" ("user_id");



CREATE INDEX "idx_security_logs_domain_date" ON "public"."organization_security_logs" USING "btree" ("user_domain", "created_at");



CREATE INDEX "idx_security_logs_email" ON "public"."organization_security_logs" USING "btree" ("user_email");



CREATE INDEX "idx_security_logs_org_type" ON "public"."organization_security_logs" USING "btree" ("organization_id", "event_type");



CREATE INDEX "idx_sequence_enrollments_contact" ON "public"."sequence_enrollments" USING "btree" ("contact_id");



CREATE INDEX "idx_sequence_enrollments_status" ON "public"."sequence_enrollments" USING "btree" ("status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_signup_decisions_domain_date" ON "public"."signup_decisions" USING "btree" ("domain", "created_at");



CREATE INDEX "idx_signup_decisions_org_date" ON "public"."signup_decisions" USING "btree" ("organization_id", "created_at");



CREATE INDEX "idx_slide_templates_active" ON "public"."slide_templates" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_slide_templates_org" ON "public"."slide_templates" USING "btree" ("organization_id");



CREATE INDEX "idx_slide_templates_type" ON "public"."slide_templates" USING "btree" ("template_type");



CREATE INDEX "idx_source_docs_account" ON "public"."source_documents" USING "btree" ("account_id") WHERE ("account_id" IS NOT NULL);



CREATE INDEX "idx_source_docs_created" ON "public"."source_documents" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_source_docs_deal" ON "public"."source_documents" USING "btree" ("deal_id") WHERE ("deal_id" IS NOT NULL);



CREATE INDEX "idx_source_docs_meeting_date" ON "public"."source_documents" USING "btree" ("meeting_date") WHERE ("meeting_date" IS NOT NULL);



CREATE INDEX "idx_source_docs_not_archived" ON "public"."source_documents" USING "btree" ("organization_id", "is_archived") WHERE ("is_archived" = false);



CREATE INDEX "idx_source_docs_org" ON "public"."source_documents" USING "btree" ("organization_id");



CREATE INDEX "idx_source_docs_search" ON "public"."source_documents" USING "gin" ("search_vector");



CREATE INDEX "idx_source_docs_session" ON "public"."source_documents" USING "btree" ("chat_session_id") WHERE ("chat_session_id" IS NOT NULL);



CREATE INDEX "idx_source_docs_type" ON "public"."source_documents" USING "btree" ("source_type");



CREATE INDEX "idx_source_docs_user" ON "public"."source_documents" USING "btree" ("user_id");



CREATE INDEX "idx_suggested_actions_contact_id" ON "public"."suggested_actions" USING "btree" ("contact_id");



CREATE INDEX "idx_suggested_actions_deal_id" ON "public"."suggested_actions" USING "btree" ("deal_id");



CREATE UNIQUE INDEX "idx_suggested_actions_dedup_active" ON "public"."suggested_actions" USING "btree" ("dedup_key") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_suggested_actions_org_status" ON "public"."suggested_actions" USING "btree" ("organization_id", "status");



CREATE INDEX "idx_suggested_actions_priority" ON "public"."suggested_actions" USING "btree" ("priority");



CREATE INDEX "idx_system_prompt_config_active" ON "public"."system_prompt_config" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "idx_system_prompt_config_active_by_section" ON "public"."system_prompt_config" USING "btree" ("section_type", "is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_system_prompt_config_deactivated_by" ON "public"."system_prompt_config" USING "btree" ("deactivated_by") WHERE ("deactivated_by" IS NOT NULL);



CREATE INDEX "idx_system_prompt_config_sections" ON "public"."system_prompt_config" USING "btree" ("section_type", "section_order", "is_active");



CREATE INDEX "idx_tasks_account_id" ON "public"."tasks" USING "btree" ("account_id");



CREATE INDEX "idx_tasks_contact_id" ON "public"."tasks" USING "btree" ("contact_id");



CREATE INDEX "idx_tasks_contact_id_open" ON "public"."tasks" USING "btree" ("contact_id", "due_date") WHERE (("contact_id" IS NOT NULL) AND ("completed" = false));



CREATE INDEX "idx_tasks_created_at" ON "public"."tasks" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_tasks_deal_id" ON "public"."tasks" USING "btree" ("deal_id");



CREATE INDEX "idx_tasks_deal_id_open" ON "public"."tasks" USING "btree" ("deal_id", "due_date") WHERE (("deal_id" IS NOT NULL) AND ("completed" = false));



CREATE INDEX "idx_tasks_fulltext_search" ON "public"."tasks" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))));



CREATE INDEX "idx_tasks_google_event_id" ON "public"."tasks" USING "btree" ("google_event_id") WHERE ("google_event_id" IS NOT NULL);



CREATE INDEX "idx_tasks_org_created_id" ON "public"."tasks" USING "btree" ("organization_id", "created_at" DESC, "id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_tasks_org_user" ON "public"."tasks" USING "btree" ("organization_id", "user_id") WHERE ("organization_id" IS NOT NULL);



CREATE INDEX "idx_tasks_organization_id" ON "public"."tasks" USING "btree" ("organization_id");



CREATE INDEX "idx_tasks_organization_search" ON "public"."tasks" USING "btree" ("organization_id", "status", "priority", "due_date");



CREATE INDEX "idx_tasks_source" ON "public"."tasks" USING "btree" ("source_document_id") WHERE ("source_document_id" IS NOT NULL);



CREATE INDEX "idx_tasks_text_search" ON "public"."tasks" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((COALESCE("title", ''::"text") || ' '::"text") || COALESCE("description", ''::"text"))));



CREATE INDEX "idx_tasks_updated_at" ON "public"."tasks" USING "btree" ("updated_at" DESC);



CREATE INDEX "idx_template_slot_mappings_slide" ON "public"."template_slot_mappings" USING "btree" ("template_id", "slide_index");



CREATE INDEX "idx_template_slot_mappings_template" ON "public"."template_slot_mappings" USING "btree" ("template_id");



CREATE UNIQUE INDEX "idx_unique_account_name_org" ON "public"."accounts" USING "btree" ("organization_id", "name");



CREATE UNIQUE INDEX "idx_unique_contact_email_org" ON "public"."contacts" USING "btree" ("organization_id", "email") WHERE ("email" IS NOT NULL);



CREATE INDEX "idx_uploaded_files_created" ON "public"."uploaded_files" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_uploaded_files_org" ON "public"."uploaded_files" USING "btree" ("organization_id");



CREATE INDEX "idx_uploaded_files_search" ON "public"."uploaded_files" USING "gin" ("to_tsvector"('"english"'::"regconfig", "searchable_content"));



CREATE INDEX "idx_uploaded_files_session" ON "public"."uploaded_files" USING "btree" ("chat_session_id");



CREATE INDEX "idx_uploaded_files_status" ON "public"."uploaded_files" USING "btree" ("processing_status");



CREATE INDEX "idx_uploaded_files_type" ON "public"."uploaded_files" USING "btree" ("file_type");



CREATE INDEX "idx_uploaded_files_user" ON "public"."uploaded_files" USING "btree" ("user_id");



CREATE INDEX "idx_user_comp_assignments_user" ON "public"."user_compensation_assignments" USING "btree" ("user_id", "organization_id");



CREATE INDEX "idx_user_prompt_prefs_user_id" ON "public"."user_prompt_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_user_quotas_org_active" ON "public"."user_quotas" USING "btree" ("organization_id", "is_active");



CREATE INDEX "idx_user_quotas_user_org" ON "public"."user_quotas" USING "btree" ("user_id", "organization_id");









CREATE INDEX "idx_web_events_org" ON ONLY "public"."web_events" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "idx_web_events_page_category" ON ONLY "public"."web_events" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "idx_web_events_visitor" ON ONLY "public"."web_events" USING "btree" ("visitor_id", "occurred_at" DESC);












CREATE INDEX "web_events_2026_01_organization_id_occurred_at_idx" ON "public"."web_events_2026_01" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_01_page_category_occurred_at_idx" ON "public"."web_events_2026_01" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_01_visitor_id_occurred_at_idx" ON "public"."web_events_2026_01" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_02_organization_id_occurred_at_idx" ON "public"."web_events_2026_02" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_02_page_category_occurred_at_idx" ON "public"."web_events_2026_02" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_02_visitor_id_occurred_at_idx" ON "public"."web_events_2026_02" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_03_organization_id_occurred_at_idx" ON "public"."web_events_2026_03" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_03_page_category_occurred_at_idx" ON "public"."web_events_2026_03" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_03_visitor_id_occurred_at_idx" ON "public"."web_events_2026_03" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_04_organization_id_occurred_at_idx" ON "public"."web_events_2026_04" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_04_page_category_occurred_at_idx" ON "public"."web_events_2026_04" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_04_visitor_id_occurred_at_idx" ON "public"."web_events_2026_04" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_05_organization_id_occurred_at_idx" ON "public"."web_events_2026_05" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_05_page_category_occurred_at_idx" ON "public"."web_events_2026_05" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_05_visitor_id_occurred_at_idx" ON "public"."web_events_2026_05" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_06_organization_id_occurred_at_idx" ON "public"."web_events_2026_06" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_06_page_category_occurred_at_idx" ON "public"."web_events_2026_06" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_06_visitor_id_occurred_at_idx" ON "public"."web_events_2026_06" USING "btree" ("visitor_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_07_organization_id_occurred_at_idx" ON "public"."web_events_2026_07" USING "btree" ("organization_id", "occurred_at" DESC);



CREATE INDEX "web_events_2026_07_page_category_occurred_at_idx" ON "public"."web_events_2026_07" USING "btree" ("page_category", "occurred_at" DESC);



CREATE INDEX "web_events_2026_07_visitor_id_occurred_at_idx" ON "public"."web_events_2026_07" USING "btree" ("visitor_id", "occurred_at" DESC);



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_01_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_01_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_01_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_01_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_02_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_02_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_02_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_02_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_03_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_03_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_03_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_03_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_04_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_04_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_04_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_04_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_05_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_05_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_05_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_05_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_06_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_06_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_06_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_06_visitor_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_org" ATTACH PARTITION "public"."web_events_2026_07_organization_id_occurred_at_idx";



ALTER INDEX "public"."idx_web_events_page_category" ATTACH PARTITION "public"."web_events_2026_07_page_category_occurred_at_idx";



ALTER INDEX "public"."web_events_pkey" ATTACH PARTITION "public"."web_events_2026_07_pkey";



ALTER INDEX "public"."idx_web_events_visitor" ATTACH PARTITION "public"."web_events_2026_07_visitor_id_occurred_at_idx";



CREATE OR REPLACE TRIGGER "audit_accounts_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_sensitive_operations"();



CREATE OR REPLACE TRIGGER "audit_contacts_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_sensitive_operations"();



CREATE OR REPLACE TRIGGER "audit_deals_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."audit_sensitive_operations"();



CREATE OR REPLACE TRIGGER "audit_organization_invites" AFTER INSERT OR DELETE OR UPDATE ON "public"."organization_invites" FOR EACH ROW EXECUTE FUNCTION "public"."audit_sensitive_operations"();



CREATE OR REPLACE TRIGGER "audit_organization_members" AFTER INSERT OR DELETE OR UPDATE ON "public"."organization_members" FOR EACH ROW EXECUTE FUNCTION "public"."audit_sensitive_operations"();



CREATE OR REPLACE TRIGGER "calendar_event_sync_updated_at" BEFORE UPDATE ON "public"."calendar_event_sync" FOR EACH ROW EXECUTE FUNCTION "public"."update_calendar_watch_updated_at"();



CREATE OR REPLACE TRIGGER "calendar_watch_channels_updated_at" BEFORE UPDATE ON "public"."calendar_watch_channels" FOR EACH ROW EXECUTE FUNCTION "public"."update_calendar_watch_updated_at"();



CREATE OR REPLACE TRIGGER "check_invitation_rate_limit_trigger" BEFORE INSERT ON "public"."organization_invites" FOR EACH ROW EXECUTE FUNCTION "public"."check_invitation_rate_limit"();



CREATE OR REPLACE TRIGGER "deal_contact_after_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."deal_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."log_deal_contact_history"();



CREATE OR REPLACE TRIGGER "deal_contact_before_trigger" BEFORE INSERT OR DELETE OR UPDATE ON "public"."deal_contacts" FOR EACH ROW EXECUTE FUNCTION "public"."compute_deal_contact_quadrant"();



CREATE OR REPLACE TRIGGER "extract_account_domain" BEFORE INSERT OR UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."extract_domain_from_website"();



CREATE OR REPLACE TRIGGER "generate_account_reference" AFTER INSERT OR UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."generate_entity_reference"();



CREATE OR REPLACE TRIGGER "generate_activity_reference" AFTER INSERT OR UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."generate_entity_reference"();



CREATE OR REPLACE TRIGGER "generate_contact_reference" AFTER INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."generate_entity_reference"();



CREATE OR REPLACE TRIGGER "generate_deal_reference" AFTER INSERT OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."generate_entity_reference"();



CREATE OR REPLACE TRIGGER "generate_task_reference" AFTER INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."generate_entity_reference"();



CREATE OR REPLACE TRIGGER "handle_prompt_approval_trigger" AFTER INSERT ON "public"."prompt_approvals" FOR EACH ROW EXECUTE FUNCTION "public"."handle_prompt_approval"();



CREATE OR REPLACE TRIGGER "on_deal_closed_won" AFTER INSERT OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."promote_account_on_closed_won"();



CREATE OR REPLACE TRIGGER "on_profile_created_create_prompt_prefs" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_default_user_prompt_preferences"();



CREATE OR REPLACE TRIGGER "trg_auto_forecast_category" BEFORE INSERT OR UPDATE OF "probability" ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."auto_suggest_forecast_category"();



CREATE OR REPLACE TRIGGER "trg_backfill_emails" AFTER INSERT OR UPDATE OF "email" ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."backfill_email_messages_for_contact"();



CREATE OR REPLACE TRIGGER "trg_capture_deal_outcome_learning" AFTER UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."capture_deal_outcome_learning_event"();



CREATE OR REPLACE TRIGGER "trg_embed_account" AFTER INSERT OR UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_generate_embedding"();



CREATE OR REPLACE TRIGGER "trg_embed_activity" AFTER INSERT OR UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_generate_embedding"();



CREATE OR REPLACE TRIGGER "trg_embed_contact" AFTER INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_generate_embedding"();



CREATE OR REPLACE TRIGGER "trg_embed_deal" AFTER INSERT OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_generate_embedding"();



CREATE OR REPLACE TRIGGER "trg_embed_task" AFTER INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_generate_embedding"();



CREATE OR REPLACE TRIGGER "trg_hot_lead_alert" AFTER INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_hot_lead_alert"();



CREATE OR REPLACE TRIGGER "trg_log_account_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_activity"();



CREATE OR REPLACE TRIGGER "trg_log_contact_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_activity"();



CREATE OR REPLACE TRIGGER "trg_log_deal_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_activity"();



CREATE OR REPLACE TRIGGER "trg_log_task_activity" AFTER INSERT OR DELETE OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."log_crm_activity"();



CREATE OR REPLACE TRIGGER "trg_overdue_task_alert" AFTER UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_overdue_task_alert"();



CREATE OR REPLACE TRIGGER "trg_probability_drop_alert" AFTER UPDATE OF "probability" ON "public"."deals" FOR EACH ROW WHEN ((("old"."probability" IS NOT NULL) AND ("new"."probability" IS NOT NULL) AND (("old"."probability" - "new"."probability") >= 20))) EXECUTE FUNCTION "public"."trigger_probability_drop_alert"();



CREATE OR REPLACE TRIGGER "trg_stage_regression_alert" AFTER UPDATE OF "stage" ON "public"."deals" FOR EACH ROW WHEN (("old"."stage" IS DISTINCT FROM "new"."stage")) EXECUTE FUNCTION "public"."trigger_stage_regression_alert"();



CREATE OR REPLACE TRIGGER "trg_track_first_activity" AFTER INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."track_first_activity"();



CREATE OR REPLACE TRIGGER "trigger_org_custom_skills_updated_at" BEFORE UPDATE ON "public"."organization_custom_skills" FOR EACH ROW EXECUTE FUNCTION "public"."update_org_custom_skills_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_promote_leads_on_deal_closed" AFTER UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."promote_leads_on_deal_closed"();



CREATE OR REPLACE TRIGGER "trigger_set_customer_since" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_customer_since_date"();



CREATE OR REPLACE TRIGGER "trigger_set_deal_closed_at" BEFORE UPDATE ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."set_deal_closed_at"();



CREATE OR REPLACE TRIGGER "trigger_set_invite_code" BEFORE INSERT ON "public"."organization_invites" FOR EACH ROW EXECUTE FUNCTION "public"."set_invite_code"();



CREATE OR REPLACE TRIGGER "trigger_track_contact_status_change" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."track_contact_status_change"();



CREATE OR REPLACE TRIGGER "trigger_update_lead_scores" BEFORE INSERT OR UPDATE OF "budget_status", "authority_level", "need_urgency", "timeline_status", "fit_score", "intent_score", "engagement_score" ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_lead_scores"();



CREATE OR REPLACE TRIGGER "trigger_update_uploaded_files_updated_at" BEFORE UPDATE ON "public"."uploaded_files" FOR EACH ROW EXECUTE FUNCTION "public"."update_uploaded_files_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_user_prompt_preferences_updated_at" BEFORE UPDATE ON "public"."user_prompt_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_user_prompt_preferences_updated_at"();



CREATE OR REPLACE TRIGGER "update_account_ltv_on_deal_close" AFTER INSERT OR UPDATE OF "stage", "amount" ON "public"."deals" FOR EACH ROW EXECUTE FUNCTION "public"."update_account_ltv"();



CREATE OR REPLACE TRIGGER "update_admin_job_executions_updated_at" BEFORE UPDATE ON "public"."admin_job_executions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();






CREATE OR REPLACE TRIGGER "update_client_memory_updated_at" BEFORE UPDATE ON "public"."client_memory" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_commission_records_updated_at" BEFORE UPDATE ON "public"."commission_records" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_company_profiles_updated_at" BEFORE UPDATE ON "public"."company_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_compensation_plans_updated_at" BEFORE UPDATE ON "public"."compensation_plans" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_daily_briefings_updated_at" BEFORE UPDATE ON "public"."daily_briefings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_deal_notes_updated_at" BEFORE UPDATE ON "public"."deal_notes" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_deal_terms_updated_at" BEFORE UPDATE ON "public"."deal_terms" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_entity_definitions_updated_at" BEFORE UPDATE ON "public"."entity_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_entity_fields_updated_at" BEFORE UPDATE ON "public"."entity_fields" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();






CREATE OR REPLACE TRIGGER "update_generated_presentations_updated_at" BEFORE UPDATE ON "public"."generated_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_google_tokens_updated_at" BEFORE UPDATE ON "public"."google_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lead_scores_updated_at" BEFORE UPDATE ON "public"."lead_scores" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_lead_scoring_rules_updated_at" BEFORE UPDATE ON "public"."lead_scoring_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_organization_join_requests_updated_at" BEFORE UPDATE ON "public"."organization_join_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();






CREATE OR REPLACE TRIGGER "update_sales_quotas_updated_at" BEFORE UPDATE ON "public"."sales_quotas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_saved_artifacts_updated_at" BEFORE UPDATE ON "public"."saved_artifacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_slide_generation_preferences_updated_at" BEFORE UPDATE ON "public"."slide_generation_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_slide_templates_updated_at" BEFORE UPDATE ON "public"."slide_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_source_documents_updated_at" BEFORE UPDATE ON "public"."source_documents" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_suggested_actions_updated_at" BEFORE UPDATE ON "public"."suggested_actions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_ai_preferences_updated_at" BEFORE UPDATE ON "public"."user_ai_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_user_quotas_updated_at" BEFORE UPDATE ON "public"."user_quotas" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();






CREATE OR REPLACE TRIGGER "validate_email_contacts" BEFORE INSERT OR UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."validate_email_format"();



CREATE OR REPLACE TRIGGER "validate_email_profiles" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_email_format"();



ALTER TABLE ONLY "public"."account_ltv_history"
    ADD CONSTRAINT "account_ltv_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."account_ltv_history"
    ADD CONSTRAINT "account_ltv_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."admin_job_executions"
    ADD CONSTRAINT "admin_job_executions_triggered_by_user_id_fkey" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."admin_job_progress"
    ADD CONSTRAINT "admin_job_progress_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."admin_job_executions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."admin_job_executions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_notifications"
    ADD CONSTRAINT "admin_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."approval_rules"
    ADD CONSTRAINT "approval_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");






ALTER TABLE ONLY "public"."calendar_event_sync"
    ADD CONSTRAINT "calendar_event_sync_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calendar_event_sync"
    ADD CONSTRAINT "calendar_event_sync_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_event_sync"
    ADD CONSTRAINT "calendar_event_sync_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_tokens"
    ADD CONSTRAINT "calendar_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_watch_channels"
    ADD CONSTRAINT "calendar_watch_channels_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."calendar_watch_channels"
    ADD CONSTRAINT "calendar_watch_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_contacts"
    ADD CONSTRAINT "campaign_contacts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_contacts"
    ADD CONSTRAINT "campaign_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_contacts"
    ADD CONSTRAINT "campaign_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_deals"
    ADD CONSTRAINT "campaign_deals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_deals"
    ADD CONSTRAINT "campaign_deals_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_deals"
    ADD CONSTRAINT "campaign_deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_context_memory"
    ADD CONSTRAINT "chat_context_memory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."chat_context_memory"
    ADD CONSTRAINT "chat_context_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."chat_intent_patterns"
    ADD CONSTRAINT "chat_intent_patterns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_pending_actions"
    ADD CONSTRAINT "chat_pending_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_pending_actions"
    ADD CONSTRAINT "chat_pending_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_pending_actions"
    ADD CONSTRAINT "chat_pending_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_response_cache"
    ADD CONSTRAINT "chat_response_cache_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chat_response_cache"
    ADD CONSTRAINT "chat_response_cache_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_memory"
    ADD CONSTRAINT "client_memory_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_memory"
    ADD CONSTRAINT "client_memory_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."commission_records"
    ADD CONSTRAINT "commission_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_profiles"
    ADD CONSTRAINT "company_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."compensation_plans"
    ADD CONSTRAINT "compensation_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."compensation_plans"
    ADD CONSTRAINT "compensation_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_disqualified_by_fkey" FOREIGN KEY ("disqualified_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."custom_roles"
    ADD CONSTRAINT "custom_roles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."daily_briefings"
    ADD CONSTRAINT "daily_briefings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_briefings"
    ADD CONSTRAINT "daily_briefings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_attachments"
    ADD CONSTRAINT "deal_attachments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_attachments"
    ADD CONSTRAINT "deal_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."deal_attachments"
    ADD CONSTRAINT "deal_attachments_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deal_contact_history"
    ADD CONSTRAINT "deal_contact_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deal_contact_history"
    ADD CONSTRAINT "deal_contact_history_deal_contact_id_fkey" FOREIGN KEY ("deal_contact_id") REFERENCES "public"."deal_contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deal_contact_history"
    ADD CONSTRAINT "deal_contact_history_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_contacts"
    ADD CONSTRAINT "deal_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "public"."product_features"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deal_feature_gaps"
    ADD CONSTRAINT "deal_feature_gaps_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "deal_notes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "deal_notes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."deal_notes"
    ADD CONSTRAINT "deal_notes_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deal_terms"
    ADD CONSTRAINT "deal_terms_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deal_terms"
    ADD CONSTRAINT "deal_terms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_first_touch_campaign_id_fkey" FOREIGN KEY ("first_touch_campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_last_touch_campaign_id_fkey" FOREIGN KEY ("last_touch_campaign_id") REFERENCES "public"."campaigns"("id");



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "deals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."decision_traces"
    ADD CONSTRAINT "decision_traces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."decision_traces"
    ADD CONSTRAINT "decision_traces_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_engagement_stats"
    ADD CONSTRAINT "email_engagement_stats_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_engagement_stats"
    ADD CONSTRAINT "email_engagement_stats_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_messages"
    ADD CONSTRAINT "email_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."email_sync_state"
    ADD CONSTRAINT "email_sync_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."embeddings"
    ADD CONSTRAINT "embeddings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrichment_logs"
    ADD CONSTRAINT "enrichment_logs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."enrichment_logs"
    ADD CONSTRAINT "enrichment_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrichment_provider_configs"
    ADD CONSTRAINT "enrichment_provider_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrichment_provider_configs"
    ADD CONSTRAINT "enrichment_provider_configs_provider_definition_id_fkey" FOREIGN KEY ("provider_definition_id") REFERENCES "public"."enrichment_provider_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."enrichment_provider_definitions"
    ADD CONSTRAINT "enrichment_provider_definitions_created_by_org_fkey" FOREIGN KEY ("created_by_org") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_definitions"
    ADD CONSTRAINT "entity_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_fields"
    ADD CONSTRAINT "entity_fields_entity_definition_id_fkey" FOREIGN KEY ("entity_definition_id") REFERENCES "public"."entity_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_permissions"
    ADD CONSTRAINT "entity_permissions_entity_definition_id_fkey" FOREIGN KEY ("entity_definition_id") REFERENCES "public"."entity_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entity_references"
    ADD CONSTRAINT "entity_references_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."entity_tags"
    ADD CONSTRAINT "entity_tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_tags"
    ADD CONSTRAINT "entity_tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."extraction_records"
    ADD CONSTRAINT "extraction_records_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."extraction_records"
    ADD CONSTRAINT "extraction_records_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_linked_feature_id_fkey" FOREIGN KEY ("linked_feature_id") REFERENCES "public"."product_features"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_source_contact_id_fkey" FOREIGN KEY ("source_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."feature_requests"
    ADD CONSTRAINT "feature_requests_source_deal_id_fkey" FOREIGN KEY ("source_deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."file_extraction_log"
    ADD CONSTRAINT "file_extraction_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."file_extraction_log"
    ADD CONSTRAINT "file_extraction_log_uploaded_file_id_fkey" FOREIGN KEY ("uploaded_file_id") REFERENCES "public"."uploaded_files"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "fk_contacts_account_id" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "fk_deals_account_id" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."deals"
    ADD CONSTRAINT "fk_deals_contact_id" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "fk_tasks_account_id" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "fk_tasks_contact_id" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "fk_tasks_deal_id" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."slide_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."generated_presentations"
    ADD CONSTRAINT "generated_presentations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."google_tokens"
    ADD CONSTRAINT "google_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intervention_outcomes"
    ADD CONSTRAINT "intervention_outcomes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intervention_outcomes"
    ADD CONSTRAINT "intervention_outcomes_suggested_action_id_fkey" FOREIGN KEY ("suggested_action_id") REFERENCES "public"."suggested_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intervention_outcomes"
    ADD CONSTRAINT "intervention_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invitation_rate_limits"
    ADD CONSTRAINT "invitation_rate_limits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."join_requests"
    ADD CONSTRAINT "join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ltv_benchmarks"
    ADD CONSTRAINT "ltv_benchmarks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_log"
    ADD CONSTRAINT "message_log_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_log"
    ADD CONSTRAINT "message_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."messaging_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_log"
    ADD CONSTRAINT "message_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messaging_sessions"
    ADD CONSTRAINT "messaging_sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messaging_sessions"
    ADD CONSTRAINT "messaging_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id");



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_custom_skills"
    ADD CONSTRAINT "organization_custom_skills_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organization_custom_skills"
    ADD CONSTRAINT "organization_custom_skills_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invitations"
    ADD CONSTRAINT "organization_invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_invites"
    ADD CONSTRAINT "organization_invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_sales_role_updated_by_fkey" FOREIGN KEY ("sales_role_updated_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."organization_members"
    ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_security_logs"
    ADD CONSTRAINT "organization_security_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_tracking_config"
    ADD CONSTRAINT "organization_tracking_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;






ALTER TABLE ONLY "public"."proactive_policies"
    ADD CONSTRAINT "proactive_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_features"
    ADD CONSTRAINT "product_features_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_features"
    ADD CONSTRAINT "product_features_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_mentions"
    ADD CONSTRAINT "product_mentions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."prompt_approvals"
    ADD CONSTRAINT "prompt_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."prompt_change_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."query_accuracy_logs"
    ADD CONSTRAINT "query_accuracy_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."query_accuracy_logs"
    ADD CONSTRAINT "query_accuracy_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_learning_events"
    ADD CONSTRAINT "sales_learning_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."sales_learning_profiles"
    ADD CONSTRAINT "sales_learning_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_quotas"
    ADD CONSTRAINT "sales_quotas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."sales_quotas"
    ADD CONSTRAINT "sales_quotas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sales_quotas"
    ADD CONSTRAINT "sales_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_artifacts"
    ADD CONSTRAINT "saved_artifacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."saved_artifacts"
    ADD CONSTRAINT "saved_artifacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."search_config"
    ADD CONSTRAINT "search_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_enrolled_by_fkey" FOREIGN KEY ("enrolled_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequence_enrollments"
    ADD CONSTRAINT "sequence_enrollments_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sequences"
    ADD CONSTRAINT "sequences_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."sequences"
    ADD CONSTRAINT "sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."signup_decisions"
    ADD CONSTRAINT "signup_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."slide_generation_preferences"
    ADD CONSTRAINT "slide_generation_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."slide_templates"
    ADD CONSTRAINT "slide_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."slide_templates"
    ADD CONSTRAINT "slide_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."source_documents"
    ADD CONSTRAINT "source_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."suggested_actions"
    ADD CONSTRAINT "suggested_actions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suggested_actions"
    ADD CONSTRAINT "suggested_actions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."suggested_actions"
    ADD CONSTRAINT "suggested_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_prompt_config"
    ADD CONSTRAINT "system_prompt_config_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."template_slot_mappings"
    ADD CONSTRAINT "template_slot_mappings_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."slide_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_ai_preferences"
    ADD CONSTRAINT "user_ai_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_channel_registrations"
    ADD CONSTRAINT "user_channel_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_compensation_plan_id_fkey" FOREIGN KEY ("compensation_plan_id") REFERENCES "public"."compensation_plans"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_compensation_assignments"
    ADD CONSTRAINT "user_compensation_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_prompt_preferences"
    ADD CONSTRAINT "user_prompt_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_quotas"
    ADD CONSTRAINT "user_quotas_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."custom_roles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_role_assignments"
    ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."visitor_identity_map"
    ADD CONSTRAINT "visitor_identity_map_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_identity_map"
    ADD CONSTRAINT "visitor_identity_map_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."visitor_identity_map"
    ADD CONSTRAINT "visitor_identity_map_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."web_events_monthly_summary"
    ADD CONSTRAINT "web_events_monthly_summary_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."web_events_monthly_summary"
    ADD CONSTRAINT "web_events_monthly_summary_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;






ALTER TABLE ONLY "public"."workflow_rules"
    ADD CONSTRAINT "workflow_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workflow_rules"
    ADD CONSTRAINT "workflow_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create approvals" ON "public"."prompt_approvals" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))) AND ("approved_by" = "auth"."uid"())));



CREATE POLICY "Admins can manage benchmarks" ON "public"."ltv_benchmarks" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can manage company profile" ON "public"."company_profiles" USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "company_profiles"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Admins can manage custom roles" ON "public"."custom_roles" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage feature requests" ON "public"."feature_requests" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can manage features" ON "public"."product_features" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can manage proactive policies" ON "public"."proactive_policies" TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true) AND ("om"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))) WITH CHECK (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true) AND ("om"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Admins can manage products" ON "public"."products" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Admins can manage role assignments" ON "public"."user_role_assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage system prompts" ON "public"."system_prompt_config" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can manage templates" ON "public"."role_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update requests" ON "public"."prompt_change_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all approvals" ON "public"."prompt_approvals" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can view all profiles" ON "public"."profiles" FOR SELECT USING (("public"."get_current_user_role"() = 'admin'::"text"));



CREATE POLICY "Admins can view all requests" ON "public"."prompt_change_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins create invites" ON "public"."organization_invites" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "organization_invites"."org_id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));









CREATE POLICY "Anyone can view fields for accessible definitions" ON "public"."entity_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_fields"."entity_definition_id") AND (("ed"."organization_id" IS NULL) OR ("ed"."organization_id" = ANY ("public"."get_user_organization_ids"())))))));



CREATE POLICY "Anyone can view global entity definitions" ON "public"."entity_definitions" FOR SELECT USING (("organization_id" IS NULL));



CREATE POLICY "Anyone can view permissions for accessible definitions" ON "public"."entity_permissions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_permissions"."entity_definition_id") AND (("ed"."organization_id" IS NULL) OR ("ed"."organization_id" = ANY ("public"."get_user_organization_ids"())))))));



CREATE POLICY "Anyone can view public email domains" ON "public"."public_email_domains" FOR SELECT USING (true);












CREATE POLICY "Authorized roles can update company profiles" ON "public"."company_profiles" FOR UPDATE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "company_profiles"."organization_id") AND ("organization_members"."is_active" = true) AND (("organization_members"."role" = 'admin'::"text") OR ("organization_members"."sales_role" = ANY (ARRAY['revops'::"text", 'marketing'::"text", 'admin'::"text"]))))))));



CREATE POLICY "Everyone can view active system prompt" ON "public"."system_prompt_config" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Everyone can view active templates" ON "public"."role_templates" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Everyone can view public email domains" ON "public"."public_email_domains" FOR SELECT USING (true);



CREATE POLICY "Managers can create assignments" ON "public"."user_compensation_assignments" FOR INSERT WITH CHECK ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can create compensation plans" ON "public"."compensation_plans" FOR INSERT WITH CHECK ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can create quotas" ON "public"."user_quotas" FOR INSERT WITH CHECK ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can delete assignments" ON "public"."user_compensation_assignments" FOR DELETE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can delete compensation plans" ON "public"."compensation_plans" FOR DELETE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can delete quotas" ON "public"."user_quotas" FOR DELETE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can update assignments" ON "public"."user_compensation_assignments" FOR UPDATE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can update commissions" ON "public"."commission_records" FOR UPDATE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can update compensation plans" ON "public"."compensation_plans" FOR UPDATE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can update quotas" ON "public"."user_quotas" FOR UPDATE USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can view all assignments in org" ON "public"."user_compensation_assignments" FOR SELECT USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can view all commissions in org" ON "public"."commission_records" FOR SELECT USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can view all compensation plans" ON "public"."compensation_plans" FOR SELECT USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "Managers can view all quotas in org" ON "public"."user_quotas" FOR SELECT USING ("public"."can_manage_compensation"("organization_id"));



CREATE POLICY "No direct membership inserts" ON "public"."organization_members" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only system functions can create notifications" ON "public"."admin_notifications" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only system functions can insert job progress" ON "public"."admin_job_progress" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only system functions can insert pending actions" ON "public"."chat_pending_actions" FOR INSERT WITH CHECK (false);



CREATE POLICY "Only system functions can insert signup decisions" ON "public"."signup_decisions" FOR INSERT WITH CHECK (false);



CREATE POLICY "Org admins can create custom provider definitions" ON "public"."enrichment_provider_definitions" FOR INSERT TO "authenticated" WITH CHECK ((("is_system_default" = false) AND ("created_by_org" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



CREATE POLICY "Org admins can manage provider configs" ON "public"."enrichment_provider_configs" TO "authenticated" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "Org admins can manage their entity definitions" ON "public"."entity_definitions" USING ("public"."is_organization_admin"("organization_id")) WITH CHECK ("public"."is_organization_admin"("organization_id"));



CREATE POLICY "Org admins can manage their entity fields" ON "public"."entity_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_fields"."entity_definition_id") AND "public"."is_organization_admin"("ed"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_fields"."entity_definition_id") AND "public"."is_organization_admin"("ed"."organization_id")))));



CREATE POLICY "Org admins can manage their entity permissions" ON "public"."entity_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_permissions"."entity_definition_id") AND "public"."is_organization_admin"("ed"."organization_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_permissions"."entity_definition_id") AND "public"."is_organization_admin"("ed"."organization_id")))));



CREATE POLICY "Org admins can manage tracking config" ON "public"."organization_tracking_config" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org admins can update their custom provider definitions" ON "public"."enrichment_provider_definitions" FOR UPDATE TO "authenticated" USING ((("is_system_default" = false) AND ("created_by_org" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



CREATE POLICY "Org admins can view all briefings" ON "public"."daily_briefings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."organization_id" = "daily_briefings"."organization_id") AND ("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Org members can insert enrichment logs" ON "public"."enrichment_logs" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Org members can read company profile" ON "public"."company_profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "company_profiles"."organization_id") AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org members can view email engagement stats" ON "public"."email_engagement_stats" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org members can view enrichment logs" ON "public"."enrichment_logs" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Org members can view identity map" ON "public"."visitor_identity_map" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org members can view monthly summary" ON "public"."web_events_monthly_summary" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org members can view templates" ON "public"."message_templates" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Org members can view their entity definitions" ON "public"."entity_definitions" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Org members can view their org logs" ON "public"."query_accuracy_logs" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Org members can view their provider configs" ON "public"."enrichment_provider_configs" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Org members can view tracking config" ON "public"."organization_tracking_config" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Org members can view web events" ON "public"."web_events" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can manage invitations" ON "public"."organization_invitations" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"text") AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can update join requests" ON "public"."join_requests" FOR UPDATE USING ("public"."is_organization_admin"("organization_id"));



CREATE POLICY "Organization admins can update join requests" ON "public"."organization_join_requests" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can update members" ON "public"."organization_members" FOR UPDATE USING ("public"."is_organization_admin"("organization_id"));



CREATE POLICY "Organization admins can update their organizations" ON "public"."organizations" FOR UPDATE USING (("id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"text") AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can view activity logs" ON "public"."user_activity_logs" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can view join requests" ON "public"."organization_join_requests" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can view join requests for their organizati" ON "public"."join_requests" FOR SELECT USING ("public"."is_organization_admin"("organization_id"));



CREATE POLICY "Organization admins can view security logs" ON "public"."organization_security_logs" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"text") AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Organization admins can view signup decisions" ON "public"."signup_decisions" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."role" = 'admin'::"text") AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Platform admins can delete whitelist" ON "public"."admin_email_whitelist" FOR DELETE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can insert" ON "public"."platform_admins" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can insert whitelist" ON "public"."admin_email_whitelist" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can manage global entity definitions" ON "public"."entity_definitions" USING (("public"."is_platform_admin"() AND ("organization_id" IS NULL))) WITH CHECK (("public"."is_platform_admin"() AND ("organization_id" IS NULL)));



CREATE POLICY "Platform admins can manage global entity fields" ON "public"."entity_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_fields"."entity_definition_id") AND ("ed"."organization_id" IS NULL) AND "public"."is_platform_admin"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_fields"."entity_definition_id") AND ("ed"."organization_id" IS NULL) AND "public"."is_platform_admin"()))));



CREATE POLICY "Platform admins can manage global entity permissions" ON "public"."entity_permissions" USING ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_permissions"."entity_definition_id") AND ("ed"."organization_id" IS NULL) AND "public"."is_platform_admin"())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."entity_definitions" "ed"
  WHERE (("ed"."id" = "entity_permissions"."entity_definition_id") AND ("ed"."organization_id" IS NULL) AND "public"."is_platform_admin"()))));



CREATE POLICY "Platform admins can update" ON "public"."platform_admins" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can update whitelist" ON "public"."admin_email_whitelist" FOR UPDATE TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Platform admins can view all" ON "public"."platform_admins" FOR SELECT TO "authenticated" USING (("public"."is_platform_admin"() OR ("user_id" = "auth"."uid"())));



CREATE POLICY "Platform admins can view whitelist" ON "public"."admin_email_whitelist" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



CREATE POLICY "Quota managers can create quotas" ON "public"."sales_quotas" FOR INSERT WITH CHECK ("public"."can_manage_quotas"("organization_id"));



CREATE POLICY "Quota managers can delete quotas" ON "public"."sales_quotas" FOR DELETE USING ("public"."can_manage_quotas"("organization_id"));



CREATE POLICY "Quota managers can update quotas" ON "public"."sales_quotas" FOR UPDATE USING ("public"."can_manage_quotas"("organization_id"));



CREATE POLICY "Service role can manage all tags" ON "public"."entity_tags" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage embeddings" ON "public"."embeddings" USING (true) WITH CHECK (true);



CREATE POLICY "Service role can manage search config" ON "public"."search_config" USING (true) WITH CHECK (true);






CREATE POLICY "Service role full access to chat response cache" ON "public"."chat_response_cache" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to decision traces" ON "public"."decision_traces" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to email_engagement_stats" ON "public"."email_engagement_stats" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to email_messages" ON "public"."email_messages" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to email_sync_state" ON "public"."email_sync_state" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to intervention outcomes" ON "public"."intervention_outcomes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to messages" ON "public"."message_log" USING ((( SELECT ("auth"."jwt"() ->> 'role'::"text")) = 'service_role'::"text"));



CREATE POLICY "Service role full access to notification queue" ON "public"."notification_queue" USING ((( SELECT ("auth"."jwt"() ->> 'role'::"text")) = 'service_role'::"text"));



CREATE POLICY "Service role full access to proactive policies" ON "public"."proactive_policies" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to product_mentions" ON "public"."product_mentions" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "Service role full access to sales learning events" ON "public"."sales_learning_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to sales learning profiles" ON "public"."sales_learning_profiles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role full access to sessions" ON "public"."messaging_sessions" USING ((( SELECT ("auth"."jwt"() ->> 'role'::"text")) = 'service_role'::"text"));



CREATE POLICY "Service role full access to templates" ON "public"."message_templates" USING ((( SELECT ("auth"."jwt"() ->> 'role'::"text")) = 'service_role'::"text"));



CREATE POLICY "System can create commission records" ON "public"."commission_records" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "System can delete expired actions" ON "public"."chat_pending_actions" FOR DELETE USING (("expires_at" < "now"()));



CREATE POLICY "System provider definitions are readable by all authenticated u" ON "public"."enrichment_provider_definitions" FOR SELECT TO "authenticated" USING ((("is_system_default" = true) OR ("created_by_org" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can create accounts in their organization" ON "public"."accounts" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create activities in their organization" ON "public"."activities" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create contacts in their organization" ON "public"."contacts" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create data quality metrics in their organization" ON "public"."data_quality_metrics" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create deal attachments in their org" ON "public"."deal_attachments" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create deal contacts in their org" ON "public"."deal_contacts" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create deal notes in their org" ON "public"."deal_notes" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create deals in their organization" ON "public"."deals" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create feature gaps in their org" ON "public"."deal_feature_gaps" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create feature requests" ON "public"."feature_requests" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create jobs in their organization" ON "public"."admin_job_executions" FOR INSERT WITH CHECK ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND ("triggered_by_user_id" = "auth"."uid"())));



CREATE POLICY "Users can create join requests" ON "public"."join_requests" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create lead scores in their organization" ON "public"."lead_scores" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create lead scoring rules in their organization" ON "public"."lead_scoring_rules" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create messages in their sessions" ON "public"."chat_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."session_id") AND ("chat_sessions"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Users can create own join requests" ON "public"."organization_join_requests" FOR INSERT WITH CHECK (("user_email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text"));



CREATE POLICY "Users can create pipeline velocity metrics in their organizatio" ON "public"."pipeline_velocity_metrics" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create requests" ON "public"."prompt_change_requests" FOR INSERT WITH CHECK (("requested_by" = "auth"."uid"()));



CREATE POLICY "Users can create tasks in their organization" ON "public"."tasks" FOR INSERT WITH CHECK (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can create their own AI preferences" ON "public"."user_ai_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can create their own artifacts" ON "public"."saved_artifacts" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own chat sessions" ON "public"."chat_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete accounts in their organization" ON "public"."accounts" FOR DELETE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can delete activities in their organization" ON "public"."activities" FOR DELETE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can delete client memory in their org" ON "public"."client_memory" FOR DELETE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete contacts in their organization" ON "public"."contacts" FOR DELETE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can delete deal contacts in their org" ON "public"."deal_contacts" FOR DELETE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete deal_terms in their org" ON "public"."deal_terms" FOR DELETE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete deals in their organization" ON "public"."deals" FOR DELETE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can delete own preferences" ON "public"."user_prompt_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete suggested actions in their org" ON "public"."suggested_actions" FOR DELETE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete tasks in their organization" ON "public"."tasks" FOR DELETE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can delete their own AI preferences" ON "public"."user_ai_preferences" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own artifacts" ON "public"."saved_artifacts" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own chat context memory" ON "public"."chat_context_memory" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own deal attachments" ON "public"."deal_attachments" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own deal notes" ON "public"."deal_notes" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own source docs" ON "public"."source_documents" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own uploaded files" ON "public"."uploaded_files" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert audit logs in their organization" ON "public"."audit_log" FOR INSERT WITH CHECK ((("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert client memory in their org" ON "public"."client_memory" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert deal contact history in their org" ON "public"."deal_contact_history" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert deal_terms in their org" ON "public"."deal_terms" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert extraction records in their org" ON "public"."extraction_records" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert files to their organization" ON "public"."uploaded_files" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert intervention outcomes in their org" ON "public"."intervention_outcomes" FOR INSERT TO "authenticated" WITH CHECK (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can insert own preferences" ON "public"."user_prompt_preferences" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert product_mentions in their org" ON "public"."product_mentions" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Users can insert source docs in their org" ON "public"."source_documents" FOR INSERT WITH CHECK ((("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can insert suggested actions in their org" ON "public"."suggested_actions" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert their own briefings" ON "public"."daily_briefings" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own chat context memory" ON "public"."chat_context_memory" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own email sync state" ON "public"."email_sync_state" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own channel registrations" ON "public"."user_channel_registrations" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage own notification preferences" ON "public"."user_notification_preferences" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can manage tags in their org" ON "public"."entity_tags" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"())))) WITH CHECK (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can manage their own Google tokens" ON "public"."google_tokens" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage their own calendar tokens" ON "public"."calendar_tokens" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read org quotas" ON "public"."sales_quotas" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update accounts in their organization" ON "public"."accounts" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update activities in their organization" ON "public"."activities" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update audit logs in their organization" ON "public"."audit_log" FOR UPDATE USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))) WITH CHECK (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can update client memory in their org" ON "public"."client_memory" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update contacts in their organization" ON "public"."contacts" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update deal contacts in their org" ON "public"."deal_contacts" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update deal_terms in their org" ON "public"."deal_terms" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update deals in their organization" ON "public"."deals" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update extraction records in their org" ON "public"."extraction_records" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update jobs they created" ON "public"."admin_job_executions" FOR UPDATE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND ("triggered_by_user_id" = "auth"."uid"())));



CREATE POLICY "Users can update lead scores in their organization" ON "public"."lead_scores" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update lead scoring rules in their organization" ON "public"."lead_scoring_rules" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update own preferences" ON "public"."user_prompt_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update product_mentions in their org" ON "public"."product_mentions" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Users can update suggested actions in their org" ON "public"."suggested_actions" FOR UPDATE USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update tasks in their organization" ON "public"."tasks" FOR UPDATE USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can update their own AI preferences" ON "public"."user_ai_preferences" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own artifacts" ON "public"."saved_artifacts" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own briefings" ON "public"."daily_briefings" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own chat context memory" ON "public"."chat_context_memory" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own chat sessions" ON "public"."chat_sessions" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own deal notes" ON "public"."deal_notes" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own email sync state" ON "public"."email_sync_state" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own notifications" ON "public"."admin_notifications" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own query logs" ON "public"."query_accuracy_logs" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own source docs" ON "public"."source_documents" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own uploaded files" ON "public"."uploaded_files" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view LTV history in their org" ON "public"."account_ltv_history" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view accounts in their organization" ON "public"."accounts" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view active compensation plans in org" ON "public"."compensation_plans" FOR SELECT USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND ("is_active" = true)));



CREATE POLICY "Users can view active custom roles" ON "public"."custom_roles" FOR SELECT USING (("is_active" = true));



CREATE POLICY "Users can view activities in their organization" ON "public"."activities" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view approval rules in their organization" ON "public"."approval_rules" FOR SELECT USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) OR ("organization_id" IS NULL)));



CREATE POLICY "Users can view audit logs in their organization" ON "public"."audit_log" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view benchmarks in their org" ON "public"."ltv_benchmarks" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view calendar tokens in their organization" ON "public"."calendar_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view client memory in their org" ON "public"."client_memory" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view contacts in their organization" ON "public"."contacts" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view data quality metrics in their organization" ON "public"."data_quality_metrics" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view deal attachments in their org" ON "public"."deal_attachments" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view deal contact history in their org" ON "public"."deal_contact_history" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view deal contacts in their org" ON "public"."deal_contacts" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view deal notes in their org" ON "public"."deal_notes" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view deal_terms in their org" ON "public"."deal_terms" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view deals in their organization" ON "public"."deals" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view decision traces in their org" ON "public"."decision_traces" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can view embeddings in their org" ON "public"."embeddings" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view entity references in their organization" ON "public"."entity_references" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view extraction logs from their organization" ON "public"."file_extraction_log" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view extraction records in their org" ON "public"."extraction_records" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view feature gaps in their org" ON "public"."deal_feature_gaps" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view feature requests in their org" ON "public"."feature_requests" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view features in their org" ON "public"."product_features" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view files from their organization" ON "public"."uploaded_files" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view google tokens in their organization" ON "public"."google_tokens" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view intent patterns in their organization" ON "public"."chat_intent_patterns" FOR SELECT USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) OR ("organization_id" IS NULL)));



CREATE POLICY "Users can view intervention outcomes in their org" ON "public"."intervention_outcomes" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can view jobs in their organization" ON "public"."admin_job_executions" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view lead scores in their organization" ON "public"."lead_scores" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view lead scoring rules in their organization" ON "public"."lead_scoring_rules" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view members of their organizations" ON "public"."organization_members" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view messages from their sessions" ON "public"."chat_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."chat_sessions"
  WHERE (("chat_sessions"."id" = "chat_messages"."session_id") AND ("chat_sessions"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view organizations they are members of" ON "public"."organizations" FOR SELECT USING (("id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Users can view own messages" ON "public"."message_log" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view own preferences" ON "public"."user_prompt_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own sessions" ON "public"."messaging_sessions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view pipeline velocity metrics in their organization" ON "public"."pipeline_velocity_metrics" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view proactive policies in their org" ON "public"."proactive_policies" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can view product_mentions in their org" ON "public"."product_mentions" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "Users can view products in their org" ON "public"."products" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view progress for jobs in their organization" ON "public"."admin_job_progress" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_job_executions"
  WHERE (("admin_job_executions"."id" = "admin_job_progress"."job_id") AND ("admin_job_executions"."organization_id" = ANY ("public"."get_user_organization_ids"()))))));



CREATE POLICY "Users can view quotas in their organization" ON "public"."sales_quotas" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view sales learning events in their org" ON "public"."sales_learning_events" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can view sales learning profiles in their org" ON "public"."sales_learning_profiles" FOR SELECT TO "authenticated" USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



CREATE POLICY "Users can view search config in their org" ON "public"."search_config" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view shared artifacts in their organization" ON "public"."saved_artifacts" FOR SELECT USING ((("is_shared" = true) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "Users can view source docs in their org" ON "public"."source_documents" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view suggested actions in their org" ON "public"."suggested_actions" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view tags in their org" ON "public"."entity_tags" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view tasks in their organization" ON "public"."tasks" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view their organization notifications" ON "public"."admin_notifications" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "Users can view their own AI preferences" ON "public"."user_ai_preferences" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own activity logs" ON "public"."user_activity_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own assignment" ON "public"."user_compensation_assignments" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "Users can view their own assignments" ON "public"."user_role_assignments" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own briefings" ON "public"."daily_briefings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own chat context" ON "public"."chat_context_memory" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own chat sessions" ON "public"."chat_sessions" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own commissions" ON "public"."commission_records" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "Users can view their own email messages" ON "public"."email_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own email sync state" ON "public"."email_sync_state" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own join requests" ON "public"."join_requests" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own quota" ON "public"."user_quotas" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "Users can view their own requests" ON "public"."prompt_change_requests" FOR SELECT USING (("requested_by" = "auth"."uid"()));



CREATE POLICY "Users can view their own saved artifacts" ON "public"."saved_artifacts" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their pending actions" ON "public"."chat_pending_actions" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "View own invites" ON "public"."organization_invites" FOR SELECT TO "authenticated" USING ((("email" = ("auth"."jwt"() ->> 'email'::"text")) AND ("accepted_at" IS NULL) AND ("expires_at" > "now"())));




























































ALTER TABLE "public"."account_ltv_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_email_whitelist" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_job_executions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_job_progress" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_delete" ON "public"."organization_custom_skills" FOR DELETE USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "admins_insert" ON "public"."organization_custom_skills" FOR INSERT WITH CHECK (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



CREATE POLICY "admins_update" ON "public"."organization_custom_skills" FOR UPDATE USING (("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))));



ALTER TABLE "public"."approval_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;




ALTER TABLE "public"."calendar_event_sync" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_event_sync_delete" ON "public"."calendar_event_sync" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_event_sync_insert" ON "public"."calendar_event_sync" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_event_sync_select" ON "public"."calendar_event_sync" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_event_sync_update" ON "public"."calendar_event_sync" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



ALTER TABLE "public"."calendar_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_watch_channels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calendar_watch_channels_delete" ON "public"."calendar_watch_channels" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_watch_channels_insert" ON "public"."calendar_watch_channels" FOR INSERT WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_watch_channels_select" ON "public"."calendar_watch_channels" FOR SELECT USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



CREATE POLICY "calendar_watch_channels_update" ON "public"."calendar_watch_channels" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))))) WITH CHECK ((("user_id" = "auth"."uid"()) AND ("organization_id" IN ( SELECT "om"."organization_id"
   FROM "public"."organization_members" "om"
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true))))));



ALTER TABLE "public"."campaign_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_context_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_intent_patterns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_pending_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_response_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."chat_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."commission_records" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."company_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compensation_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."custom_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_briefings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."data_quality_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_contact_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_feature_gaps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deal_terms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."deals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."decision_traces" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_engagement_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."email_sync_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."embeddings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrichment_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrichment_provider_configs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."enrichment_provider_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_fields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_fields_org_access" ON "public"."entity_fields" USING (("entity_definition_id" IN ( SELECT "ed"."id"
   FROM ("public"."entity_definitions" "ed"
     JOIN "public"."organization_members" "om" ON (("ed"."organization_id" = "om"."organization_id")))
  WHERE (("om"."user_id" = "auth"."uid"()) AND ("om"."is_active" = true)))));



ALTER TABLE "public"."entity_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_references" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."extraction_records" ENABLE ROW LEVEL SECURITY;




ALTER TABLE "public"."feature_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."file_extraction_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."generated_presentations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "generated_presentations_delete" ON "public"."generated_presentations" FOR DELETE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



CREATE POLICY "generated_presentations_insert" ON "public"."generated_presentations" FOR INSERT WITH CHECK ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "generated_presentations_select" ON "public"."generated_presentations" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "generated_presentations_update" ON "public"."generated_presentations" FOR UPDATE USING ((("user_id" = "auth"."uid"()) AND ("organization_id" = ANY ("public"."get_user_organization_ids"()))));



ALTER TABLE "public"."google_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intervention_outcomes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitation_rate_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lead_scoring_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ltv_benchmarks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "managers_view_team_activities" ON "public"."activities" FOR SELECT USING ((("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))) AND (("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."manager_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "activities"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])) AND ("organization_members"."is_active" = true)))))));



CREATE POLICY "managers_view_team_contacts" ON "public"."contacts" FOR SELECT USING ((("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))) AND (("user_id" = "auth"."uid"()) OR ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."manager_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "contacts"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])) AND ("organization_members"."is_active" = true)))))));



CREATE POLICY "managers_view_team_deals" ON "public"."deals" FOR SELECT USING ((("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))) AND (("user_id" = "auth"."uid"()) OR ("assigned_to" = "auth"."uid"()) OR ("user_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."manager_id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."organization_id" = "deals"."organization_id") AND ("organization_members"."role" = ANY (ARRAY['admin'::"text", 'manager'::"text"])) AND ("organization_members"."is_active" = true)))))));



ALTER TABLE "public"."message_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messaging_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_queue" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_members_select" ON "public"."organization_custom_skills" FOR SELECT USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "org_members_view_campaign_contacts" ON "public"."campaign_contacts" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "org_members_view_campaign_deals" ON "public"."campaign_deals" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



CREATE POLICY "org_members_view_campaigns" ON "public"."campaigns" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE (("organization_members"."user_id" = "auth"."uid"()) AND ("organization_members"."is_active" = true)))));



ALTER TABLE "public"."organization_custom_skills" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_join_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_security_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_tracking_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pipeline_stages_org_access" ON "public"."pipeline_stages" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."pipeline_velocity_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_admins" ENABLE ROW LEVEL SECURITY;




ALTER TABLE "public"."proactive_policies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_features" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_mentions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prompt_approvals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prompt_change_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."public_email_domains" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."query_accuracy_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."query_plan_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_learning_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_learning_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sales_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."saved_artifacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sequence_enrollments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sequence_enrollments_org_access" ON "public"."sequence_enrollments" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



ALTER TABLE "public"."sequences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sequences_org_access" ON "public"."sequences" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));



CREATE POLICY "service_role_select" ON "public"."organization_custom_skills" FOR SELECT USING (true);



ALTER TABLE "public"."signup_decisions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."slide_generation_preferences" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slide_generation_preferences_delete" ON "public"."slide_generation_preferences" FOR DELETE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



CREATE POLICY "slide_generation_preferences_insert" ON "public"."slide_generation_preferences" FOR INSERT WITH CHECK ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



CREATE POLICY "slide_generation_preferences_select" ON "public"."slide_generation_preferences" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "slide_generation_preferences_update" ON "public"."slide_generation_preferences" FOR UPDATE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



ALTER TABLE "public"."slide_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "slide_templates_delete" ON "public"."slide_templates" FOR DELETE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



CREATE POLICY "slide_templates_insert" ON "public"."slide_templates" FOR INSERT WITH CHECK ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



CREATE POLICY "slide_templates_select" ON "public"."slide_templates" FOR SELECT USING (("organization_id" = ANY ("public"."get_user_organization_ids"())));



CREATE POLICY "slide_templates_update" ON "public"."slide_templates" FOR UPDATE USING ((("organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("organization_id")));



ALTER TABLE "public"."source_documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."suggested_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_prompt_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."template_slot_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "template_slot_mappings_delete" ON "public"."template_slot_mappings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."slide_templates" "st"
  WHERE (("st"."id" = "template_slot_mappings"."template_id") AND ("st"."organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("st"."organization_id")))));



CREATE POLICY "template_slot_mappings_insert" ON "public"."template_slot_mappings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."slide_templates" "st"
  WHERE (("st"."id" = "template_slot_mappings"."template_id") AND ("st"."organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("st"."organization_id")))));



CREATE POLICY "template_slot_mappings_select" ON "public"."template_slot_mappings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."slide_templates" "st"
  WHERE (("st"."id" = "template_slot_mappings"."template_id") AND ("st"."organization_id" = ANY ("public"."get_user_organization_ids"()))))));



CREATE POLICY "template_slot_mappings_update" ON "public"."template_slot_mappings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."slide_templates" "st"
  WHERE (("st"."id" = "template_slot_mappings"."template_id") AND ("st"."organization_id" = ANY ("public"."get_user_organization_ids"())) AND "public"."is_org_admin"("st"."organization_id")))));



ALTER TABLE "public"."uploaded_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_activity_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_ai_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_channel_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_compensation_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_prompt_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_quotas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_role_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."visitor_identity_map" ENABLE ROW LEVEL SECURITY;




ALTER TABLE "public"."web_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_01" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_02" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_03" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_04" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_05" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_06" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_2026_07" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_events_monthly_summary" ENABLE ROW LEVEL SECURITY;






ALTER TABLE "public"."workflow_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_rules_org_access" ON "public"."workflow_rules" USING (("organization_id" IN ( SELECT "organization_members"."organization_id"
   FROM "public"."organization_members"
  WHERE ("organization_members"."user_id" = "auth"."uid"()))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."accounts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."activities";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."chat_sessions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."contacts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."deals";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."suggested_actions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tasks";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_out"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_send"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_out"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_send"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_halfvec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_sparsevec"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_float4"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_sparsevec"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_to_vector"("public"."halfvec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_halfvec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_to_vector"("public"."sparsevec", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_halfvec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_sparsevec"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."activate_prompt_section"("p_content" "text", "p_section_type" "text", "p_section_title" "text", "p_section_order" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."activate_prompt_section"("p_content" "text", "p_section_type" "text", "p_section_title" "text", "p_section_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_prompt_section"("p_content" "text", "p_section_type" "text", "p_section_title" "text", "p_section_order" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_domain" "text", "p_owner_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_domain" "text", "p_owner_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_organization"("p_name" "text", "p_domain" "text", "p_owner_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_get_all_users"("page_offset" integer, "page_limit" integer, "search_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_get_all_users"("page_offset" integer, "page_limit" integer, "search_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_get_all_users"("page_offset" integer, "page_limit" integer, "search_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_manage_user_org"("p_user_id" "uuid", "p_target_org_id" "uuid", "p_role" "text", "p_action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."admin_manage_user_org"("p_user_id" "uuid", "p_target_org_id" "uuid", "p_role" "text", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_manage_user_org"("p_user_id" "uuid", "p_target_org_id" "uuid", "p_role" "text", "p_action" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_update_organization"("p_org_id" "uuid", "p_name" "text", "p_domain" "text", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."admin_update_organization"("p_org_id" "uuid", "p_name" "text", "p_domain" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_organization"("p_org_id" "uuid", "p_name" "text", "p_domain" "text", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."analyze_data_quality_with_recommendations"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analyze_data_quality_with_recommendations"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analyze_data_quality_with_recommendations"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_sales_role"("p_member_id" "uuid", "p_approved_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_sales_role"("p_member_id" "uuid", "p_approved_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_sales_role"("p_member_id" "uuid", "p_approved_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_sensitive_operations"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_sensitive_operations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_sensitive_operations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_promote_whitelisted_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_promote_whitelisted_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_promote_whitelisted_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auto_suggest_forecast_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_suggest_forecast_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_suggest_forecast_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."backfill_email_messages_for_contact"() TO "anon";
GRANT ALL ON FUNCTION "public"."backfill_email_messages_for_contact"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_email_messages_for_contact"() TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."binary_quantize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_bant_score"("p_budget_status" "text", "p_authority_level" "text", "p_need_urgency" "text", "p_timeline_status" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_bant_score"("p_budget_status" "text", "p_authority_level" "text", "p_need_urgency" "text", "p_timeline_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_bant_score"("p_budget_status" "text", "p_authority_level" "text", "p_need_urgency" "text", "p_timeline_status" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_feature_gap_impact"("p_organization_id" "uuid", "p_feature_name" "text", "p_days_back" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_feature_gap_impact"("p_organization_id" "uuid", "p_feature_name" "text", "p_days_back" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_feature_gap_impact"("p_organization_id" "uuid", "p_feature_name" "text", "p_days_back" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_lead_score"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_lead_score"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_lead_score"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_overall_lead_score"("p_fit_score" integer, "p_intent_score" integer, "p_engagement_score" integer, "p_bant_score" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_overall_lead_score"("p_fit_score" integer, "p_intent_score" integer, "p_engagement_score" integer, "p_bant_score" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_overall_lead_score"("p_fit_score" integer, "p_intent_score" integer, "p_engagement_score" integer, "p_bant_score" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_compensation"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_compensation"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_compensation"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_quotas"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_quotas"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_quotas"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_deal_outcome_learning_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."capture_deal_outcome_learning_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."capture_deal_outcome_learning_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_invitation_rate_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_invitation_rate_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_invitation_rate_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_partition_rls_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_partition_rls_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_partition_rls_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_security_definer_functions"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_security_definer_functions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_security_definer_functions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_signup_rate_limit"("user_email" "text", "org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."check_signup_rate_limit"("user_email" "text", "org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_signup_rate_limit"("user_email" "text", "org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_chat_response_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_chat_response_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_chat_response_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_old_web_events"("p_retention_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_old_web_events"("p_retention_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_old_web_events"("p_retention_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_orphaned_organizations"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_organizations"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_orphaned_organizations"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_query_plan_cache"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_query_plan_cache"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_query_plan_cache"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complete_job_execution"("p_job_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."complete_job_execution"("p_job_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_job_execution"("p_job_id" "uuid", "p_status" "text", "p_results" "jsonb", "p_error_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_amount_band"("p_amount" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_amount_band"("p_amount" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_amount_band"("p_amount" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_deal_contact_quadrant"() TO "anon";
GRANT ALL ON FUNCTION "public"."compute_deal_contact_quadrant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_deal_contact_quadrant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."compute_quadrant"("support" numeric, "influence" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."compute_quadrant"("support" numeric, "influence" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_quadrant"("support" numeric, "influence" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_admin_notification"("p_organization_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_job_id" "uuid", "p_action_label" "text", "p_action_data" "jsonb", "p_is_persistent" boolean, "p_expires_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_admin_notification"("p_organization_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_job_id" "uuid", "p_action_label" "text", "p_action_data" "jsonb", "p_is_persistent" boolean, "p_expires_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_notification"("p_organization_id" "uuid", "p_user_id" "uuid", "p_type" "text", "p_title" "text", "p_message" "text", "p_job_id" "uuid", "p_action_label" "text", "p_action_data" "jsonb", "p_is_persistent" boolean, "p_expires_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_bulk_invitations"("org_id" "uuid", "email_list" "text"[], "default_role" "text", "invited_by_user" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_bulk_invitations"("org_id" "uuid", "email_list" "text"[], "default_role" "text", "invited_by_user" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_bulk_invitations"("org_id" "uuid", "email_list" "text"[], "default_role" "text", "invited_by_user" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_default_user_prompt_preferences"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_default_user_prompt_preferences"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_default_user_prompt_preferences"() TO "service_role";



GRANT ALL ON FUNCTION "public"."create_demo_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_demo_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_demo_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_organization"("org_name" "text", "org_domain" "text", "org_industry" "text", "org_size" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_web_events_partition_if_needed"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_web_events_partition_if_needed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_web_events_partition_if_needed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."deactivate_prompt_section"("p_section_type" "text", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."deactivate_prompt_section"("p_section_type" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."deactivate_prompt_section"("p_section_type" "text", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."encrypt_sensitive_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."encrypt_sensitive_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."encrypt_sensitive_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_analytics_query"("p_entity" "text", "p_metrics" "text"[], "p_metric_field" "text", "p_group_by" "text", "p_time_start" timestamp with time zone, "p_time_end" timestamp with time zone, "p_time_field" "text", "p_calculation" "text", "p_limit" integer, "p_order_by" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_analytics_query"("p_entity" "text", "p_metrics" "text"[], "p_metric_field" "text", "p_group_by" "text", "p_time_start" timestamp with time zone, "p_time_end" timestamp with time zone, "p_time_field" "text", "p_calculation" "text", "p_limit" integer, "p_order_by" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_analytics_query"("p_entity" "text", "p_metrics" "text"[], "p_metric_field" "text", "p_group_by" "text", "p_time_start" timestamp with time zone, "p_time_end" timestamp with time zone, "p_time_field" "text", "p_calculation" "text", "p_limit" integer, "p_order_by" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_domain_from_website"() TO "anon";
GRANT ALL ON FUNCTION "public"."extract_domain_from_website"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_domain_from_website"() TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_root_domain"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_root_domain"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_root_domain"("email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_organization_by_domain_secure"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_organization_by_domain_secure"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_organization_by_domain_secure"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fuzzy_search_accounts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."fuzzy_search_accounts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuzzy_search_accounts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."fuzzy_search_contacts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."fuzzy_search_contacts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuzzy_search_contacts"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."fuzzy_search_deals"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."fuzzy_search_deals"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fuzzy_search_deals"("search_query" "text", "org_id" "uuid", "min_similarity" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_entity_reference"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_entity_reference"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_entity_reference"() TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_deal_summary"("p_account_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_deal_summary"("p_account_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_deal_summary"("p_account_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_account_opportunity_history"("p_account_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_account_opportunity_history"("p_account_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_account_opportunity_history"("p_account_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_admin_organization_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_admin_organization_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_organization_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_analytics_data_secure"("p_organization_id" "uuid", "p_data_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_analytics_data_secure"("p_organization_id" "uuid", "p_data_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_analytics_data_secure"("p_organization_id" "uuid", "p_data_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_contact_context_for_llm"("p_contact_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deal_context_for_llm"("p_deal_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_deal_stage_transitions"("p_organization_id" "uuid", "p_deal_id" "uuid", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_deal_stage_transitions"("p_organization_id" "uuid", "p_deal_id" "uuid", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_deal_stage_transitions"("p_organization_id" "uuid", "p_deal_id" "uuid", "p_date_from" timestamp with time zone, "p_date_to" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_entity_messages"("p_entity_type" "text", "p_entity_id" "uuid", "p_organization_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_failing_queries"("p_organization_id" "uuid", "p_since" timestamp with time zone, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_failing_queries"("p_organization_id" "uuid", "p_since" timestamp with time zone, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_failing_queries"("p_organization_id" "uuid", "p_since" timestamp with time zone, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_briefing"("p_user_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_briefing"("p_user_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_briefing"("p_user_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_org_system_prompt"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_org_system_prompt"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_org_system_prompt"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pipeline_context_for_llm"("p_user_id" "uuid", "p_organization_id" "uuid", "p_period_start" "date", "p_period_end" "date", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pipeline_health_dashboard"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pipeline_health_dashboard"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pipeline_health_dashboard"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_pipeline_stats"("p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sales_cycle_analytics"("p_organization_id" "uuid", "p_amount_min" numeric, "p_amount_max" numeric, "p_analysis_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sales_cycle_analytics"("p_organization_id" "uuid", "p_amount_min" numeric, "p_amount_max" numeric, "p_analysis_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sales_cycle_analytics"("p_organization_id" "uuid", "p_amount_min" numeric, "p_amount_max" numeric, "p_analysis_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_search_accuracy_metrics"("p_organization_id" "uuid", "p_since" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."get_search_accuracy_metrics"("p_organization_id" "uuid", "p_since" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_search_accuracy_metrics"("p_organization_id" "uuid", "p_since" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_health_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_health_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_health_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_analytics_overview"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_analytics_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_analytics_overview"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_crm_stats"("user_org_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_crm_stats"("user_org_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_crm_stats"("user_org_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_crm_stats_optimized"("user_org_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_crm_stats_optimized"("user_org_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_crm_stats_optimized"("user_org_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_last_login"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_last_login"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_last_login"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_organization_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_organization_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_organization_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role_in_org"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_segment_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_segment_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_segment_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_web_engagement_summary"("p_contact_id" "uuid", "p_account_id" "uuid", "p_organization_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_web_engagement_summary"("p_contact_id" "uuid", "p_account_id" "uuid", "p_organization_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_web_engagement_summary"("p_contact_id" "uuid", "p_account_id" "uuid", "p_organization_id" "uuid", "p_days" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_accum"(double precision[], "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_add"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_cmp"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_concat"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_eq"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ge"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_gt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_l2_squared_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_le"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_lt"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_mul"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_ne"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_negative_inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_spherical_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."halfvec_sub"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hamming_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_auth_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_login"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_prompt_approval"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_prompt_approval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_prompt_approval"() TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnsw_sparsevec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."hybrid_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."hybrid_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hybrid_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_calendar_sync_count"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_calendar_sync_count"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_calendar_sync_count"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_search_attempt"("p_session_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_search_attempt"("p_session_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_search_attempt"("p_session_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."infer_user_role"("email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."infer_user_role"("email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."infer_user_role"("email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_org_admin_or_role"("p_org_id" "uuid", "p_required_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_admin_or_role"("p_org_id" "uuid", "p_required_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin_or_role"("p_org_id" "uuid", "p_required_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_organization_admin"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_organization_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_organization_admin"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("user_uuid" "uuid") TO "service_role";






GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_bit_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflat_halfvec_support"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "postgres";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "anon";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "authenticated";
GRANT ALL ON FUNCTION "public"."jaccard_distance"(bit, bit) TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."halfvec", "public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_norm"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_normalize"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_visitor_to_contact"("p_visitor_id" "text", "p_organization_id" "uuid", "p_contact_id" "uuid", "p_account_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_visitor_to_contact"("p_visitor_id" "text", "p_organization_id" "uuid", "p_contact_id" "uuid", "p_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_visitor_to_contact"("p_visitor_id" "text", "p_organization_id" "uuid", "p_contact_id" "uuid", "p_account_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_crm_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_deal_contact_history"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_deal_contact_history"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_deal_contact_history"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_security_event"("p_event_type" "text", "p_details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_organization_id" "uuid", "p_activity_type" "text", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_organization_id" "uuid", "p_activity_type" "text", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_user_activity"("p_user_id" "uuid", "p_organization_id" "uuid", "p_activity_type" "text", "p_metadata" "jsonb", "p_ip_address" "inet", "p_user_agent" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_product_mention_to_catalog"("p_org_id" "uuid", "p_product_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."match_product_mention_to_catalog"("p_org_id" "uuid", "p_product_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_product_mention_to_catalog"("p_org_id" "uuid", "p_product_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_user_async"("p_user_id" "uuid", "p_org_id" "uuid", "p_type" "text", "p_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."notify_user_async"("p_user_id" "uuid", "p_org_id" "uuid", "p_type" "text", "p_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_user_async"("p_user_id" "uuid", "p_org_id" "uuid", "p_type" "text", "p_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_chat_message"("p_message_id" "uuid", "p_content" "text", "p_session_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_chat_message"("p_message_id" "uuid", "p_content" "text", "p_session_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_chat_message"("p_message_id" "uuid", "p_content" "text", "p_session_id" "uuid", "p_user_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_account_on_closed_won"() TO "anon";
GRANT ALL ON FUNCTION "public"."promote_account_on_closed_won"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_account_on_closed_won"() TO "service_role";



GRANT ALL ON FUNCTION "public"."promote_leads_on_deal_closed"() TO "anon";
GRANT ALL ON FUNCTION "public"."promote_leads_on_deal_closed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."promote_leads_on_deal_closed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_analytics_views"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_analytics_views"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_analytics_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."request_to_join_organization"("org_id" "uuid", "requested_role" "text", "message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_to_join_organization"("org_id" "uuid", "requested_role" "text", "message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_to_join_organization"("org_id" "uuid", "requested_role" "text", "message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."request_to_join_organization_secure"("org_id" "uuid", "requested_role" "text", "message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."request_to_join_organization_secure"("org_id" "uuid", "requested_role" "text", "message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_to_join_organization_secure"("org_id" "uuid", "requested_role" "text", "message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_ambiguous_reference"("p_reference" "text", "p_session_id" "uuid", "p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_ambiguous_reference"("p_reference" "text", "p_session_id" "uuid", "p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_ambiguous_reference"("p_reference" "text", "p_session_id" "uuid", "p_organization_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_entity_reference"("p_organization_id" "uuid", "p_reference_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_entity_reference"("p_organization_id" "uuid", "p_reference_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_entity_reference"("p_organization_id" "uuid", "p_reference_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."schedule_analytics_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."schedule_analytics_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."schedule_analytics_refresh"() TO "service_role";



GRANT ALL ON FUNCTION "public"."search_crm_data"("p_table_name" "text", "p_organization_ids" "uuid"[], "p_search_term" "text", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."search_crm_data"("p_table_name" "text", "p_organization_ids" "uuid"[], "p_search_term" "text", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_crm_data"("p_table_name" "text", "p_organization_ids" "uuid"[], "p_search_term" "text", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."semantic_search"("query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_similarity_threshold" double precision, "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."semantic_search"("query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_similarity_threshold" double precision, "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."semantic_search"("query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_similarity_threshold" double precision, "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_customer_since_date"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_customer_since_date"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_customer_since_date"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_deal_closed_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_deal_closed_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_deal_closed_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invite_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_cmp"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_eq"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ge"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_gt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_l2_squared_distance"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_le"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_lt"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_ne"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "anon";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sparsevec_negative_inner_product"("public"."sparsevec", "public"."sparsevec") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."halfvec", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."subvector"("public"."vector", integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."track_contact_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_contact_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_contact_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."track_first_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."track_first_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."track_first_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_generate_embedding"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_generate_embedding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_generate_embedding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_hot_lead_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_hot_lead_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_hot_lead_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_overdue_task_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_overdue_task_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_overdue_task_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_probability_drop_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_probability_drop_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_probability_drop_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_stage_regression_alert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_stage_regression_alert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_stage_regression_alert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."unified_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_tags" "text"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."unified_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_tags" "text"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."unified_search"("p_query" "text", "p_query_embedding" "public"."vector", "p_organization_id" "uuid", "p_entity_types" "text"[], "p_tags" "text"[], "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_account_ltv"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_account_ltv"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_account_ltv"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_calendar_watch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_calendar_watch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_calendar_watch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_job_progress"("p_job_id" "uuid", "p_stage" "text", "p_progress" integer, "p_message" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_job_progress"("p_job_id" "uuid", "p_stage" "text", "p_progress" integer, "p_message" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_job_progress"("p_job_id" "uuid", "p_stage" "text", "p_progress" integer, "p_message" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_lead_scores"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lead_scores"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lead_scores"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_org_custom_skills_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_org_custom_skills_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_org_custom_skills_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_uploaded_files_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_uploaded_files_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_uploaded_files_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_user_prompt_preferences_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_user_prompt_preferences_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_user_prompt_preferences_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_email_format"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_email_format"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_email_format"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_invite_code"("code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_invite_code"("code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_invite_code"("code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_prompt_section_content"("content" "text", "section_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_prompt_section_content"("content" "text", "section_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_prompt_section_content"("content" "text", "section_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_concat"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_email"("verification_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_email"("verification_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_email"("verification_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."halfvec") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";















GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."deals" TO "anon";
GRANT ALL ON TABLE "public"."deals" TO "authenticated";
GRANT ALL ON TABLE "public"."deals" TO "service_role";



GRANT ALL ON TABLE "public"."account_health_mv" TO "anon";
GRANT ALL ON TABLE "public"."account_health_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."account_health_mv" TO "service_role";



GRANT ALL ON TABLE "public"."account_ltv_history" TO "anon";
GRANT ALL ON TABLE "public"."account_ltv_history" TO "authenticated";
GRANT ALL ON TABLE "public"."account_ltv_history" TO "service_role";



GRANT ALL ON SEQUENCE "public"."accounts_account_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."accounts_account_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."accounts_account_number_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activities_activity_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activities_activity_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activities_activity_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_email_whitelist" TO "anon";
GRANT ALL ON TABLE "public"."admin_email_whitelist" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_email_whitelist" TO "service_role";



GRANT ALL ON TABLE "public"."admin_job_executions" TO "anon";
GRANT ALL ON TABLE "public"."admin_job_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_job_executions" TO "service_role";



GRANT ALL ON TABLE "public"."admin_job_progress" TO "anon";
GRANT ALL ON TABLE "public"."admin_job_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_job_progress" TO "service_role";



GRANT ALL ON TABLE "public"."admin_notifications" TO "anon";
GRANT ALL ON TABLE "public"."admin_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."approval_rules" TO "anon";
GRANT ALL ON TABLE "public"."approval_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_rules" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";






GRANT ALL ON TABLE "public"."calendar_event_sync" TO "anon";
GRANT ALL ON TABLE "public"."calendar_event_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_event_sync" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_tokens" TO "anon";
GRANT ALL ON TABLE "public"."calendar_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."calendar_watch_channels" TO "anon";
GRANT ALL ON TABLE "public"."calendar_watch_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_watch_channels" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_contacts" TO "anon";
GRANT ALL ON TABLE "public"."campaign_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_deals" TO "anon";
GRANT ALL ON TABLE "public"."campaign_deals" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_deals" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."chat_context_memory" TO "anon";
GRANT ALL ON TABLE "public"."chat_context_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_context_memory" TO "service_role";



GRANT ALL ON TABLE "public"."chat_intent_patterns" TO "anon";
GRANT ALL ON TABLE "public"."chat_intent_patterns" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_intent_patterns" TO "service_role";



GRANT ALL ON TABLE "public"."chat_messages" TO "anon";
GRANT ALL ON TABLE "public"."chat_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_messages" TO "service_role";



GRANT ALL ON TABLE "public"."chat_pending_actions" TO "anon";
GRANT ALL ON TABLE "public"."chat_pending_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_pending_actions" TO "service_role";



GRANT ALL ON TABLE "public"."chat_response_cache" TO "anon";
GRANT ALL ON TABLE "public"."chat_response_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_response_cache" TO "service_role";



GRANT ALL ON TABLE "public"."chat_sessions" TO "anon";
GRANT ALL ON TABLE "public"."chat_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."chat_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."client_memory" TO "anon";
GRANT ALL ON TABLE "public"."client_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."client_memory" TO "service_role";



GRANT ALL ON TABLE "public"."commission_records" TO "anon";
GRANT ALL ON TABLE "public"."commission_records" TO "authenticated";
GRANT ALL ON TABLE "public"."commission_records" TO "service_role";



GRANT ALL ON TABLE "public"."company_profiles" TO "anon";
GRANT ALL ON TABLE "public"."company_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."company_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."compensation_plans" TO "anon";
GRANT ALL ON TABLE "public"."compensation_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."compensation_plans" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contacts_contact_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contacts_contact_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contacts_contact_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_members" TO "anon";
GRANT ALL ON TABLE "public"."organization_members" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_members" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."crm_dashboard_stats" TO "anon";
GRANT ALL ON TABLE "public"."crm_dashboard_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."crm_dashboard_stats" TO "service_role";



GRANT ALL ON TABLE "public"."custom_roles" TO "anon";
GRANT ALL ON TABLE "public"."custom_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."custom_roles" TO "service_role";



GRANT ALL ON TABLE "public"."customer_engagement_mv" TO "anon";
GRANT ALL ON TABLE "public"."customer_engagement_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_engagement_mv" TO "service_role";



GRANT ALL ON TABLE "public"."daily_briefings" TO "anon";
GRANT ALL ON TABLE "public"."daily_briefings" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_briefings" TO "service_role";



GRANT ALL ON TABLE "public"."data_quality_metrics" TO "anon";
GRANT ALL ON TABLE "public"."data_quality_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."data_quality_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."deal_attachments" TO "anon";
GRANT ALL ON TABLE "public"."deal_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."deal_contact_history" TO "anon";
GRANT ALL ON TABLE "public"."deal_contact_history" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_contact_history" TO "service_role";



GRANT ALL ON TABLE "public"."deal_contacts" TO "anon";
GRANT ALL ON TABLE "public"."deal_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."deal_feature_gaps" TO "anon";
GRANT ALL ON TABLE "public"."deal_feature_gaps" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_feature_gaps" TO "service_role";



GRANT ALL ON TABLE "public"."deal_notes" TO "anon";
GRANT ALL ON TABLE "public"."deal_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_notes" TO "service_role";



GRANT ALL ON TABLE "public"."deal_terms" TO "anon";
GRANT ALL ON TABLE "public"."deal_terms" TO "authenticated";
GRANT ALL ON TABLE "public"."deal_terms" TO "service_role";



GRANT ALL ON SEQUENCE "public"."deals_deal_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."deals_deal_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."deals_deal_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."decision_traces" TO "anon";
GRANT ALL ON TABLE "public"."decision_traces" TO "authenticated";
GRANT ALL ON TABLE "public"."decision_traces" TO "service_role";



GRANT ALL ON TABLE "public"."email_engagement_stats" TO "anon";
GRANT ALL ON TABLE "public"."email_engagement_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."email_engagement_stats" TO "service_role";



GRANT ALL ON TABLE "public"."email_messages" TO "anon";
GRANT ALL ON TABLE "public"."email_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."email_messages" TO "service_role";



GRANT ALL ON TABLE "public"."email_sync_state" TO "anon";
GRANT ALL ON TABLE "public"."email_sync_state" TO "authenticated";
GRANT ALL ON TABLE "public"."email_sync_state" TO "service_role";



GRANT ALL ON TABLE "public"."embeddings" TO "anon";
GRANT ALL ON TABLE "public"."embeddings" TO "authenticated";
GRANT ALL ON TABLE "public"."embeddings" TO "service_role";



GRANT ALL ON TABLE "public"."enrichment_logs" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_logs" TO "service_role";



GRANT ALL ON TABLE "public"."enrichment_provider_configs" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_provider_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_provider_configs" TO "service_role";



GRANT ALL ON TABLE "public"."enrichment_provider_definitions" TO "anon";
GRANT ALL ON TABLE "public"."enrichment_provider_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."enrichment_provider_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."entity_definitions" TO "anon";
GRANT ALL ON TABLE "public"."entity_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."entity_fields" TO "anon";
GRANT ALL ON TABLE "public"."entity_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_fields" TO "service_role";



GRANT ALL ON TABLE "public"."message_log" TO "anon";
GRANT ALL ON TABLE "public"."message_log" TO "authenticated";
GRANT ALL ON TABLE "public"."message_log" TO "service_role";



GRANT ALL ON TABLE "public"."messaging_sessions" TO "anon";
GRANT ALL ON TABLE "public"."messaging_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."messaging_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."entity_messages_unified" TO "anon";
GRANT ALL ON TABLE "public"."entity_messages_unified" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_messages_unified" TO "service_role";



GRANT ALL ON TABLE "public"."entity_permissions" TO "anon";
GRANT ALL ON TABLE "public"."entity_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_permissions" TO "service_role";



GRANT ALL ON TABLE "public"."entity_references" TO "anon";
GRANT ALL ON TABLE "public"."entity_references" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_references" TO "service_role";



GRANT ALL ON TABLE "public"."entity_tags" TO "anon";
GRANT ALL ON TABLE "public"."entity_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_tags" TO "service_role";



GRANT ALL ON TABLE "public"."extraction_records" TO "anon";
GRANT ALL ON TABLE "public"."extraction_records" TO "authenticated";
GRANT ALL ON TABLE "public"."extraction_records" TO "service_role";






GRANT ALL ON TABLE "public"."feature_requests" TO "anon";
GRANT ALL ON TABLE "public"."feature_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_requests" TO "service_role";



GRANT ALL ON TABLE "public"."file_extraction_log" TO "anon";
GRANT ALL ON TABLE "public"."file_extraction_log" TO "authenticated";
GRANT ALL ON TABLE "public"."file_extraction_log" TO "service_role";



GRANT ALL ON TABLE "public"."generated_presentations" TO "anon";
GRANT ALL ON TABLE "public"."generated_presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_presentations" TO "service_role";



GRANT ALL ON TABLE "public"."google_tokens" TO "anon";
GRANT ALL ON TABLE "public"."google_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."google_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."intervention_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."intervention_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."intervention_outcomes" TO "service_role";



GRANT ALL ON TABLE "public"."invitation_rate_limits" TO "anon";
GRANT ALL ON TABLE "public"."invitation_rate_limits" TO "authenticated";
GRANT ALL ON TABLE "public"."invitation_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."join_requests" TO "anon";
GRANT ALL ON TABLE "public"."join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."lead_scores" TO "anon";
GRANT ALL ON TABLE "public"."lead_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scores" TO "service_role";



GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "anon";
GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scoring_rules" TO "service_role";



GRANT ALL ON TABLE "public"."ltv_benchmarks" TO "anon";
GRANT ALL ON TABLE "public"."ltv_benchmarks" TO "authenticated";
GRANT ALL ON TABLE "public"."ltv_benchmarks" TO "service_role";



GRANT ALL ON TABLE "public"."message_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";



GRANT ALL ON TABLE "public"."notification_queue" TO "anon";
GRANT ALL ON TABLE "public"."notification_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_queue" TO "service_role";



GRANT ALL ON TABLE "public"."organization_custom_skills" TO "anon";
GRANT ALL ON TABLE "public"."organization_custom_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_custom_skills" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invitations" TO "anon";
GRANT ALL ON TABLE "public"."organization_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."organization_invites" TO "anon";
GRANT ALL ON TABLE "public"."organization_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_invites" TO "service_role";



GRANT ALL ON TABLE "public"."organization_join_requests" TO "anon";
GRANT ALL ON TABLE "public"."organization_join_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_join_requests" TO "service_role";



GRANT ALL ON TABLE "public"."organization_security_logs" TO "anon";
GRANT ALL ON TABLE "public"."organization_security_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_security_logs" TO "service_role";



GRANT ALL ON TABLE "public"."organization_tracking_config" TO "anon";
GRANT ALL ON TABLE "public"."organization_tracking_config" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_tracking_config" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_velocity_metrics" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_velocity_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_velocity_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."platform_admins" TO "anon";
GRANT ALL ON TABLE "public"."platform_admins" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_admins" TO "service_role";






GRANT ALL ON TABLE "public"."proactive_policies" TO "anon";
GRANT ALL ON TABLE "public"."proactive_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."proactive_policies" TO "service_role";



GRANT ALL ON TABLE "public"."product_features" TO "anon";
GRANT ALL ON TABLE "public"."product_features" TO "authenticated";
GRANT ALL ON TABLE "public"."product_features" TO "service_role";



GRANT ALL ON TABLE "public"."product_gap_insights" TO "anon";
GRANT ALL ON TABLE "public"."product_gap_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."product_gap_insights" TO "service_role";



GRANT ALL ON TABLE "public"."product_mentions" TO "anon";
GRANT ALL ON TABLE "public"."product_mentions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_mentions" TO "service_role";



GRANT ALL ON TABLE "public"."product_mention_summary" TO "anon";
GRANT ALL ON TABLE "public"."product_mention_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."product_mention_summary" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_approvals" TO "anon";
GRANT ALL ON TABLE "public"."prompt_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."prompt_change_requests" TO "anon";
GRANT ALL ON TABLE "public"."prompt_change_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."prompt_change_requests" TO "service_role";



GRANT ALL ON TABLE "public"."public_email_domains" TO "anon";
GRANT ALL ON TABLE "public"."public_email_domains" TO "authenticated";
GRANT ALL ON TABLE "public"."public_email_domains" TO "service_role";



GRANT ALL ON TABLE "public"."query_accuracy_logs" TO "anon";
GRANT ALL ON TABLE "public"."query_accuracy_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."query_accuracy_logs" TO "service_role";



GRANT ALL ON TABLE "public"."query_plan_cache" TO "anon";
GRANT ALL ON TABLE "public"."query_plan_cache" TO "authenticated";
GRANT ALL ON TABLE "public"."query_plan_cache" TO "service_role";



GRANT ALL ON TABLE "public"."revenue_analytics_mv" TO "anon";
GRANT ALL ON TABLE "public"."revenue_analytics_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."revenue_analytics_mv" TO "service_role";



GRANT ALL ON TABLE "public"."role_templates" TO "anon";
GRANT ALL ON TABLE "public"."role_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."role_templates" TO "service_role";



GRANT ALL ON TABLE "public"."sales_activity_analytics_mv" TO "anon";
GRANT ALL ON TABLE "public"."sales_activity_analytics_mv" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_activity_analytics_mv" TO "service_role";



GRANT ALL ON TABLE "public"."sales_learning_events" TO "anon";
GRANT ALL ON TABLE "public"."sales_learning_events" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_learning_events" TO "service_role";



GRANT ALL ON TABLE "public"."sales_learning_profiles" TO "anon";
GRANT ALL ON TABLE "public"."sales_learning_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_learning_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."sales_quotas" TO "anon";
GRANT ALL ON TABLE "public"."sales_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."saved_artifacts" TO "anon";
GRANT ALL ON TABLE "public"."saved_artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."saved_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."search_config" TO "anon";
GRANT ALL ON TABLE "public"."search_config" TO "authenticated";
GRANT ALL ON TABLE "public"."search_config" TO "service_role";



GRANT ALL ON TABLE "public"."sequence_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."sequence_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."sequence_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."sequences" TO "anon";
GRANT ALL ON TABLE "public"."sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."sequences" TO "service_role";



GRANT ALL ON TABLE "public"."signup_decisions" TO "anon";
GRANT ALL ON TABLE "public"."signup_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."signup_decisions" TO "service_role";



GRANT ALL ON TABLE "public"."slide_generation_preferences" TO "anon";
GRANT ALL ON TABLE "public"."slide_generation_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."slide_generation_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."slide_templates" TO "anon";
GRANT ALL ON TABLE "public"."slide_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."slide_templates" TO "service_role";



GRANT ALL ON TABLE "public"."source_documents" TO "anon";
GRANT ALL ON TABLE "public"."source_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."source_documents" TO "service_role";



GRANT ALL ON TABLE "public"."suggested_actions" TO "anon";
GRANT ALL ON TABLE "public"."suggested_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."suggested_actions" TO "service_role";



GRANT ALL ON TABLE "public"."system_prompt_config" TO "anon";
GRANT ALL ON TABLE "public"."system_prompt_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_prompt_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tasks_task_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."template_slot_mappings" TO "anon";
GRANT ALL ON TABLE "public"."template_slot_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."template_slot_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."uploaded_files" TO "anon";
GRANT ALL ON TABLE "public"."uploaded_files" TO "authenticated";
GRANT ALL ON TABLE "public"."uploaded_files" TO "service_role";



GRANT ALL ON TABLE "public"."user_activity_logs" TO "anon";
GRANT ALL ON TABLE "public"."user_activity_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."user_activity_logs" TO "service_role";



GRANT ALL ON TABLE "public"."user_ai_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_ai_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_ai_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_channel_registrations" TO "anon";
GRANT ALL ON TABLE "public"."user_channel_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."user_channel_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."user_compensation_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_compensation_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_compensation_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."user_notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_prompt_preferences" TO "anon";
GRANT ALL ON TABLE "public"."user_prompt_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."user_prompt_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."user_quotas" TO "anon";
GRANT ALL ON TABLE "public"."user_quotas" TO "authenticated";
GRANT ALL ON TABLE "public"."user_quotas" TO "service_role";



GRANT ALL ON TABLE "public"."user_role_assignments" TO "anon";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."user_role_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."visitor_identity_map" TO "anon";
GRANT ALL ON TABLE "public"."visitor_identity_map" TO "authenticated";
GRANT ALL ON TABLE "public"."visitor_identity_map" TO "service_role";






GRANT ALL ON TABLE "public"."web_events" TO "anon";
GRANT ALL ON TABLE "public"."web_events" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_01" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_01" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_01" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_02" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_02" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_02" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_03" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_03" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_03" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_04" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_04" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_04" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_05" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_05" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_05" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_06" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_06" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_06" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_2026_07" TO "anon";
GRANT ALL ON TABLE "public"."web_events_2026_07" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_2026_07" TO "service_role";



GRANT ALL ON TABLE "public"."web_events_monthly_summary" TO "anon";
GRANT ALL ON TABLE "public"."web_events_monthly_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."web_events_monthly_summary" TO "service_role";









GRANT ALL ON TABLE "public"."workflow_rules" TO "anon";
GRANT ALL ON TABLE "public"."workflow_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_rules" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


























