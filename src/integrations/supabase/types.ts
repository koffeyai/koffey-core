export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      account_ltv_history: {
        Row: {
          account_id: string
          arr: number | null
          calculation_method: string | null
          churn_risk_score: number | null
          factors_used: Json | null
          health_score: number | null
          id: string
          ltv_calculated: number | null
          ltv_predicted: number | null
          mrr: number | null
          organization_id: string
          recorded_at: string | null
          total_revenue: number | null
        }
        Insert: {
          account_id: string
          arr?: number | null
          calculation_method?: string | null
          churn_risk_score?: number | null
          factors_used?: Json | null
          health_score?: number | null
          id?: string
          ltv_calculated?: number | null
          ltv_predicted?: number | null
          mrr?: number | null
          organization_id: string
          recorded_at?: string | null
          total_revenue?: number | null
        }
        Update: {
          account_id?: string
          arr?: number | null
          calculation_method?: string | null
          churn_risk_score?: number | null
          factors_used?: Json | null
          health_score?: number | null
          id?: string
          ltv_calculated?: number | null
          ltv_predicted?: number | null
          mrr?: number | null
          organization_id?: string
          recorded_at?: string | null
          total_revenue?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "account_ltv_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "account_ltv_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_ltv_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_number: number
          account_type: string | null
          address: string | null
          arr: number | null
          assigned_to: string | null
          churn_risk_score: number | null
          confidence_scores: Json | null
          created_at: string
          customer_since: string | null
          data_sources: Json | null
          description: string | null
          domain: string | null
          enriched_at: string | null
          expansion_potential: number | null
          health_score: number | null
          id: string
          industry: string | null
          is_personal: boolean | null
          ltv_calculated: number | null
          ltv_confidence: number | null
          ltv_last_calculated_at: string | null
          ltv_predicted: number | null
          ltv_segment: string | null
          mrr: number | null
          name: string
          organization_id: string | null
          phone: string | null
          scraped_data: Json | null
          total_revenue: number | null
          updated_at: string
          user_id: string
          version: number | null
          website: string | null
        }
        Insert: {
          account_number?: number
          account_type?: string | null
          address?: string | null
          arr?: number | null
          assigned_to?: string | null
          churn_risk_score?: number | null
          confidence_scores?: Json | null
          created_at?: string
          customer_since?: string | null
          data_sources?: Json | null
          description?: string | null
          domain?: string | null
          enriched_at?: string | null
          expansion_potential?: number | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_personal?: boolean | null
          ltv_calculated?: number | null
          ltv_confidence?: number | null
          ltv_last_calculated_at?: string | null
          ltv_predicted?: number | null
          ltv_segment?: string | null
          mrr?: number | null
          name: string
          organization_id?: string | null
          phone?: string | null
          scraped_data?: Json | null
          total_revenue?: number | null
          updated_at?: string
          user_id: string
          version?: number | null
          website?: string | null
        }
        Update: {
          account_number?: number
          account_type?: string | null
          address?: string | null
          arr?: number | null
          assigned_to?: string | null
          churn_risk_score?: number | null
          confidence_scores?: Json | null
          created_at?: string
          customer_since?: string | null
          data_sources?: Json | null
          description?: string | null
          domain?: string | null
          enriched_at?: string | null
          expansion_potential?: number | null
          health_score?: number | null
          id?: string
          industry?: string | null
          is_personal?: boolean | null
          ltv_calculated?: number | null
          ltv_confidence?: number | null
          ltv_last_calculated_at?: string | null
          ltv_predicted?: number | null
          ltv_segment?: string | null
          mrr?: number | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          scraped_data?: Json | null
          total_revenue?: number | null
          updated_at?: string
          user_id?: string
          version?: number | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          activity_date: string | null
          activity_number: number
          assigned_to: string | null
          completed: boolean | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          id: string
          organization_id: string | null
          scheduled_at: string | null
          subject: string | null
          title: string
          type: string
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          account_id?: string | null
          activity_date?: string | null
          activity_number?: number
          assigned_to?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          scheduled_at?: string | null
          subject?: string | null
          title: string
          type?: string
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          account_id?: string | null
          activity_date?: string | null
          activity_number?: number
          assigned_to?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          scheduled_at?: string | null
          subject?: string | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_email_whitelist: {
        Row: {
          added_at: string | null
          added_by: string | null
          email: string
          grant_platform_admin: boolean | null
          id: string
          notes: string | null
        }
        Insert: {
          added_at?: string | null
          added_by?: string | null
          email: string
          grant_platform_admin?: boolean | null
          id?: string
          notes?: string | null
        }
        Update: {
          added_at?: string | null
          added_by?: string | null
          email?: string
          grant_platform_admin?: boolean | null
          id?: string
          notes?: string | null
        }
        Relationships: []
      }
      admin_job_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_stage: string | null
          error_details: Json | null
          estimated_completion: string | null
          id: string
          job_type: string
          max_retries: number | null
          organization_id: string
          priority: number | null
          progress_percentage: number | null
          queue_position: number | null
          resource_usage: Json | null
          results: Json | null
          retry_count: number | null
          started_at: string | null
          status: string
          timeout_at: string | null
          triggered_by_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          error_details?: Json | null
          estimated_completion?: string | null
          id?: string
          job_type: string
          max_retries?: number | null
          organization_id: string
          priority?: number | null
          progress_percentage?: number | null
          queue_position?: number | null
          resource_usage?: Json | null
          results?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          timeout_at?: string | null
          triggered_by_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_stage?: string | null
          error_details?: Json | null
          estimated_completion?: string | null
          id?: string
          job_type?: string
          max_retries?: number | null
          organization_id?: string
          priority?: number | null
          progress_percentage?: number | null
          queue_position?: number | null
          resource_usage?: Json | null
          results?: Json | null
          retry_count?: number | null
          started_at?: string | null
          status?: string
          timeout_at?: string | null
          triggered_by_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_job_executions_triggered_by_user_id_fkey"
            columns: ["triggered_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_job_progress: {
        Row: {
          id: string
          job_id: string
          message: string | null
          metadata: Json | null
          progress_percentage: number | null
          stage: string
          timestamp: string | null
        }
        Insert: {
          id?: string
          job_id: string
          message?: string | null
          metadata?: Json | null
          progress_percentage?: number | null
          stage: string
          timestamp?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          message?: string | null
          metadata?: Json | null
          progress_percentage?: number | null
          stage?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_job_progress_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_job_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          action_data: Json | null
          action_label: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_persistent: boolean | null
          is_read: boolean | null
          job_id: string | null
          message: string
          organization_id: string
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          action_data?: Json | null
          action_label?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_persistent?: boolean | null
          is_read?: boolean | null
          job_id?: string | null
          message: string
          organization_id: string
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          action_data?: Json | null
          action_label?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_persistent?: boolean | null
          is_read?: boolean | null
          job_id?: string | null
          message?: string
          organization_id?: string
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "admin_job_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_rules: {
        Row: {
          approver_role: string | null
          condition_type: string
          created_at: string
          entity_type: string
          field_name: string | null
          id: string
          is_active: boolean | null
          notification_template: string | null
          organization_id: string | null
          requires_approval: boolean | null
          rule_name: string
          threshold_text: string | null
          threshold_value: number | null
        }
        Insert: {
          approver_role?: string | null
          condition_type: string
          created_at?: string
          entity_type: string
          field_name?: string | null
          id?: string
          is_active?: boolean | null
          notification_template?: string | null
          organization_id?: string | null
          requires_approval?: boolean | null
          rule_name: string
          threshold_text?: string | null
          threshold_value?: number | null
        }
        Update: {
          approver_role?: string | null
          condition_type?: string
          created_at?: string
          entity_type?: string
          field_name?: string | null
          id?: string
          is_active?: boolean | null
          notification_template?: string | null
          organization_id?: string | null
          requires_approval?: boolean | null
          rule_name?: string
          threshold_text?: string | null
          threshold_value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          approval_required: boolean | null
          approval_status: string | null
          approved_by: string | null
          changes: Json | null
          chat_message_id: string | null
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          operation: string
          organization_id: string | null
          reason: string | null
          record_id: string
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          approval_required?: boolean | null
          approval_status?: string | null
          approved_by?: string | null
          changes?: Json | null
          chat_message_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation: string
          organization_id?: string | null
          reason?: string | null
          record_id: string
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          approval_required?: boolean | null
          approval_status?: string | null
          approved_by?: string | null
          changes?: Json | null
          chat_message_id?: string | null
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          operation?: string
          organization_id?: string | null
          reason?: string | null
          record_id?: string
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_event_sync: {
        Row: {
          activity_id: string | null
          conflict_data: Json | null
          created_at: string | null
          google_calendar_id: string
          google_etag: string | null
          google_event_id: string
          google_updated_at: string | null
          id: string
          last_synced_at: string | null
          sync_direction: string | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activity_id?: string | null
          conflict_data?: Json | null
          created_at?: string | null
          google_calendar_id?: string
          google_etag?: string | null
          google_event_id: string
          google_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activity_id?: string | null
          conflict_data?: Json | null
          created_at?: string | null
          google_calendar_id?: string
          google_etag?: string | null
          google_event_id?: string
          google_updated_at?: string | null
          id?: string
          last_synced_at?: string | null
          sync_direction?: string | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_event_sync_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tokens: {
        Row: {
          access_token: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          provider: string | null
          refresh_token: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          provider?: string | null
          refresh_token: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          provider?: string | null
          refresh_token?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_watch_channels: {
        Row: {
          calendar_id: string
          channel_id: string
          created_at: string | null
          error_message: string | null
          expiration: string
          id: string
          last_notification_at: string | null
          notification_count: number | null
          resource_id: string | null
          status: string | null
          sync_token: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calendar_id?: string
          channel_id: string
          created_at?: string | null
          error_message?: string | null
          expiration: string
          id?: string
          last_notification_at?: string | null
          notification_count?: number | null
          resource_id?: string | null
          status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calendar_id?: string
          channel_id?: string
          created_at?: string | null
          error_message?: string | null
          expiration?: string
          id?: string
          last_notification_at?: string | null
          notification_count?: number | null
          resource_id?: string | null
          status?: string | null
          sync_token?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_contacts: {
        Row: {
          attribution_type: string
          campaign_id: string
          contact_id: string
          created_at: string | null
          id: string
          organization_id: string
          responded_at: string | null
        }
        Insert: {
          attribution_type?: string
          campaign_id: string
          contact_id: string
          created_at?: string | null
          id?: string
          organization_id: string
          responded_at?: string | null
        }
        Update: {
          attribution_type?: string
          campaign_id?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          responded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "campaign_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deals: {
        Row: {
          attributed_amount: number | null
          attribution_type: string
          campaign_id: string
          created_at: string | null
          deal_id: string
          id: string
          organization_id: string
        }
        Insert: {
          attributed_amount?: number | null
          attribution_type?: string
          campaign_id: string
          created_at?: string | null
          deal_id: string
          id?: string
          organization_id: string
        }
        Update: {
          attributed_amount?: number | null
          attribution_type?: string
          campaign_id?: string
          created_at?: string | null
          deal_id?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          actual_spend: number | null
          budget: number | null
          channel: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          organization_id: string
          start_date: string | null
          status: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          actual_spend?: number | null
          budget?: number | null
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organization_id: string
          start_date?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          actual_spend?: number | null
          budget?: number | null
          channel?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organization_id?: string
          start_date?: string | null
          status?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_context_memory: {
        Row: {
          context_data: Json
          context_type: string
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string | null
          relevance_score: number | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          context_data: Json
          context_type: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          relevance_score?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          context_data?: Json
          context_type?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          relevance_score?: number | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_context_memory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_intent_patterns: {
        Row: {
          confidence_threshold: number | null
          created_at: string
          entity_type: string | null
          id: string
          intent_type: string
          is_active: boolean | null
          keywords: string[] | null
          organization_id: string | null
          pattern_name: string
          pattern_regex: string | null
          success_rate: number | null
          updated_at: string
          usage_count: number | null
        }
        Insert: {
          confidence_threshold?: number | null
          created_at?: string
          entity_type?: string | null
          id?: string
          intent_type: string
          is_active?: boolean | null
          keywords?: string[] | null
          organization_id?: string | null
          pattern_name: string
          pattern_regex?: string | null
          success_rate?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Update: {
          confidence_threshold?: number | null
          created_at?: string
          entity_type?: string | null
          id?: string
          intent_type?: string
          is_active?: boolean | null
          keywords?: string[] | null
          organization_id?: string | null
          pattern_name?: string
          pattern_regex?: string | null
          success_rate?: number | null
          updated_at?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_intent_patterns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          action_items: string[] | null
          confidence_score: number | null
          content: string
          context_snapshot: Json | null
          created_at: string | null
          data_queries: Json | null
          extracted_entities: Json | null
          id: string
          intent_type: string | null
          message_type: string | null
          metadata: Json | null
          processing_status: string | null
          query_results: Json | null
          resolved_references: Json | null
          session_id: string
          user_id: string
        }
        Insert: {
          action_items?: string[] | null
          confidence_score?: number | null
          content: string
          context_snapshot?: Json | null
          created_at?: string | null
          data_queries?: Json | null
          extracted_entities?: Json | null
          id?: string
          intent_type?: string | null
          message_type?: string | null
          metadata?: Json | null
          processing_status?: string | null
          query_results?: Json | null
          resolved_references?: Json | null
          session_id: string
          user_id: string
        }
        Update: {
          action_items?: string[] | null
          confidence_score?: number | null
          content?: string
          context_snapshot?: Json | null
          created_at?: string | null
          data_queries?: Json | null
          extracted_entities?: Json | null
          id?: string
          intent_type?: string | null
          message_type?: string | null
          metadata?: Json | null
          processing_status?: string | null
          query_results?: Json | null
          resolved_references?: Json | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pending_actions: {
        Row: {
          action_type: string
          created_at: string | null
          expires_at: string | null
          id: string
          organization_id: string | null
          payload: Json
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string | null
          payload?: Json
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_pending_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pending_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          active_context: Json | null
          awaiting_context: Json | null
          context_stack: Json[] | null
          conversation_state: Database["public"]["Enums"]["conversation_state_enum"]
          created_at: string | null
          entity_context: Json | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          pending_deal_creation: Json | null
          pending_deal_creation_at: string | null
          pending_deal_update: Json | null
          pending_deal_update_at: string | null
          pending_draft_email: Json | null
          pending_draft_email_at: string | null
          pending_extraction: Json | null
          pending_extraction_at: string | null
          pending_schedule_meeting: Json | null
          pending_schedule_meeting_at: string | null
          pending_sequence_action: Json | null
          pending_sequence_action_at: string | null
          search_attempt_count: number | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          active_context?: Json | null
          awaiting_context?: Json | null
          context_stack?: Json[] | null
          conversation_state?: Database["public"]["Enums"]["conversation_state_enum"]
          created_at?: string | null
          entity_context?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          pending_deal_creation?: Json | null
          pending_deal_creation_at?: string | null
          pending_deal_update?: Json | null
          pending_deal_update_at?: string | null
          pending_draft_email?: Json | null
          pending_draft_email_at?: string | null
          pending_extraction?: Json | null
          pending_extraction_at?: string | null
          pending_schedule_meeting?: Json | null
          pending_schedule_meeting_at?: string | null
          pending_sequence_action?: Json | null
          pending_sequence_action_at?: string | null
          search_attempt_count?: number | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          active_context?: Json | null
          awaiting_context?: Json | null
          context_stack?: Json[] | null
          conversation_state?: Database["public"]["Enums"]["conversation_state_enum"]
          created_at?: string | null
          entity_context?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          pending_deal_creation?: Json | null
          pending_deal_creation_at?: string | null
          pending_deal_update?: Json | null
          pending_deal_update_at?: string | null
          pending_draft_email?: Json | null
          pending_draft_email_at?: string | null
          pending_extraction?: Json | null
          pending_extraction_at?: string | null
          pending_schedule_meeting?: Json | null
          pending_schedule_meeting_at?: string | null
          pending_sequence_action?: Json | null
          pending_sequence_action_at?: string | null
          search_attempt_count?: number | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_memory: {
        Row: {
          contact_id: string
          created_at: string
          fact_count: number
          id: string
          last_analyzed_at: string | null
          last_compacted_at: string | null
          last_encoded_at: string
          memory: Json
          organization_id: string
          updated_at: string
          version: number
        }
        Insert: {
          contact_id: string
          created_at?: string
          fact_count?: number
          id?: string
          last_analyzed_at?: string | null
          last_compacted_at?: string | null
          last_encoded_at?: string
          memory?: Json
          organization_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          contact_id?: string
          created_at?: string
          fact_count?: number
          id?: string
          last_analyzed_at?: string | null
          last_compacted_at?: string | null
          last_encoded_at?: string
          memory?: Json
          organization_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_memory_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memory_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "client_memory_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_records: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calculated_at: string
          commission_earned: number
          commission_rate: number
          created_at: string
          deal_amount: number
          deal_id: string
          id: string
          notes: string | null
          organization_id: string
          paid_at: string | null
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string
          commission_earned?: number
          commission_rate?: number
          created_at?: string
          deal_amount?: number
          deal_id: string
          id?: string
          notes?: string | null
          organization_id: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string
          commission_earned?: number
          commission_rate?: number
          created_at?: string
          deal_amount?: number
          deal_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          paid_at?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_records_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profiles: {
        Row: {
          boilerplate_about: string | null
          company_name: string
          created_at: string
          created_by: string | null
          differentiators: string[] | null
          elevator_pitch: string | null
          id: string
          industry: string | null
          organization_id: string
          products_services: Json | null
          proof_points: Json | null
          tagline: string | null
          target_personas: Json | null
          updated_at: string
          updated_by: string | null
          value_proposition: string | null
          website_url: string | null
        }
        Insert: {
          boilerplate_about?: string | null
          company_name: string
          created_at?: string
          created_by?: string | null
          differentiators?: string[] | null
          elevator_pitch?: string | null
          id?: string
          industry?: string | null
          organization_id: string
          products_services?: Json | null
          proof_points?: Json | null
          tagline?: string | null
          target_personas?: Json | null
          updated_at?: string
          updated_by?: string | null
          value_proposition?: string | null
          website_url?: string | null
        }
        Update: {
          boilerplate_about?: string | null
          company_name?: string
          created_at?: string
          created_by?: string | null
          differentiators?: string[] | null
          elevator_pitch?: string | null
          id?: string
          industry?: string | null
          organization_id?: string
          products_services?: Json | null
          proof_points?: Json | null
          tagline?: string | null
          target_personas?: Json | null
          updated_at?: string
          updated_by?: string | null
          value_proposition?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_plans: {
        Row: {
          base_commission_rate: number
          bonus_criteria: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          tiers: Json
          updated_at: string
        }
        Insert: {
          base_commission_rate?: number
          bonus_criteria?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          tiers?: Json
          updated_at?: string
        }
        Update: {
          base_commission_rate?: number
          bonus_criteria?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          tiers?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          address: string | null
          assigned_to: string | null
          authority_level: string | null
          bant_score: number | null
          budget_amount: number | null
          budget_notes: string | null
          budget_status: string | null
          campaign_source: string | null
          capture_context: string | null
          capture_method: string | null
          communication_preference: string | null
          company: string | null
          contact_number: number
          contact_role: string | null
          created_at: string
          customer_since: string | null
          data_sources: Json | null
          decision_authority: string | null
          disqualification_reason: string | null
          disqualified_at: string | null
          disqualified_by: string | null
          email: string | null
          engagement_score: number | null
          enriched_at: string | null
          enrichment_confidence: number | null
          enrichment_provider: string | null
          first_activity_at: string | null
          first_name: string | null
          first_touch_campaign: string | null
          first_touch_date: string | null
          first_touch_medium: string | null
          first_touch_source: string | null
          fit_score: number | null
          fit_signals: Json | null
          full_name: string | null
          id: string
          intent_score: number | null
          last_name: string | null
          lead_score: number | null
          lead_source: string | null
          linkedin_url: string | null
          need_description: string | null
          need_urgency: string | null
          notes: string | null
          nurture_stage: string | null
          organization_id: string | null
          overall_lead_score: number | null
          phone: string | null
          position: string | null
          previous_status: string | null
          qualification_notes: string | null
          qualification_stage: string | null
          relationship_strength: string | null
          status: string | null
          status_changed_at: string | null
          timeline_status: string | null
          timeline_target_date: string | null
          title: string | null
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          account_id?: string | null
          address?: string | null
          assigned_to?: string | null
          authority_level?: string | null
          bant_score?: number | null
          budget_amount?: number | null
          budget_notes?: string | null
          budget_status?: string | null
          campaign_source?: string | null
          capture_context?: string | null
          capture_method?: string | null
          communication_preference?: string | null
          company?: string | null
          contact_number?: number
          contact_role?: string | null
          created_at?: string
          customer_since?: string | null
          data_sources?: Json | null
          decision_authority?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          disqualified_by?: string | null
          email?: string | null
          engagement_score?: number | null
          enriched_at?: string | null
          enrichment_confidence?: number | null
          enrichment_provider?: string | null
          first_activity_at?: string | null
          first_name?: string | null
          first_touch_campaign?: string | null
          first_touch_date?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          fit_score?: number | null
          fit_signals?: Json | null
          full_name?: string | null
          id?: string
          intent_score?: number | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          linkedin_url?: string | null
          need_description?: string | null
          need_urgency?: string | null
          notes?: string | null
          nurture_stage?: string | null
          organization_id?: string | null
          overall_lead_score?: number | null
          phone?: string | null
          position?: string | null
          previous_status?: string | null
          qualification_notes?: string | null
          qualification_stage?: string | null
          relationship_strength?: string | null
          status?: string | null
          status_changed_at?: string | null
          timeline_status?: string | null
          timeline_target_date?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          account_id?: string | null
          address?: string | null
          assigned_to?: string | null
          authority_level?: string | null
          bant_score?: number | null
          budget_amount?: number | null
          budget_notes?: string | null
          budget_status?: string | null
          campaign_source?: string | null
          capture_context?: string | null
          capture_method?: string | null
          communication_preference?: string | null
          company?: string | null
          contact_number?: number
          contact_role?: string | null
          created_at?: string
          customer_since?: string | null
          data_sources?: Json | null
          decision_authority?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          disqualified_by?: string | null
          email?: string | null
          engagement_score?: number | null
          enriched_at?: string | null
          enrichment_confidence?: number | null
          enrichment_provider?: string | null
          first_activity_at?: string | null
          first_name?: string | null
          first_touch_campaign?: string | null
          first_touch_date?: string | null
          first_touch_medium?: string | null
          first_touch_source?: string | null
          fit_score?: number | null
          fit_signals?: Json | null
          full_name?: string | null
          id?: string
          intent_score?: number | null
          last_name?: string | null
          lead_score?: number | null
          lead_source?: string | null
          linkedin_url?: string | null
          need_description?: string | null
          need_urgency?: string | null
          notes?: string | null
          nurture_stage?: string | null
          organization_id?: string | null
          overall_lead_score?: number | null
          phone?: string | null
          position?: string | null
          previous_status?: string | null
          qualification_notes?: string | null
          qualification_stage?: string | null
          relationship_strength?: string | null
          status?: string | null
          status_changed_at?: string | null
          timeline_status?: string | null
          timeline_target_date?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_disqualified_by_fkey"
            columns: ["disqualified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_contacts_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_contacts_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_roles: {
        Row: {
          base_role: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          permissions: Json
          product_scope: Json | null
          territory_scope: Json | null
          updated_at: string | null
          vertical_scope: Json | null
        }
        Insert: {
          base_role?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          permissions?: Json
          product_scope?: Json | null
          territory_scope?: Json | null
          updated_at?: string | null
          vertical_scope?: Json | null
        }
        Update: {
          base_role?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          permissions?: Json
          product_scope?: Json | null
          territory_scope?: Json | null
          updated_at?: string | null
          vertical_scope?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_briefings: {
        Row: {
          available_plays: Json | null
          briefing_date: string
          created_at: string | null
          deals_moved_forward: number | null
          generated_at: string | null
          generation_time_ms: number | null
          id: string
          in_motion: Json | null
          llm_model: string | null
          momentum: Json | null
          organization_id: string
          pipeline_change_amount: number | null
          plays_actioned: Json | null
          plays_available_count: number | null
          priority_play: Json | null
          priority_play_actioned: boolean | null
          quota_percentage: number | null
          todays_meetings: Json | null
          token_count: number | null
          updated_at: string | null
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          available_plays?: Json | null
          briefing_date?: string
          created_at?: string | null
          deals_moved_forward?: number | null
          generated_at?: string | null
          generation_time_ms?: number | null
          id?: string
          in_motion?: Json | null
          llm_model?: string | null
          momentum?: Json | null
          organization_id: string
          pipeline_change_amount?: number | null
          plays_actioned?: Json | null
          plays_available_count?: number | null
          priority_play?: Json | null
          priority_play_actioned?: boolean | null
          quota_percentage?: number | null
          todays_meetings?: Json | null
          token_count?: number | null
          updated_at?: string | null
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          available_plays?: Json | null
          briefing_date?: string
          created_at?: string | null
          deals_moved_forward?: number | null
          generated_at?: string | null
          generation_time_ms?: number | null
          id?: string
          in_motion?: Json | null
          llm_model?: string | null
          momentum?: Json | null
          organization_id?: string
          pipeline_change_amount?: number | null
          plays_actioned?: Json | null
          plays_available_count?: number | null
          priority_play?: Json | null
          priority_play_actioned?: boolean | null
          quota_percentage?: number | null
          todays_meetings?: Json | null
          token_count?: number | null
          updated_at?: string | null
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_briefings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      data_quality_metrics: {
        Row: {
          analyzed_at: string | null
          created_at: string
          grade: string | null
          id: string
          metrics_data: Json | null
          organization_id: string
          overall_score: number | null
        }
        Insert: {
          analyzed_at?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          metrics_data?: Json | null
          organization_id: string
          overall_score?: number | null
        }
        Update: {
          analyzed_at?: string | null
          created_at?: string
          grade?: string | null
          id?: string
          metrics_data?: Json | null
          organization_id?: string
          overall_score?: number | null
        }
        Relationships: []
      }
      deal_attachments: {
        Row: {
          created_at: string | null
          deal_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          organization_id: string | null
          source_document_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          deal_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id?: string | null
          source_document_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          deal_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          organization_id?: string | null
          source_document_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_attachments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_attachments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_attachments_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contact_history: {
        Row: {
          change_reason: string | null
          change_type: string
          changed_by: string | null
          contact_id: string
          created_at: string | null
          deal_contact_id: string | null
          deal_id: string
          id: string
          influence_axis: number | null
          organization_id: string | null
          quadrant: string | null
          support_axis: number | null
        }
        Insert: {
          change_reason?: string | null
          change_type: string
          changed_by?: string | null
          contact_id: string
          created_at?: string | null
          deal_contact_id?: string | null
          deal_id: string
          id?: string
          influence_axis?: number | null
          organization_id?: string | null
          quadrant?: string | null
          support_axis?: number | null
        }
        Update: {
          change_reason?: string | null
          change_type?: string
          changed_by?: string | null
          contact_id?: string
          created_at?: string | null
          deal_contact_id?: string | null
          deal_id?: string
          id?: string
          influence_axis?: number | null
          organization_id?: string | null
          quadrant?: string | null
          support_axis?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contact_history_deal_contact_id_fkey"
            columns: ["deal_contact_id"]
            isOneToOne: false
            referencedRelation: "deal_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contact_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contacts: {
        Row: {
          contact_id: string
          created_at: string | null
          created_by: string | null
          deal_id: string
          id: string
          influence_axis: number | null
          notes: string | null
          organization_id: string | null
          quadrant: string | null
          role_in_deal: string | null
          support_axis: number | null
          updated_at: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          id?: string
          influence_axis?: number | null
          notes?: string | null
          organization_id?: string | null
          quadrant?: string | null
          role_in_deal?: string | null
          support_axis?: number | null
          updated_at?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          id?: string
          influence_axis?: number | null
          notes?: string | null
          organization_id?: string | null
          quadrant?: string | null
          role_in_deal?: string | null
          support_axis?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_feature_gaps: {
        Row: {
          attributed_amount: number | null
          created_at: string | null
          created_by: string | null
          deal_id: string
          feature_id: string | null
          feature_name: string
          id: string
          impact_level: string | null
          organization_id: string
          prospect_feedback: string | null
          was_dealbreaker: boolean | null
          workaround_offered: string | null
          workaround_rejected_reason: string | null
        }
        Insert: {
          attributed_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id: string
          feature_id?: string | null
          feature_name: string
          id?: string
          impact_level?: string | null
          organization_id: string
          prospect_feedback?: string | null
          was_dealbreaker?: boolean | null
          workaround_offered?: string | null
          workaround_rejected_reason?: string | null
        }
        Update: {
          attributed_amount?: number | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string
          feature_id?: string | null
          feature_name?: string
          id?: string
          impact_level?: string | null
          organization_id?: string
          prospect_feedback?: string | null
          was_dealbreaker?: boolean | null
          workaround_offered?: string | null
          workaround_rejected_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_feature_gaps_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_feature_gaps_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_feature_gaps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_notes: {
        Row: {
          content: string
          created_at: string | null
          deal_id: string
          id: string
          note_type: string | null
          organization_id: string | null
          source_document_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          deal_id: string
          id?: string
          note_type?: string | null
          organization_id?: string | null
          source_document_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          deal_id?: string
          id?: string
          note_type?: string | null
          organization_id?: string | null
          source_document_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_notes_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_terms: {
        Row: {
          auto_renew: boolean
          contract_duration_months: number | null
          contract_end_date: string | null
          contract_start_date: string | null
          contract_type: string
          created_at: string
          deal_id: string
          id: string
          last_qbr_date: string | null
          next_qbr_date: string | null
          organization_id: string
          qbr_frequency_months: number
          renewal_notes: string | null
          renewal_notice_days: number
          renewal_owner_id: string | null
          renewal_status: string
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          contract_duration_months?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string
          created_at?: string
          deal_id: string
          id?: string
          last_qbr_date?: string | null
          next_qbr_date?: string | null
          organization_id: string
          qbr_frequency_months?: number
          renewal_notes?: string | null
          renewal_notice_days?: number
          renewal_owner_id?: string | null
          renewal_status?: string
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          contract_duration_months?: number | null
          contract_end_date?: string | null
          contract_start_date?: string | null
          contract_type?: string
          created_at?: string
          deal_id?: string
          id?: string
          last_qbr_date?: string | null
          next_qbr_date?: string | null
          organization_id?: string
          qbr_frequency_months?: number
          renewal_notes?: string | null
          renewal_notice_days?: number
          renewal_owner_id?: string | null
          renewal_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_terms_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_terms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          account_id: string | null
          actual_closed_at: string | null
          amount: number | null
          assigned_to: string | null
          close_date: string | null
          close_notes: string | null
          close_reason: string | null
          competitor_name: string | null
          contact_id: string | null
          created_at: string
          currency: string | null
          data_sources: Json | null
          deal_number: number
          description: string | null
          enriched_at: string | null
          expected_close_date: string | null
          first_touch_campaign_id: string | null
          forecast_category: string | null
          id: string
          key_use_case: string | null
          last_touch_campaign_id: string | null
          lead_source: string | null
          name: string
          organization_id: string | null
          probability: number | null
          probability_source: string | null
          products_positioned: string[] | null
          reopened_count: number | null
          stage: string
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          account_id?: string | null
          actual_closed_at?: string | null
          amount?: number | null
          assigned_to?: string | null
          close_date?: string | null
          close_notes?: string | null
          close_reason?: string | null
          competitor_name?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          data_sources?: Json | null
          deal_number?: number
          description?: string | null
          enriched_at?: string | null
          expected_close_date?: string | null
          first_touch_campaign_id?: string | null
          forecast_category?: string | null
          id?: string
          key_use_case?: string | null
          last_touch_campaign_id?: string | null
          lead_source?: string | null
          name?: string
          organization_id?: string | null
          probability?: number | null
          probability_source?: string | null
          products_positioned?: string[] | null
          reopened_count?: number | null
          stage?: string
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          account_id?: string | null
          actual_closed_at?: string | null
          amount?: number | null
          assigned_to?: string | null
          close_date?: string | null
          close_notes?: string | null
          close_reason?: string | null
          competitor_name?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          data_sources?: Json | null
          deal_number?: number
          description?: string | null
          enriched_at?: string | null
          expected_close_date?: string | null
          first_touch_campaign_id?: string | null
          forecast_category?: string | null
          id?: string
          key_use_case?: string | null
          last_touch_campaign_id?: string | null
          lead_source?: string | null
          name?: string
          organization_id?: string | null
          probability?: number | null
          probability_source?: string | null
          products_positioned?: string[] | null
          reopened_count?: number | null
          stage?: string
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_first_touch_campaign_id_fkey"
            columns: ["first_touch_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_last_touch_campaign_id_fkey"
            columns: ["last_touch_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deals_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_deals_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deals_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deals_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
        ]
      }
      enrichment_logs: {
        Row: {
          contact_id: string | null
          created_at: string | null
          error_message: string | null
          fit_score_delta: number | null
          id: string
          lookup_value: string
          organization_id: string
          provider_key: string
          raw_response: Json | null
          request_type: string
          response_data: Json | null
          response_time_ms: number | null
          success: boolean
        }
        Insert: {
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          fit_score_delta?: number | null
          id?: string
          lookup_value: string
          organization_id: string
          provider_key: string
          raw_response?: Json | null
          request_type: string
          response_data?: Json | null
          response_time_ms?: number | null
          success: boolean
        }
        Update: {
          contact_id?: string | null
          created_at?: string | null
          error_message?: string | null
          fit_score_delta?: number | null
          id?: string
          lookup_value?: string
          organization_id?: string
          provider_key?: string
          raw_response?: Json | null
          request_type?: string
          response_data?: Json | null
          response_time_ms?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "enrichment_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_provider_configs: {
        Row: {
          config_overrides: Json | null
          created_at: string | null
          credentials: Json
          id: string
          is_active: boolean | null
          monthly_quota: number | null
          organization_id: string
          priority: number | null
          provider_definition_id: string
          quota_reset_at: string | null
          requests_this_month: number | null
          updated_at: string | null
        }
        Insert: {
          config_overrides?: Json | null
          created_at?: string | null
          credentials?: Json
          id?: string
          is_active?: boolean | null
          monthly_quota?: number | null
          organization_id: string
          priority?: number | null
          provider_definition_id: string
          quota_reset_at?: string | null
          requests_this_month?: number | null
          updated_at?: string | null
        }
        Update: {
          config_overrides?: Json | null
          created_at?: string | null
          credentials?: Json
          id?: string
          is_active?: boolean | null
          monthly_quota?: number | null
          organization_id?: string
          priority?: number | null
          provider_definition_id?: string
          quota_reset_at?: string | null
          requests_this_month?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_provider_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_provider_configs_provider_definition_id_fkey"
            columns: ["provider_definition_id"]
            isOneToOne: false
            referencedRelation: "enrichment_provider_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_provider_definitions: {
        Row: {
          api_config: Json
          created_at: string | null
          created_by_org: string | null
          description: string | null
          display_name: string
          error_mapping: Json
          fit_scoring_rules: Json
          id: string
          is_system_default: boolean | null
          logo_url: string | null
          provider_key: string
          response_mapping: Json
          updated_at: string | null
        }
        Insert: {
          api_config?: Json
          created_at?: string | null
          created_by_org?: string | null
          description?: string | null
          display_name: string
          error_mapping?: Json
          fit_scoring_rules?: Json
          id?: string
          is_system_default?: boolean | null
          logo_url?: string | null
          provider_key: string
          response_mapping?: Json
          updated_at?: string | null
        }
        Update: {
          api_config?: Json
          created_at?: string | null
          created_by_org?: string | null
          description?: string | null
          display_name?: string
          error_mapping?: Json
          fit_scoring_rules?: Json
          id?: string
          is_system_default?: boolean | null
          logo_url?: string | null
          provider_key?: string
          response_mapping?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_provider_definitions_created_by_org_fkey"
            columns: ["created_by_org"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_definitions: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          display_name_plural: string
          entity_name: string
          icon: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          primary_key: string
          query_config: Json
          table_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          display_name_plural: string
          entity_name: string
          icon?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          primary_key?: string
          query_config?: Json
          table_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          display_name_plural?: string
          entity_name?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          primary_key?: string
          query_config?: Json
          table_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_fields: {
        Row: {
          created_at: string
          default_value: string | null
          display_order: number
          entity_definition_id: string
          field_label: string
          field_name: string
          field_type: string
          id: string
          is_form_field: boolean
          is_list_field: boolean
          is_required: boolean
          is_searchable: boolean
          options: Json | null
          placeholder: string | null
          position: number | null
          updated_at: string
          validation: Json | null
          width: string | null
        }
        Insert: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          entity_definition_id: string
          field_label: string
          field_name: string
          field_type?: string
          id?: string
          is_form_field?: boolean
          is_list_field?: boolean
          is_required?: boolean
          is_searchable?: boolean
          options?: Json | null
          placeholder?: string | null
          position?: number | null
          updated_at?: string
          validation?: Json | null
          width?: string | null
        }
        Update: {
          created_at?: string
          default_value?: string | null
          display_order?: number
          entity_definition_id?: string
          field_label?: string
          field_name?: string
          field_type?: string
          id?: string
          is_form_field?: boolean
          is_list_field?: boolean
          is_required?: boolean
          is_searchable?: boolean
          options?: Json | null
          placeholder?: string | null
          position?: number | null
          updated_at?: string
          validation?: Json | null
          width?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_fields_entity_definition_id_fkey"
            columns: ["entity_definition_id"]
            isOneToOne: false
            referencedRelation: "entity_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_permissions: {
        Row: {
          can_bulk_edit: boolean
          can_create: boolean
          can_delete: boolean
          can_export: boolean
          can_update: boolean
          can_view: boolean
          created_at: string
          entity_definition_id: string
          field_restrictions: Json | null
          id: string
          role: string
        }
        Insert: {
          can_bulk_edit?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          entity_definition_id: string
          field_restrictions?: Json | null
          id?: string
          role: string
        }
        Update: {
          can_bulk_edit?: boolean
          can_create?: boolean
          can_delete?: boolean
          can_export?: boolean
          can_update?: boolean
          can_view?: boolean
          created_at?: string
          entity_definition_id?: string
          field_restrictions?: Json | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_permissions_entity_definition_id_fkey"
            columns: ["entity_definition_id"]
            isOneToOne: false
            referencedRelation: "entity_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_references: {
        Row: {
          confidence_score: number | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_used_at: string | null
          organization_id: string | null
          reference_text: string
          reference_type: string
          usage_count: number | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          last_used_at?: string | null
          organization_id?: string | null
          reference_text: string
          reference_type: string
          usage_count?: number | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_used_at?: string | null
          organization_id?: string | null
          reference_text?: string
          reference_type?: string
          usage_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_references_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_records: {
        Row: {
          confidence_overall: number | null
          created_at: string | null
          entities_created: Json | null
          extraction_json: Json
          extraction_version: string | null
          id: string
          model_used: string | null
          organization_id: string
          processing_time_ms: number | null
          review_status: string | null
          source_document_id: string
          user_modifications: Json | null
        }
        Insert: {
          confidence_overall?: number | null
          created_at?: string | null
          entities_created?: Json | null
          extraction_json: Json
          extraction_version?: string | null
          id?: string
          model_used?: string | null
          organization_id: string
          processing_time_ms?: number | null
          review_status?: string | null
          source_document_id: string
          user_modifications?: Json | null
        }
        Update: {
          confidence_overall?: number | null
          created_at?: string | null
          entities_created?: Json | null
          extraction_json?: Json
          extraction_version?: string | null
          id?: string
          model_used?: string | null
          organization_id?: string
          processing_time_ms?: number | null
          review_status?: string | null
          source_document_id?: string
          user_modifications?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_records_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_requests: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          linked_feature_id: string | null
          organization_id: string
          priority_score: number | null
          request_count: number | null
          source_account_id: string | null
          source_contact_id: string | null
          source_deal_id: string | null
          source_type: string
          status: string | null
          title: string
          total_opportunity_value: number | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          linked_feature_id?: string | null
          organization_id: string
          priority_score?: number | null
          request_count?: number | null
          source_account_id?: string | null
          source_contact_id?: string | null
          source_deal_id?: string | null
          source_type: string
          status?: string | null
          title: string
          total_opportunity_value?: number | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          linked_feature_id?: string | null
          organization_id?: string
          priority_score?: number | null
          request_count?: number | null
          source_account_id?: string | null
          source_contact_id?: string | null
          source_deal_id?: string | null
          source_type?: string
          status?: string | null
          title?: string
          total_opportunity_value?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_requests_linked_feature_id_fkey"
            columns: ["linked_feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "feature_requests_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_requests_source_contact_id_fkey"
            columns: ["source_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "feature_requests_source_deal_id_fkey"
            columns: ["source_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_presentations: {
        Row: {
          account_id: string | null
          ai_calls_made: Json | null
          contact_id: string | null
          content_path: string | null
          created_at: string
          deal_id: string | null
          error_message: string | null
          file_name: string
          generation_config: Json | null
          generation_mode: Database["public"]["Enums"]["slide_generation_mode"]
          generation_time_ms: number | null
          id: string
          organization_id: string
          output_path: string | null
          personalization_level: Database["public"]["Enums"]["slide_personalization_level"]
          slot_values_used: Json | null
          status: string | null
          storage_path: string
          template_id: string | null
          thumbnail_path: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          version: number | null
        }
        Insert: {
          account_id?: string | null
          ai_calls_made?: Json | null
          contact_id?: string | null
          content_path?: string | null
          created_at?: string
          deal_id?: string | null
          error_message?: string | null
          file_name: string
          generation_config?: Json | null
          generation_mode?: Database["public"]["Enums"]["slide_generation_mode"]
          generation_time_ms?: number | null
          id?: string
          organization_id: string
          output_path?: string | null
          personalization_level?: Database["public"]["Enums"]["slide_personalization_level"]
          slot_values_used?: Json | null
          status?: string | null
          storage_path: string
          template_id?: string | null
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          version?: number | null
        }
        Update: {
          account_id?: string | null
          ai_calls_made?: Json | null
          contact_id?: string | null
          content_path?: string | null
          created_at?: string
          deal_id?: string | null
          error_message?: string | null
          file_name?: string
          generation_config?: Json | null
          generation_mode?: Database["public"]["Enums"]["slide_generation_mode"]
          generation_time_ms?: number | null
          id?: string
          organization_id?: string
          output_path?: string | null
          personalization_level?: Database["public"]["Enums"]["slide_personalization_level"]
          slot_values_used?: Json | null
          status?: string | null
          storage_path?: string
          template_id?: string | null
          thumbnail_path?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_presentations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "generated_presentations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_presentations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_presentations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "generated_presentations_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_presentations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_presentations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "slide_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      google_tokens: {
        Row: {
          access_token: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          refresh_token: string
          scopes: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token: string
          scopes?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          refresh_token?: string
          scopes?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      invitation_rate_limits: {
        Row: {
          created_at: string | null
          id: string
          invitations_sent: number | null
          last_invitation_at: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invitations_sent?: number | null
          last_invitation_at?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invitations_sent?: number | null
          last_invitation_at?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          id: string
          message: string | null
          organization_id: string
          requested_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id: string
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          behavioral_score: number | null
          company_score: number | null
          contact_id: string
          created_at: string
          demographic_score: number | null
          id: string
          last_calculated_at: string | null
          organization_id: string
          score_breakdown: Json | null
          score_grade: string | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          behavioral_score?: number | null
          company_score?: number | null
          contact_id: string
          created_at?: string
          demographic_score?: number | null
          id?: string
          last_calculated_at?: string | null
          organization_id: string
          score_breakdown?: Json | null
          score_grade?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          behavioral_score?: number | null
          company_score?: number | null
          contact_id?: string
          created_at?: string
          demographic_score?: number | null
          id?: string
          last_calculated_at?: string | null
          organization_id?: string
          score_breakdown?: Json | null
          score_grade?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_scoring_rules: {
        Row: {
          created_at: string
          field_name: string
          field_value: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          rule_name: string
          rule_type: string
          score_points: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          field_name: string
          field_value?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          rule_name: string
          rule_type: string
          score_points?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          field_name?: string
          field_value?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          rule_name?: string
          rule_type?: string
          score_points?: number
          updated_at?: string
        }
        Relationships: []
      }
      ltv_benchmarks: {
        Row: {
          avg_contract_length_months: number | null
          avg_deal_size: number | null
          avg_ltv: number | null
          churn_rate: number | null
          expansion_rate: number | null
          id: string
          last_calculated_at: string | null
          median_ltv: number | null
          organization_id: string
          sample_size: number | null
          segment_type: string
          segment_value: string
        }
        Insert: {
          avg_contract_length_months?: number | null
          avg_deal_size?: number | null
          avg_ltv?: number | null
          churn_rate?: number | null
          expansion_rate?: number | null
          id?: string
          last_calculated_at?: string | null
          median_ltv?: number | null
          organization_id: string
          sample_size?: number | null
          segment_type: string
          segment_value: string
        }
        Update: {
          avg_contract_length_months?: number | null
          avg_deal_size?: number | null
          avg_ltv?: number | null
          churn_rate?: number | null
          expansion_rate?: number | null
          id?: string
          last_calculated_at?: string | null
          median_ltv?: number | null
          organization_id?: string
          sample_size?: number | null
          segment_type?: string
          segment_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "ltv_benchmarks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_log: {
        Row: {
          channel: string
          channel_message_id: string | null
          content: string
          created_at: string | null
          delivered_at: string | null
          direction: string
          entities_extracted: Json | null
          error_message: string | null
          failed_at: string | null
          id: string
          intent_detected: string | null
          media_url: string | null
          message_type: string | null
          next_retry_at: string | null
          organization_id: string | null
          processing_time_ms: number | null
          read_at: string | null
          retry_count: number | null
          sent_at: string | null
          session_id: string | null
          status: string | null
          tool_calls_made: Json | null
          user_id: string | null
        }
        Insert: {
          channel: string
          channel_message_id?: string | null
          content: string
          created_at?: string | null
          delivered_at?: string | null
          direction: string
          entities_extracted?: Json | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          intent_detected?: string | null
          media_url?: string | null
          message_type?: string | null
          next_retry_at?: string | null
          organization_id?: string | null
          processing_time_ms?: number | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          session_id?: string | null
          status?: string | null
          tool_calls_made?: Json | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          channel_message_id?: string | null
          content?: string
          created_at?: string | null
          delivered_at?: string | null
          direction?: string
          entities_extracted?: Json | null
          error_message?: string | null
          failed_at?: string | null
          id?: string
          intent_detected?: string | null
          media_url?: string | null
          message_type?: string | null
          next_retry_at?: string | null
          organization_id?: string | null
          processing_time_ms?: number | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          session_id?: string | null
          status?: string | null
          tool_calls_made?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "messaging_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body_template: string
          category: string
          created_at: string | null
          id: string
          name: string
          organization_id: string | null
          status: string | null
          template_sid: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          body_template: string
          category: string
          created_at?: string | null
          id?: string
          name: string
          organization_id?: string | null
          status?: string | null
          template_sid?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          body_template?: string
          category?: string
          created_at?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          status?: string | null
          template_sid?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_sessions: {
        Row: {
          channel: string
          channel_user_id: string
          context_entity_id: string | null
          context_entity_type: string | null
          conversation_history: Json | null
          created_at: string | null
          entity_context: Json | null
          id: string
          is_active: boolean | null
          last_message_at: string | null
          organization_id: string
          pending_deal_creation: Json | null
          pending_deal_creation_at: string | null
          pending_deal_update: Json | null
          pending_deal_update_at: string | null
          pending_draft_email: Json | null
          pending_draft_email_at: string | null
          pending_extraction: Json | null
          pending_extraction_at: string | null
          pending_schedule_meeting: Json | null
          pending_schedule_meeting_at: string | null
          pending_sequence_action: Json | null
          pending_sequence_action_at: string | null
          session_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          channel: string
          channel_user_id: string
          context_entity_id?: string | null
          context_entity_type?: string | null
          conversation_history?: Json | null
          created_at?: string | null
          entity_context?: Json | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          organization_id: string
          pending_deal_creation?: Json | null
          pending_deal_creation_at?: string | null
          pending_deal_update?: Json | null
          pending_deal_update_at?: string | null
          pending_draft_email?: Json | null
          pending_draft_email_at?: string | null
          pending_extraction?: Json | null
          pending_extraction_at?: string | null
          pending_schedule_meeting?: Json | null
          pending_schedule_meeting_at?: string | null
          pending_sequence_action?: Json | null
          pending_sequence_action_at?: string | null
          session_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          channel_user_id?: string
          context_entity_id?: string | null
          context_entity_type?: string | null
          conversation_history?: Json | null
          created_at?: string | null
          entity_context?: Json | null
          id?: string
          is_active?: boolean | null
          last_message_at?: string | null
          organization_id?: string
          pending_deal_creation?: Json | null
          pending_deal_creation_at?: string | null
          pending_deal_update?: Json | null
          pending_deal_update_at?: string | null
          pending_draft_email?: Json | null
          pending_draft_email_at?: string | null
          pending_extraction?: Json | null
          pending_extraction_at?: string | null
          pending_schedule_meeting?: Json | null
          pending_schedule_meeting_at?: string | null
          pending_sequence_action?: Json | null
          pending_sequence_action_at?: string | null
          session_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          body: string
          channel: string | null
          created_at: string | null
          data: Json | null
          error_message: string | null
          id: string
          notification_type: string
          organization_id: string
          requires_template: boolean | null
          scheduled_for: string | null
          sent_at: string | null
          status: string | null
          template_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          channel?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type: string
          organization_id: string
          requires_template?: boolean | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          channel?: string | null
          created_at?: string | null
          data?: Json | null
          error_message?: string | null
          id?: string
          notification_type?: string
          organization_id?: string
          requires_template?: boolean | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string | null
          template_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          role: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          organization_id: string
          role?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          role?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invite_code: string | null
          invite_code_hash: string | null
          invited_by: string | null
          org_id: string | null
          role: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invite_code?: string | null
          invite_code_hash?: string | null
          invited_by?: string | null
          org_id?: string | null
          role?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invite_code?: string | null
          invite_code_hash?: string | null
          invited_by?: string | null
          org_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_join_requests: {
        Row: {
          admin_message: string | null
          attempts_count: number | null
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown
          message: string | null
          metadata: Json | null
          organization_id: string
          requested_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_agent: string | null
          user_domain: string
          user_email: string
          user_name: string | null
        }
        Insert: {
          admin_message?: string | null
          attempts_count?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          message?: string | null
          metadata?: Json | null
          organization_id: string
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_domain: string
          user_email: string
          user_name?: string | null
        }
        Update: {
          admin_message?: string | null
          attempts_count?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          message?: string | null
          metadata?: Json | null
          organization_id?: string
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
          user_domain?: string
          user_email?: string
          user_name?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          is_active: boolean | null
          joined_at: string
          organization_id: string
          role: string
          sales_role: string | null
          sales_role_status: string | null
          sales_role_updated_by: string | null
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          joined_at?: string
          organization_id: string
          role?: string
          sales_role?: string | null
          sales_role_status?: string | null
          sales_role_updated_by?: string | null
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean | null
          joined_at?: string
          organization_id?: string
          role?: string
          sales_role?: string | null
          sales_role_status?: string | null
          sales_role_updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_security_logs: {
        Row: {
          admin_user_id: string | null
          created_at: string | null
          event_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          organization_id: string
          user_agent: string | null
          user_domain: string
          user_email: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string | null
          event_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          organization_id: string
          user_agent?: string | null
          user_domain: string
          user_email: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string | null
          event_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          organization_id?: string
          user_agent?: string | null
          user_domain?: string
          user_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_security_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          accept_external_requests: boolean | null
          allow_public_domains: boolean | null
          allowed_domains: string[] | null
          auto_approve_domains: boolean | null
          auto_join_enabled: boolean | null
          company_size: string | null
          created_at: string
          created_by: string | null
          demo_metadata: Json | null
          domain: string | null
          domain_aliases: string[] | null
          environment_domains: Json | null
          id: string
          industry: string | null
          ip_whitelist: unknown[] | null
          is_active: boolean | null
          is_demo: boolean | null
          max_auto_approvals_per_day: number | null
          name: string
          require_admin_approval: boolean | null
          signup_locked: boolean | null
          signup_locked_reason: string | null
          sso_required: boolean | null
          updated_at: string
        }
        Insert: {
          accept_external_requests?: boolean | null
          allow_public_domains?: boolean | null
          allowed_domains?: string[] | null
          auto_approve_domains?: boolean | null
          auto_join_enabled?: boolean | null
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          demo_metadata?: Json | null
          domain?: string | null
          domain_aliases?: string[] | null
          environment_domains?: Json | null
          id?: string
          industry?: string | null
          ip_whitelist?: unknown[] | null
          is_active?: boolean | null
          is_demo?: boolean | null
          max_auto_approvals_per_day?: number | null
          name: string
          require_admin_approval?: boolean | null
          signup_locked?: boolean | null
          signup_locked_reason?: string | null
          sso_required?: boolean | null
          updated_at?: string
        }
        Update: {
          accept_external_requests?: boolean | null
          allow_public_domains?: boolean | null
          allowed_domains?: string[] | null
          auto_approve_domains?: boolean | null
          auto_join_enabled?: boolean | null
          company_size?: string | null
          created_at?: string
          created_by?: string | null
          demo_metadata?: Json | null
          domain?: string | null
          domain_aliases?: string[] | null
          environment_domains?: Json | null
          id?: string
          industry?: string | null
          ip_whitelist?: unknown[] | null
          is_active?: boolean | null
          is_demo?: boolean | null
          max_auto_approvals_per_day?: number | null
          name?: string
          require_admin_approval?: boolean | null
          signup_locked?: boolean | null
          signup_locked_reason?: string | null
          sso_required?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      pipeline_stages: {
        Row: {
          created_at: string | null
          id: string
          is_closed: boolean | null
          is_won: boolean | null
          name: string
          organization_id: string
          position: number | null
          probability: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          name: string
          organization_id: string
          position?: number | null
          probability?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          is_won?: boolean | null
          name?: string
          organization_id?: string
          position?: number | null
          probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_velocity_metrics: {
        Row: {
          avg_days: number | null
          calculated_at: string | null
          conversion_rate: number | null
          created_at: string
          deal_count: number | null
          id: string
          organization_id: string
          stage_name: string
          velocity_data: Json | null
        }
        Insert: {
          avg_days?: number | null
          calculated_at?: string | null
          conversion_rate?: number | null
          created_at?: string
          deal_count?: number | null
          id?: string
          organization_id: string
          stage_name: string
          velocity_data?: Json | null
        }
        Update: {
          avg_days?: number | null
          calculated_at?: string | null
          conversion_rate?: number | null
          created_at?: string
          deal_count?: number | null
          id?: string
          organization_id?: string
          stage_name?: string
          velocity_data?: Json | null
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      product_features: {
        Row: {
          category: string | null
          competitors_with_feature: string[] | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_premium: boolean | null
          minimum_tier: string | null
          name: string
          organization_id: string
          product_id: string | null
          roadmap_eta: string | null
          roadmap_priority: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          competitors_with_feature?: string[] | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_premium?: boolean | null
          minimum_tier?: string | null
          name: string
          organization_id: string
          product_id?: string | null
          roadmap_eta?: string | null
          roadmap_priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          competitors_with_feature?: string[] | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_premium?: boolean | null
          minimum_tier?: string | null
          name?: string
          organization_id?: string
          product_id?: string | null
          roadmap_eta?: string | null
          roadmap_priority?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_features_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_features_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number | null
          billing_frequency: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          name: string
          organization_id: string
          pricing_model: string | null
          pricing_tiers: Json | null
          roadmap_eta: string | null
          sku: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number | null
          billing_frequency?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name: string
          organization_id: string
          pricing_model?: string | null
          pricing_tiers?: Json | null
          roadmap_eta?: string | null
          sku?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number | null
          billing_frequency?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name?: string
          organization_id?: string
          pricing_model?: string | null
          pricing_tiers?: Json | null
          roadmap_eta?: string | null
          sku?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          calendar_last_synced_at: string | null
          calendar_sync_count: number | null
          created_at: string | null
          department: string | null
          email: string
          full_name: string | null
          id: string
          manager_id: string | null
          onboarding_completed_at: string | null
          role: string | null
          signup_metadata: Json | null
          territory: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          calendar_last_synced_at?: string | null
          calendar_sync_count?: number | null
          created_at?: string | null
          department?: string | null
          email: string
          full_name?: string | null
          id: string
          manager_id?: string | null
          onboarding_completed_at?: string | null
          role?: string | null
          signup_metadata?: Json | null
          territory?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          calendar_last_synced_at?: string | null
          calendar_sync_count?: number | null
          created_at?: string | null
          department?: string | null
          email?: string
          full_name?: string | null
          id?: string
          manager_id?: string | null
          onboarding_completed_at?: string | null
          role?: string | null
          signup_metadata?: Json | null
          territory?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_approvals: {
        Row: {
          approved_by: string
          comments: string | null
          created_at: string
          decision: string
          id: string
          request_id: string
        }
        Insert: {
          approved_by: string
          comments?: string | null
          created_at?: string
          decision: string
          id?: string
          request_id: string
        }
        Update: {
          approved_by?: string
          comments?: string | null
          created_at?: string
          decision?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prompt_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "prompt_change_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      prompt_change_requests: {
        Row: {
          approved_at: string | null
          created_at: string
          current_content: string | null
          id: string
          justification: string | null
          proposed_content: string
          reason: string | null
          rejected_at: string | null
          requested_by: string
          required_approvals: number | null
          section_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          current_content?: string | null
          id?: string
          justification?: string | null
          proposed_content: string
          reason?: string | null
          rejected_at?: string | null
          requested_by: string
          required_approvals?: number | null
          section_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          current_content?: string | null
          id?: string
          justification?: string | null
          proposed_content?: string
          reason?: string | null
          rejected_at?: string | null
          requested_by?: string
          required_approvals?: number | null
          section_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_email_domains: {
        Row: {
          created_at: string | null
          domain: string
          id: string
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
        }
        Relationships: []
      }
      query_accuracy_logs: {
        Row: {
          created_at: string | null
          exact_match_count: number | null
          expected_entity_type: string | null
          id: string
          intent: string
          match_score: number | null
          organization_id: string
          refinement_attempt: number | null
          result_count: number | null
          search_query: string
          session_id: string | null
          similar_match_count: number | null
          time_to_result_ms: number | null
          user_clicked_result: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exact_match_count?: number | null
          expected_entity_type?: string | null
          id?: string
          intent: string
          match_score?: number | null
          organization_id: string
          refinement_attempt?: number | null
          result_count?: number | null
          search_query: string
          session_id?: string | null
          similar_match_count?: number | null
          time_to_result_ms?: number | null
          user_clicked_result?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exact_match_count?: number | null
          expected_entity_type?: string | null
          id?: string
          intent?: string
          match_score?: number | null
          organization_id?: string
          refinement_attempt?: number | null
          result_count?: number | null
          search_query?: string
          session_id?: string | null
          similar_match_count?: number | null
          time_to_result_ms?: number | null
          user_clicked_result?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "query_accuracy_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "query_accuracy_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      query_plan_cache: {
        Row: {
          created_at: string | null
          expires_at: string
          hit_count: number | null
          id: string
          last_accessed_at: string | null
          query_hash: string
          query_plan: Json
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          query_hash: string
          query_plan: Json
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          query_hash?: string
          query_plan?: Json
        }
        Relationships: []
      }
      role_templates: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          permissions_template: Json
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          permissions_template?: Json
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          permissions_template?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      sales_quotas: {
        Row: {
          amount: number
          created_at: string | null
          created_by: string | null
          fiscal_year_start: number | null
          id: string
          is_active: boolean | null
          organization_id: string
          period: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: number | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          period: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          created_by?: string | null
          fiscal_year_start?: number | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          period?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_artifacts: {
        Row: {
          chart_config: Json | null
          created_at: string
          id: string
          is_pinned: boolean | null
          is_shared: boolean | null
          last_refreshed_at: string | null
          last_result: Json | null
          organization_id: string | null
          original_prompt: string | null
          query_config: Json
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chart_config?: Json | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_shared?: boolean | null
          last_refreshed_at?: string | null
          last_result?: Json | null
          organization_id?: string | null
          original_prompt?: string | null
          query_config: Json
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chart_config?: Json | null
          created_at?: string
          id?: string
          is_pinned?: boolean | null
          is_shared?: boolean | null
          last_refreshed_at?: string | null
          last_result?: Json | null
          organization_id?: string | null
          original_prompt?: string | null
          query_config?: Json
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_artifacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sequence_enrollments: {
        Row: {
          contact_id: string
          current_step: number | null
          enrolled_at: string | null
          enrolled_by: string | null
          exit_reason: string | null
          id: string
          last_step_at: string | null
          next_step_at: string | null
          organization_id: string
          sequence_id: string
          status: string | null
        }
        Insert: {
          contact_id: string
          current_step?: number | null
          enrolled_at?: string | null
          enrolled_by?: string | null
          exit_reason?: string | null
          id?: string
          last_step_at?: string | null
          next_step_at?: string | null
          organization_id: string
          sequence_id: string
          status?: string | null
        }
        Update: {
          contact_id?: string
          current_step?: number | null
          enrolled_at?: string | null
          enrolled_by?: string | null
          exit_reason?: string | null
          id?: string
          last_step_at?: string | null
          next_step_at?: string | null
          organization_id?: string
          sequence_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "sequence_enrollments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequence_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      sequences: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          exit_criteria: Json | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          steps: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          exit_criteria?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          steps?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          exit_criteria?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          steps?: Json
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_decisions: {
        Row: {
          conversion_source: string | null
          created_at: string | null
          decision: string
          domain: string
          email: string
          id: string
          metadata: Json | null
          organization_id: string | null
          user_id: string | null
          utm_parameters: Json | null
        }
        Insert: {
          conversion_source?: string | null
          created_at?: string | null
          decision: string
          domain: string
          email: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
          utm_parameters?: Json | null
        }
        Update: {
          conversion_source?: string | null
          created_at?: string | null
          decision?: string
          domain?: string
          email?: string
          id?: string
          metadata?: Json | null
          organization_id?: string | null
          user_id?: string | null
          utm_parameters?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "signup_decisions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_generation_preferences: {
        Row: {
          brand_colors: Json | null
          created_at: string
          default_ai_model: string | null
          font_preferences: Json | null
          id: string
          logo_storage_path: string | null
          organization_id: string
          style_keywords: string[] | null
          updated_at: string
        }
        Insert: {
          brand_colors?: Json | null
          created_at?: string
          default_ai_model?: string | null
          font_preferences?: Json | null
          id?: string
          logo_storage_path?: string | null
          organization_id: string
          style_keywords?: string[] | null
          updated_at?: string
        }
        Update: {
          brand_colors?: Json | null
          created_at?: string
          default_ai_model?: string | null
          font_preferences?: Json | null
          id?: string
          logo_storage_path?: string | null
          organization_id?: string
          style_keywords?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_generation_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      slide_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          extracted_structure: Json | null
          id: string
          is_active: boolean | null
          is_ai_base_template: boolean | null
          is_default: boolean | null
          name: string
          organization_id: string
          slide_count: number | null
          stage_alignment: string[] | null
          storage_path: string | null
          template_type: Database["public"]["Enums"]["slide_template_type"]
          thumbnail_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          extracted_structure?: Json | null
          id?: string
          is_active?: boolean | null
          is_ai_base_template?: boolean | null
          is_default?: boolean | null
          name: string
          organization_id: string
          slide_count?: number | null
          stage_alignment?: string[] | null
          storage_path?: string | null
          template_type?: Database["public"]["Enums"]["slide_template_type"]
          thumbnail_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          extracted_structure?: Json | null
          id?: string
          is_active?: boolean | null
          is_ai_base_template?: boolean | null
          is_default?: boolean | null
          name?: string
          organization_id?: string
          slide_count?: number | null
          stage_alignment?: string[] | null
          storage_path?: string | null
          template_type?: Database["public"]["Enums"]["slide_template_type"]
          thumbnail_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "slide_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      source_documents: {
        Row: {
          account_id: string | null
          chat_session_id: string | null
          created_at: string | null
          deal_id: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          id: string
          is_archived: boolean | null
          organization_id: string
          raw_content: string | null
          search_vector: unknown
          source_type: string
          storage_bucket: string | null
          storage_path: string | null
          title: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          chat_session_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_archived?: boolean | null
          organization_id: string
          raw_content?: string | null
          search_vector?: unknown
          source_type: string
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          chat_session_id?: string | null
          created_at?: string | null
          deal_id?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_archived?: boolean | null
          organization_id?: string
          raw_content?: string | null
          search_vector?: unknown
          source_type?: string
          storage_bucket?: string | null
          storage_path?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "source_documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      suggested_actions: {
        Row: {
          acted_on_at: string | null
          action_type: string
          assigned_to: string | null
          confidence: number
          contact_id: string | null
          created_at: string
          deal_id: string | null
          dedup_key: string
          description: string
          dismissed_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          priority: string
          reasoning: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          acted_on_at?: string | null
          action_type: string
          assigned_to?: string | null
          confidence?: number
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          dedup_key: string
          description: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          priority?: string
          reasoning?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          acted_on_at?: string | null
          action_type?: string
          assigned_to?: string | null
          confidence?: number
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          dedup_key?: string
          description?: string
          dismissed_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          priority?: string
          reasoning?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggested_actions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_actions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "suggested_actions_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggested_actions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_prompt_config: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          deactivated_by: string | null
          deactivation_reason: string | null
          id: string
          is_active: boolean
          organization_id: string | null
          performance_metrics: Json | null
          section_order: number | null
          section_title: string | null
          section_type: string | null
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          performance_metrics?: Json | null
          section_order?: number | null
          section_title?: string | null
          section_type?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          deactivated_by?: string | null
          deactivation_reason?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string | null
          performance_metrics?: Json | null
          section_order?: number | null
          section_title?: string | null
          section_type?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_prompt_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          account_id: string | null
          assigned_to: string | null
          calendar_synced_at: string | null
          completed: boolean | null
          contact_id: string | null
          created_at: string
          deal_id: string | null
          description: string | null
          due_date: string | null
          google_event_id: string | null
          id: string
          organization_id: string | null
          priority: string | null
          source_document_id: string | null
          status: string | null
          task_number: number
          title: string
          updated_at: string
          user_id: string
          version: number | null
        }
        Insert: {
          account_id?: string | null
          assigned_to?: string | null
          calendar_synced_at?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          organization_id?: string | null
          priority?: string | null
          source_document_id?: string | null
          status?: string | null
          task_number?: number
          title?: string
          updated_at?: string
          user_id: string
          version?: number | null
        }
        Update: {
          account_id?: string | null
          assigned_to?: string | null
          calendar_synced_at?: string | null
          completed?: boolean | null
          contact_id?: string | null
          created_at?: string
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          google_event_id?: string | null
          id?: string
          organization_id?: string | null
          priority?: string | null
          source_document_id?: string | null
          status?: string | null
          task_number?: number
          title?: string
          updated_at?: string
          user_id?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_tasks_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "account_health_mv"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "fk_tasks_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tasks_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tasks_contact_id"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "customer_engagement_mv"
            referencedColumns: ["contact_id"]
          },
          {
            foreignKeyName: "fk_tasks_deal_id"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "source_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      template_slot_mappings: {
        Row: {
          ai_max_tokens: number | null
          ai_model: string | null
          ai_prompt: string | null
          ai_temperature: number | null
          bounding_box: Json | null
          condition_logic: Json | null
          created_at: string
          data_source: string | null
          display_order: number | null
          element_id: string
          element_type: Database["public"]["Enums"]["slide_element_type"]
          fallback_value: string | null
          format_as: string | null
          id: string
          mapping_type: Database["public"]["Enums"]["slot_mapping_type"]
          max_characters: number | null
          placeholder_text: string | null
          slide_index: number
          slot_name: string
          template_id: string
        }
        Insert: {
          ai_max_tokens?: number | null
          ai_model?: string | null
          ai_prompt?: string | null
          ai_temperature?: number | null
          bounding_box?: Json | null
          condition_logic?: Json | null
          created_at?: string
          data_source?: string | null
          display_order?: number | null
          element_id: string
          element_type?: Database["public"]["Enums"]["slide_element_type"]
          fallback_value?: string | null
          format_as?: string | null
          id?: string
          mapping_type?: Database["public"]["Enums"]["slot_mapping_type"]
          max_characters?: number | null
          placeholder_text?: string | null
          slide_index: number
          slot_name: string
          template_id: string
        }
        Update: {
          ai_max_tokens?: number | null
          ai_model?: string | null
          ai_prompt?: string | null
          ai_temperature?: number | null
          bounding_box?: Json | null
          condition_logic?: Json | null
          created_at?: string
          data_source?: string | null
          display_order?: number | null
          element_id?: string
          element_type?: Database["public"]["Enums"]["slide_element_type"]
          fallback_value?: string | null
          format_as?: string | null
          id?: string
          mapping_type?: Database["public"]["Enums"]["slot_mapping_type"]
          max_characters?: number | null
          placeholder_text?: string | null
          slide_index?: number
          slot_name?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_slot_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "slide_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_logs: {
        Row: {
          activity_type: string
          created_at: string
          id: string
          ip_address: unknown
          metadata: Json | null
          organization_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          organization_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_ai_preferences: {
        Row: {
          created_at: string
          max_tokens: number | null
          model: string
          provider: string
          temperature: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          max_tokens?: number | null
          model?: string
          provider?: string
          temperature?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          max_tokens?: number | null
          model?: string
          provider?: string
          temperature?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_channel_registrations: {
        Row: {
          channel: string
          channel_metadata: Json | null
          channel_user_id: string
          channel_user_id_hash: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          last_inbound_at: string | null
          updated_at: string | null
          user_id: string
          verification_code: string | null
          verification_expires_at: string | null
          verified_at: string | null
        }
        Insert: {
          channel: string
          channel_metadata?: Json | null
          channel_user_id: string
          channel_user_id_hash: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_inbound_at?: string | null
          updated_at?: string | null
          user_id: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Update: {
          channel?: string
          channel_metadata?: Json | null
          channel_user_id?: string
          channel_user_id_hash?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          last_inbound_at?: string | null
          updated_at?: string | null
          user_id?: string
          verification_code?: string | null
          verification_expires_at?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      user_compensation_assignments: {
        Row: {
          compensation_plan_id: string
          created_at: string
          created_by: string | null
          effective_date: string
          end_date: string | null
          id: string
          organization_id: string
          user_id: string
        }
        Insert: {
          compensation_plan_id: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          end_date?: string | null
          id?: string
          organization_id: string
          user_id: string
        }
        Update: {
          compensation_plan_id?: string
          created_at?: string
          created_by?: string | null
          effective_date?: string
          end_date?: string | null
          id?: string
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_compensation_assignments_compensation_plan_id_fkey"
            columns: ["compensation_plan_id"]
            isOneToOne: false
            referencedRelation: "compensation_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_compensation_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_compensation_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_compensation_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string | null
          id: string
          notify_daily_digest: boolean | null
          notify_deal_stagnation: boolean | null
          notify_task_reminders: boolean | null
          preferred_channel: string | null
          quiet_hours_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          quiet_hours_timezone: string | null
          stagnation_days_threshold: number | null
          updated_at: string | null
          user_id: string
          whatsapp_enabled: boolean | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notify_daily_digest?: boolean | null
          notify_deal_stagnation?: boolean | null
          notify_task_reminders?: boolean | null
          preferred_channel?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          stagnation_days_threshold?: number | null
          updated_at?: string | null
          user_id: string
          whatsapp_enabled?: boolean | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notify_daily_digest?: boolean | null
          notify_deal_stagnation?: boolean | null
          notify_task_reminders?: boolean | null
          preferred_channel?: string | null
          quiet_hours_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          quiet_hours_timezone?: string | null
          stagnation_days_threshold?: number | null
          updated_at?: string | null
          user_id?: string
          whatsapp_enabled?: boolean | null
        }
        Relationships: []
      }
      user_prompt_preferences: {
        Row: {
          cache_version: number | null
          communication_style: string | null
          created_at: string | null
          custom_instructions: string | null
          energy_level: string | null
          format_preference: string | null
          id: string
          organization_id: string | null
          rep_bio: string | null
          rep_calendar_url: string | null
          rep_linkedin_url: string | null
          rep_photo_path: string | null
          rep_title: string | null
          signature_phrases: string[] | null
          tone: string | null
          updated_at: string | null
          user_id: string
          verbosity: string | null
        }
        Insert: {
          cache_version?: number | null
          communication_style?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          energy_level?: string | null
          format_preference?: string | null
          id?: string
          organization_id?: string | null
          rep_bio?: string | null
          rep_calendar_url?: string | null
          rep_linkedin_url?: string | null
          rep_photo_path?: string | null
          rep_title?: string | null
          signature_phrases?: string[] | null
          tone?: string | null
          updated_at?: string | null
          user_id: string
          verbosity?: string | null
        }
        Update: {
          cache_version?: number | null
          communication_style?: string | null
          created_at?: string | null
          custom_instructions?: string | null
          energy_level?: string | null
          format_preference?: string | null
          id?: string
          organization_id?: string | null
          rep_bio?: string | null
          rep_calendar_url?: string | null
          rep_linkedin_url?: string | null
          rep_photo_path?: string | null
          rep_title?: string | null
          signature_phrases?: string[] | null
          tone?: string | null
          updated_at?: string | null
          user_id?: string
          verbosity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_prompt_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_quotas: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          fiscal_year_start_month: number
          id: string
          is_active: boolean
          organization_id: string
          period: Database["public"]["Enums"]["compensation_period"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          fiscal_year_start_month?: number
          id?: string
          is_active?: boolean
          organization_id: string
          period?: Database["public"]["Enums"]["compensation_period"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          fiscal_year_start_month?: number
          id?: string
          is_active?: boolean
          organization_id?: string
          period?: Database["public"]["Enums"]["compensation_period"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quotas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quotas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_assignments: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_date: string | null
          expiration_date: string | null
          id: string
          is_active: boolean | null
          product_scope: Json | null
          role_id: string | null
          territory_scope: Json | null
          updated_at: string | null
          user_id: string | null
          vertical_scope: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          product_scope?: Json | null
          role_id?: string | null
          territory_scope?: Json | null
          updated_at?: string | null
          user_id?: string | null
          vertical_scope?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          id?: string
          is_active?: boolean | null
          product_scope?: Json | null
          role_id?: string | null
          territory_scope?: Json | null
          updated_at?: string | null
          user_id?: string | null
          vertical_scope?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "custom_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          action_config: Json | null
          action_type: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          name: string
          organization_id: string
          run_count: number | null
          trigger_condition: string | null
          trigger_entity: string
          trigger_event: string
          trigger_value: string | null
          updated_at: string | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name: string
          organization_id: string
          run_count?: number | null
          trigger_condition?: string | null
          trigger_entity: string
          trigger_event: string
          trigger_value?: string | null
          updated_at?: string | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          name?: string
          organization_id?: string
          run_count?: number | null
          trigger_condition?: string | null
          trigger_entity?: string
          trigger_event?: string
          trigger_value?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_health_mv: {
        Row: {
          account_created: string | null
          account_id: string | null
          account_name: string | null
          contact_count: number | null
          growth_trend: string | null
          health_status: string | null
          industry: string | null
          last_activity_date: string | null
          last_won_date: string | null
          organization_id: string | null
          recent_activities: number | null
          revenue_last_12m: number | null
          revenue_last_6m: number | null
          total_activities: number | null
          total_deals: number | null
          total_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_dashboard_stats: {
        Row: {
          active_deals: number | null
          avg_deal_value: number | null
          organization_id: string | null
          overdue_tasks: number | null
          recent_activities: number | null
          total_activities: number | null
          total_contacts: number | null
          total_deal_value: number | null
          total_deals: number | null
          total_tasks: number | null
          won_deals: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_engagement_mv: {
        Row: {
          avg_deal_value: number | null
          churn_risk: string | null
          contact_id: string | null
          customer_since: string | null
          days_since_last_activity: number | null
          engagement_level: string | null
          last_activity_date: string | null
          lifetime_value: number | null
          organization_id: string | null
          quarterly_activities: number | null
          recent_activities: number | null
          total_activities: number | null
          total_deals: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_gap_insights: {
        Row: {
          avg_impact_per_deal: number | null
          dealbreaker_count: number | null
          deals_affected: number | null
          feature_category: string | null
          feature_id: string | null
          feature_name: string | null
          feature_status: string | null
          impact_levels: string[] | null
          last_occurrence: string | null
          organization_id: string | null
          roadmap_eta: string | null
          roadmap_priority: string | null
          total_deal_value: number | null
          total_opportunity_cost: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_feature_gaps_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_feature_gaps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_analytics_mv: {
        Row: {
          account_industry: string | null
          assigned_to: string | null
          avg_cycle_days: number | null
          avg_deal_size: number | null
          contact_industry: string | null
          deal_count: number | null
          lost_count: number | null
          lost_revenue: number | null
          organization_id: string | null
          period_day: string | null
          period_month: string | null
          period_quarter: string | null
          period_week: string | null
          period_year: string | null
          stage: string | null
          total_revenue: number | null
          won_count: number | null
          won_revenue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_activity_analytics_mv: {
        Row: {
          activity_count: number | null
          activity_day: string | null
          activity_month: string | null
          activity_type: string | null
          activity_week: string | null
          contacts_touched: number | null
          deal_amount: number | null
          deal_stage: string | null
          deals_touched: number | null
          organization_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_prompt_section: {
        Args: {
          p_content: string
          p_section_order?: number
          p_section_title?: string
          p_section_type: string
        }
        Returns: string
      }
      admin_create_organization: {
        Args: { p_domain?: string; p_name: string; p_owner_email?: string }
        Returns: string
      }
      admin_get_all_users: {
        Args: {
          page_limit?: number
          page_offset?: number
          search_query?: string
        }
        Returns: {
          created_at: string
          email: string
          id: string
          is_platform_admin: boolean
          last_sign_in_at: string
          org_memberships: Json
        }[]
      }
      admin_manage_user_org: {
        Args: {
          p_action?: string
          p_role?: string
          p_target_org_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      admin_update_organization: {
        Args: {
          p_domain: string
          p_is_active: boolean
          p_name: string
          p_org_id: string
        }
        Returns: boolean
      }
      analyze_data_quality_with_recommendations: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      approve_sales_role: {
        Args: { p_approved_role?: string; p_member_id: string }
        Returns: undefined
      }
      calculate_bant_score: {
        Args: {
          p_authority_level: string
          p_budget_status: string
          p_need_urgency: string
          p_timeline_status: string
        }
        Returns: number
      }
      calculate_feature_gap_impact: {
        Args: {
          p_days_back?: number
          p_feature_name?: string
          p_organization_id: string
        }
        Returns: {
          avg_deal_size: number
          dealbreaker_rate: number
          deals_lost: number
          feature_name: string
          total_opportunity_cost: number
        }[]
      }
      calculate_lead_score: {
        Args: { p_contact_id: string; p_organization_id: string }
        Returns: Json
      }
      calculate_overall_lead_score: {
        Args: {
          p_bant_score: number
          p_engagement_score: number
          p_fit_score: number
          p_intent_score: number
        }
        Returns: number
      }
      can_manage_compensation: { Args: { org_id: string }; Returns: boolean }
      can_manage_quotas: { Args: { org_id: string }; Returns: boolean }
      check_partition_rls_status: {
        Args: never
        Returns: {
          rls_enabled: boolean
          tablename: string
        }[]
      }
      check_security_definer_functions: {
        Args: never
        Returns: {
          function_name: string
          has_search_path: boolean
          security_definer: boolean
          status: string
        }[]
      }
      check_signup_rate_limit: {
        Args: { org_id?: string; user_email: string }
        Returns: boolean
      }
      cleanup_orphaned_organizations: { Args: never; Returns: number }
      cleanup_query_plan_cache: { Args: never; Returns: number }
      complete_job_execution: {
        Args: {
          p_error_details?: Json
          p_job_id: string
          p_results?: Json
          p_status: string
        }
        Returns: boolean
      }
      compute_quadrant: {
        Args: { influence: number; support: number }
        Returns: string
      }
      create_admin_notification: {
        Args: {
          p_action_data?: Json
          p_action_label?: string
          p_expires_minutes?: number
          p_is_persistent?: boolean
          p_job_id?: string
          p_message: string
          p_organization_id: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_bulk_invitations: {
        Args: {
          default_role?: string
          email_list: string[]
          invited_by_user?: string
          org_id: string
        }
        Returns: Json
      }
      create_demo_organization: {
        Args: {
          org_domain?: string
          org_industry?: string
          org_name?: string
          org_size?: string
        }
        Returns: string
      }
      create_organization: {
        Args: {
          org_domain?: string
          org_industry?: string
          org_name: string
          org_size?: string
        }
        Returns: string
      }
      deactivate_prompt_section: {
        Args: { p_reason?: string; p_section_type: string }
        Returns: number
      }
      execute_analytics_query: {
        Args: {
          p_calculation?: string
          p_entity: string
          p_group_by?: string
          p_limit?: number
          p_metric_field?: string
          p_metrics: string[]
          p_order_by?: string
          p_time_end?: string
          p_time_field?: string
          p_time_start?: string
        }
        Returns: Json
      }
      extract_root_domain: { Args: { email: string }; Returns: string }
      find_organization_by_domain_secure: {
        Args: { user_email: string }
        Returns: {
          auto_approve: boolean
          organization_id: string
          organization_name: string
          requires_verification: boolean
          suggested_role: string
        }[]
      }
      fuzzy_search_accounts: {
        Args: { min_similarity?: number; org_id: string; search_query: string }
        Returns: {
          id: string
          industry: string
          name: string
          similarity_score: number
          website: string
        }[]
      }
      fuzzy_search_contacts: {
        Args: { min_similarity?: number; org_id: string; search_query: string }
        Returns: {
          company: string
          email: string
          full_name: string
          id: string
          similarity_score: number
        }[]
      }
      fuzzy_search_deals: {
        Args: { min_similarity?: number; org_id: string; search_query: string }
        Returns: {
          amount: number
          close_date: string
          id: string
          name: string
          probability: number
          similarity_score: number
          stage: string
        }[]
      }
      generate_invite_code: { Args: never; Returns: string }
      get_account_deal_summary: {
        Args: { p_account_id: string; p_organization_id: string }
        Returns: Json
      }
      get_account_opportunity_history: {
        Args: { p_account_id: string; p_organization_id: string }
        Returns: {
          amount: number
          close_date: string
          created_at: string
          days_in_pipeline: number
          deal_id: string
          deal_name: string
          key_use_case: string
          outcome: string
          products_positioned: string[]
          stage: string
        }[]
      }
      get_admin_organization_overview: {
        Args: never
        Returns: {
          admin_count: number
          company_size: string
          created_at: string
          domain: string
          id: string
          industry: string
          is_demo: boolean
          is_orphaned: boolean
          last_activity: string
          member_count: number
          name: string
        }[]
      }
      get_analytics_data_secure: {
        Args: { p_data_type?: string; p_organization_id: string }
        Returns: Json
      }
      get_current_user_role: { Args: never; Returns: string }
      get_failing_queries: {
        Args: { p_limit?: number; p_organization_id: string; p_since: string }
        Returns: {
          created_at: string
          id: string
          intent: string
          refinement_attempt: number
          search_query: string
          session_id: string
          time_to_result_ms: number
        }[]
      }
      get_or_create_briefing: {
        Args: { p_organization_id: string; p_user_id: string }
        Returns: string
      }
      get_org_system_prompt: {
        Args: { p_org_id: string }
        Returns: {
          content: string
          section_order: number
          section_title: string
          section_type: string
          source: string
        }[]
      }
      get_pipeline_health_dashboard: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      get_pipeline_stats: { Args: { p_organization_id: string }; Returns: Json }
      get_sales_cycle_analytics: {
        Args: {
          p_amount_max?: number
          p_amount_min?: number
          p_analysis_type?: string
          p_organization_id: string
        }
        Returns: Json
      }
      get_search_accuracy_metrics: {
        Args: { p_organization_id: string; p_since: string }
        Returns: Json
      }
      get_system_health_overview: {
        Args: never
        Returns: {
          duplicate_organizations: number
          grade: string
          inactive_users_30d: number
          incomplete_profiles: number
          issues: Json
          orphaned_organizations: number
          orphaned_users: number
          overall_score: number
          total_organizations: number
          total_users: number
        }[]
      }
      get_user_analytics_overview: {
        Args: never
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          last_sign_in_at: string
          organization_count: number
          primary_organization_name: string
          role: string
        }[]
      }
      get_user_crm_stats: { Args: { user_org_ids: string[] }; Returns: Json }
      get_user_crm_stats_optimized: {
        Args: { user_org_ids: string[] }
        Returns: Json
      }
      get_user_last_login: { Args: { p_user_id: string }; Returns: string }
      get_user_organization_ids: { Args: never; Returns: string[] }
      get_user_permissions: { Args: { user_uuid: string }; Returns: Json }
      get_user_role_in_org: { Args: { p_org_id: string }; Returns: string }
      get_user_segment_stats: {
        Args: never
        Returns: {
          segment_type: string
          segment_value: string
          user_count: number
        }[]
      }
      increment_calendar_sync_count: {
        Args: { user_id: string }
        Returns: undefined
      }
      increment_search_attempt: {
        Args: { p_session_id: string }
        Returns: number
      }
      infer_user_role: { Args: { email: string }; Returns: string }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_organization_admin: { Args: { org_id: string }; Returns: boolean }
      is_platform_admin:
        | { Args: never; Returns: boolean }
        | { Args: { user_uuid?: string }; Returns: boolean }
      log_security_event: {
        Args: { p_details?: Json; p_event_type: string }
        Returns: undefined
      }
      log_user_activity: {
        Args: {
          p_activity_type?: string
          p_ip_address?: unknown
          p_metadata?: Json
          p_organization_id?: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: string
      }
      process_chat_message: {
        Args: {
          p_content: string
          p_message_id: string
          p_organization_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      refresh_analytics_views: { Args: never; Returns: undefined }
      request_to_join_organization: {
        Args: { message?: string; org_id: string; requested_role?: string }
        Returns: string
      }
      request_to_join_organization_secure: {
        Args: { message?: string; org_id: string; requested_role?: string }
        Returns: string
      }
      resolve_ambiguous_reference: {
        Args: {
          p_organization_id: string
          p_reference: string
          p_session_id: string
        }
        Returns: {
          confidence: number
          entity_id: string
          entity_name: string
          entity_type: string
        }[]
      }
      resolve_entity_reference: {
        Args: { p_organization_id: string; p_reference_text: string }
        Returns: {
          confidence: number
          entity_id: string
          entity_type: string
          match_type: string
        }[]
      }
      schedule_analytics_refresh: { Args: never; Returns: undefined }
      search_crm_data: {
        Args: {
          p_limit?: number
          p_organization_ids: string[]
          p_search_term: string
          p_table_name: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          rank: number
          table_name: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_job_progress: {
        Args: {
          p_job_id: string
          p_message?: string
          p_metadata?: Json
          p_progress?: number
          p_stage: string
        }
        Returns: string
      }
      user_belongs_to_org: { Args: { org_id: string }; Returns: boolean }
      validate_invite_code: {
        Args: { code: string }
        Returns: {
          error_message: string
          invited_by_email: string
          is_valid: boolean
          organization_id: string
          organization_name: string
          role: string
        }[]
      }
      validate_prompt_section_content: {
        Args: { content: string; section_type: string }
        Returns: boolean
      }
      verify_email: { Args: { verification_code: string }; Returns: boolean }
    }
    Enums: {
      commission_status: "pending" | "approved" | "paid" | "rejected" | "voided"
      compensation_period: "monthly" | "quarterly" | "annual"
      conversation_state_enum:
        | "IDLE"
        | "AWAITING_WEBSITE"
        | "AWAITING_PHONE"
        | "AWAITING_EMAIL"
        | "AWAITING_INDUSTRY"
        | "AWAITING_COMPANY_NAME"
        | "AWAITING_CONTACT_DETAILS"
        | "AWAITING_CONFIRMATION"
        | "AWAITING_CLARIFICATION"
        | "AWAITING_UPDATE_CONFIRMATION"
      slide_element_type: "text" | "image" | "shape" | "chart"
      slide_generation_mode: "template_based" | "ai_creative"
      slide_personalization_level: "account" | "deal" | "contact"
      slide_template_type:
        | "discovery"
        | "proposal"
        | "qbr"
        | "case_study"
        | "executive_summary"
        | "custom"
      slot_mapping_type: "direct" | "ai_generated" | "conditional" | "static"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      commission_status: ["pending", "approved", "paid", "rejected", "voided"],
      compensation_period: ["monthly", "quarterly", "annual"],
      conversation_state_enum: [
        "IDLE",
        "AWAITING_WEBSITE",
        "AWAITING_PHONE",
        "AWAITING_EMAIL",
        "AWAITING_INDUSTRY",
        "AWAITING_COMPANY_NAME",
        "AWAITING_CONTACT_DETAILS",
        "AWAITING_CONFIRMATION",
        "AWAITING_CLARIFICATION",
        "AWAITING_UPDATE_CONFIRMATION",
      ],
      slide_element_type: ["text", "image", "shape", "chart"],
      slide_generation_mode: ["template_based", "ai_creative"],
      slide_personalization_level: ["account", "deal", "contact"],
      slide_template_type: [
        "discovery",
        "proposal",
        "qbr",
        "case_study",
        "executive_summary",
        "custom",
      ],
      slot_mapping_type: ["direct", "ai_generated", "conditional", "static"],
    },
  },
} as const
