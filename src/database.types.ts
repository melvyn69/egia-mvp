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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_tags: {
        Row: {
          category: string | null
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: []
      }
      automation_actions: {
        Row: {
          config: Json
          created_at: string | null
          id: string
          type: string
          user_id: string
          workflow_id: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          id?: string
          type: string
          user_id: string
          workflow_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          id?: string
          type?: string
          user_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_actions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_conditions: {
        Row: {
          created_at: string | null
          field: string
          id: string
          operator: string
          user_id: string
          value: string
          workflow_id: string
        }
        Insert: {
          created_at?: string | null
          field: string
          id?: string
          operator: string
          user_id: string
          value: string
          workflow_id: string
        }
        Update: {
          created_at?: string | null
          field?: string
          id?: string
          operator?: string
          user_id?: string
          value?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_conditions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          created_at: string | null
          enabled: boolean
          id: string
          location_id: string | null
          location_ids: string[] | null
          name: string
          trigger: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          location_id?: string | null
          location_ids?: string[] | null
          name: string
          trigger?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          id?: string
          location_id?: string | null
          location_ids?: string[] | null
          name?: string
          trigger?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brand_voice: {
        Row: {
          context: string | null
          created_at: string | null
          enabled: boolean
          forbidden_words: string[]
          id: string
          language_level: Database["public"]["Enums"]["brand_voice_language_level"]
          location_id: string | null
          tone: Database["public"]["Enums"]["brand_voice_tone"]
          updated_at: string | null
          use_emojis: boolean
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string | null
          enabled?: boolean
          forbidden_words?: string[]
          id?: string
          language_level?: Database["public"]["Enums"]["brand_voice_language_level"]
          location_id?: string | null
          tone?: Database["public"]["Enums"]["brand_voice_tone"]
          updated_at?: string | null
          use_emojis?: boolean
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string | null
          enabled?: boolean
          forbidden_words?: string[]
          id?: string
          language_level?: Database["public"]["Enums"]["brand_voice_language_level"]
          location_id?: string | null
          tone?: Database["public"]["Enums"]["brand_voice_tone"]
          updated_at?: string | null
          use_emojis?: boolean
          user_id?: string
        }
        Relationships: []
      }
      job_queue: {
        Row: {
          attempts: number
          created_at: string
          id: string
          last_error: string | null
          payload: Json
          run_at: string
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          run_at?: string
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          run_at?: string
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      business_memory: {
        Row: {
          business_id: string
          content: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_memory_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_settings"
            referencedColumns: ["business_id"]
          },
        ]
      }
      business_settings: {
        Row: {
          active_location_ids: string[] | null
          business_id: string
          business_name: string
          created_at: string | null
          default_length: string
          default_tone: string
          do_not_say: string | null
          language_level: string | null
          preferred_phrases: string | null
          signature: string | null
          updated_at: string
          use_emojis: boolean | null
          user_id: string | null
        }
        Insert: {
          active_location_ids?: string[] | null
          business_id?: string
          business_name: string
          created_at?: string | null
          default_length?: string
          default_tone?: string
          do_not_say?: string | null
          language_level?: string | null
          preferred_phrases?: string | null
          signature?: string | null
          updated_at?: string
          use_emojis?: boolean | null
          user_id?: string | null
        }
        Update: {
          active_location_ids?: string[] | null
          business_id?: string
          business_name?: string
          created_at?: string | null
          default_length?: string
          default_tone?: string
          do_not_say?: string | null
          language_level?: string | null
          preferred_phrases?: string | null
          signature?: string | null
          updated_at?: string
          use_emojis?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      cron_state: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      google_accounts: {
        Row: {
          account_name: string | null
          account_resource_name: string
          created_at: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_resource_name: string
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_resource_name?: string
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_connections: {
        Row: {
          access_token: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_synced_at: string | null
          oauth_state: string | null
          oauth_state_expires_at: string | null
          provider: string
          refresh_token: string
          scope: string | null
          token_expiry: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          provider?: string
          refresh_token: string
          scope?: string | null
          token_expiry?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_synced_at?: string | null
          oauth_state?: string | null
          oauth_state_expires_at?: string | null
          provider?: string
          refresh_token?: string
          scope?: string | null
          token_expiry?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_locations: {
        Row: {
          account_resource_name: string
          address_json: Json | null
          created_at: string
          id: string
          last_synced_at: string | null
          location_resource_name: string
          location_title: string | null
          phone: string | null
          provider: string
          store_code: string | null
          updated_at: string
          user_id: string
          website_uri: string | null
        }
        Insert: {
          account_resource_name: string
          address_json?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          location_resource_name: string
          location_title?: string | null
          phone?: string | null
          provider?: string
          store_code?: string | null
          updated_at?: string
          user_id: string
          website_uri?: string | null
        }
        Update: {
          account_resource_name?: string
          address_json?: Json | null
          created_at?: string
          id?: string
          last_synced_at?: string | null
          location_resource_name?: string
          location_title?: string | null
          phone?: string | null
          provider?: string
          store_code?: string | null
          updated_at?: string
          user_id?: string
          website_uri?: string | null
        }
        Relationships: []
      }
      google_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      google_reviews: {
        Row: {
          account_resource_name: string | null
          author_name: string | null
          comment: string | null
          create_time: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          last_synced_at: string | null
          location_id: string | null
          location_name: string
          needs_reply: boolean | null
          owner_reply: string | null
          owner_reply_time: string | null
          provider: string
          rating: number | null
          raw: Json | null
          replied_at: string | null
          reply: Json | null
          reply_text: string | null
          review_id: string | null
          review_name: string
          reviewer: Json | null
          star_rating: string | null
          status: string | null
          update_time: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_resource_name?: string | null
          author_name?: string | null
          comment?: string | null
          create_time?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          location_name?: string
          needs_reply?: boolean | null
          owner_reply?: string | null
          owner_reply_time?: string | null
          provider?: string
          rating?: number | null
          raw?: Json | null
          replied_at?: string | null
          reply?: Json | null
          reply_text?: string | null
          review_id?: string | null
          review_name: string
          reviewer?: Json | null
          star_rating?: string | null
          status?: string | null
          update_time?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_resource_name?: string | null
          author_name?: string | null
          comment?: string | null
          create_time?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          location_name?: string
          needs_reply?: boolean | null
          owner_reply?: string | null
          owner_reply_time?: string | null
          provider?: string
          rating?: number | null
          raw?: Json | null
          replied_at?: string | null
          reply?: Json | null
          reply_text?: string | null
          review_id?: string | null
          review_name?: string
          reviewer?: Json | null
          star_rating?: string | null
          status?: string | null
          update_time?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_ai_insights: {
        Row: {
          created_at: string
          error: string | null
          location_resource_name: string
          model: string | null
          processed_at: string | null
          review_pk: string
          sentiment: string | null
          sentiment_score: number | null
          source_update_time: string | null
          summary: string | null
          topics: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          location_resource_name: string
          model?: string | null
          processed_at?: string | null
          review_pk: string
          sentiment?: string | null
          sentiment_score?: number | null
          source_update_time?: string | null
          summary?: string | null
          topics?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          location_resource_name?: string
          model?: string | null
          processed_at?: string | null
          review_pk?: string
          sentiment?: string | null
          sentiment_score?: number | null
          source_update_time?: string | null
          summary?: string | null
          topics?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_ai_insights_review_pk_fkey"
            columns: ["review_pk"]
            isOneToOne: true
            referencedRelation: "google_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_ai_insights_review_pk_fkey"
            columns: ["review_pk"]
            isOneToOne: true
            referencedRelation: "inbox_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      review_ai_tags: {
        Row: {
          confidence: number | null
          created_at: string
          evidence: string | null
          polarity: number | null
          review_pk: string
          tag_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence?: string | null
          polarity?: number | null
          review_pk: string
          tag_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence?: string | null
          polarity?: number | null
          review_pk?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_ai_tags_review_pk_fkey"
            columns: ["review_pk"]
            isOneToOne: false
            referencedRelation: "google_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_ai_tags_review_pk_fkey"
            columns: ["review_pk"]
            isOneToOne: false
            referencedRelation: "inbox_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_ai_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "ai_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      review_drafts: {
        Row: {
          created_at: string | null
          draft_text: string
          id: string
          location_id: string | null
          review_id: string
          status: string
          tone: string | null
          user_id: string
          workflow_id: string | null
        }
        Insert: {
          created_at?: string | null
          draft_text: string
          id?: string
          location_id?: string | null
          review_id: string
          status?: string
          tone?: string | null
          user_id: string
          workflow_id?: string | null
        }
        Update: {
          created_at?: string | null
          draft_text?: string
          id?: string
          location_id?: string | null
          review_id?: string
          status?: string
          tone?: string | null
          user_id?: string
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_drafts_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      review_replies: {
        Row: {
          business_name: string | null
          created_at: string
          id: string
          length: string | null
          location_id: string | null
          reply_text: string
          review_id: string
          sent_at: string | null
          source: string | null
          status: string
          tone: string | null
          user_id: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          id?: string
          length?: string | null
          location_id?: string | null
          reply_text: string
          review_id: string
          sent_at?: string | null
          source?: string | null
          status?: string
          tone?: string | null
          user_id: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          id?: string
          length?: string | null
          location_id?: string | null
          reply_text?: string
          review_id?: string
          sent_at?: string | null
          source?: string | null
          status?: string
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          from_date: string | null
          id: string
          last_generated_at: string | null
          locations: string[]
          name: string
          notes: string | null
          period_preset: string | null
          recipients: string[] | null
          render_mode: string
          schedule_enabled: boolean
          schedule_rrule: string | null
          status: string
          storage_path: string | null
          timezone: string
          to_date: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          from_date?: string | null
          id?: string
          last_generated_at?: string | null
          locations: string[]
          name: string
          notes?: string | null
          period_preset?: string | null
          recipients?: string[] | null
          render_mode?: string
          schedule_enabled?: boolean
          schedule_rrule?: string | null
          status?: string
          storage_path?: string | null
          timezone?: string
          to_date?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          from_date?: string | null
          id?: string
          last_generated_at?: string | null
          locations?: string[]
          name?: string
          notes?: string | null
          period_preset?: string | null
          recipients?: string[] | null
          render_mode?: string
          schedule_enabled?: boolean
          schedule_rrule?: string | null
          status?: string
          storage_path?: string | null
          timezone?: string
          to_date?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      generated_reports: {
        Row: {
          created_at: string
          id: string
          location_id: string | null
          payload: Json
          report_type: string
          summary: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location_id?: string | null
          payload?: Json
          report_type: string
          summary?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location_id?: string | null
          payload?: Json
          report_type?: string
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string | null
          first_name: string
          id: string
          is_active: boolean
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      team_settings: {
        Row: {
          created_at: string | null
          enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      review_tags: {
        Row: {
          created_at: string | null
          id: string
          location_id: string | null
          review_id: string
          tag: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          location_id?: string | null
          review_id: string
          tag: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          location_id?: string | null
          review_id?: string
          tag?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      business_memory_effective: {
        Row: {
          business_id: string | null
          content: string | null
          created_at: string | null
          kind: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_memory_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_settings"
            referencedColumns: ["business_id"]
          },
        ]
      }
      inbox_reviews: {
        Row: {
          account_resource_name: string | null
          comment: string | null
          create_time: string | null
          created_at: string | null
          id: string | null
          last_synced_at: string | null
          location_id: string | null
          location_name: string | null
          needs_reply: boolean | null
          provider: string | null
          replied_at: string | null
          reply: Json | null
          reply_text: string | null
          review_id: string | null
          review_name: string | null
          reviewer: Json | null
          star_rating: string | null
          status: string | null
          update_time: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          account_resource_name?: string | null
          comment?: string | null
          create_time?: string | null
          created_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          location_name?: string | null
          needs_reply?: boolean | null
          provider?: string | null
          replied_at?: string | null
          reply?: Json | null
          reply_text?: string | null
          review_id?: string | null
          review_name?: string | null
          reviewer?: Json | null
          star_rating?: string | null
          status?: string | null
          update_time?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          account_resource_name?: string | null
          comment?: string | null
          create_time?: string | null
          created_at?: string | null
          id?: string | null
          last_synced_at?: string | null
          location_id?: string | null
          location_name?: string | null
          needs_reply?: boolean | null
          provider?: string | null
          replied_at?: string | null
          reply?: Json | null
          reply_text?: string | null
          review_id?: string | null
          review_name?: string | null
          reviewer?: Json | null
          star_rating?: string | null
          status?: string | null
          update_time?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      job_queue_claim: {
        Args: { max_jobs: number }
        Returns: Database["public"]["Tables"]["job_queue"]["Row"][]
      }
      ai_tag_candidates: {
        Args: {
          p_force?: boolean
          p_limit?: number
          p_location_id?: string
          p_since_id?: string
          p_since_time?: string
          p_user_id?: string
        }
        Returns: {
          comment: string
          create_time: string
          created_at: string
          id: string
          location_id: string
          location_name: string
          update_time: string
          user_id: string
        }[]
      }
      ai_tag_candidates_count: {
        Args: { p_location_id?: string; p_user_id?: string }
        Returns: number
      }
      kpi_summary:
        | {
            Args: { p_from: string; p_location_id: string; p_to: string }
            Returns: {
              avg_rating: number
              reviews_total: number
              reviews_with_text: number
              sentiment_negative: number
              sentiment_neutral: number
              sentiment_positive: number
              top_tags: Json
            }[]
          }
        | {
            Args: {
              p_from: string
              p_location_id: string
              p_rating_max?: number
              p_rating_min?: number
              p_sentiment?: string
              p_status?: string
              p_tags?: string[]
              p_to: string
            }
            Returns: {
              avg_rating: number
              reviews_total: number
              reviews_with_text: number
              sentiment_negative: number
              sentiment_neutral: number
              sentiment_positive: number
              top_tags: Json
            }[]
          }
    }
    Enums: {
      brand_voice_language_level: "tutoiement" | "vouvoiement"
      brand_voice_tone: "professional" | "friendly" | "warm" | "formal"
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
      brand_voice_language_level: ["tutoiement", "vouvoiement"],
      brand_voice_tone: ["professional", "friendly", "warm", "formal"],
    },
  },
} as const
