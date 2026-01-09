export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      brand_voice: {
        Row: {
          id: string;
          user_id: string;
          enabled: boolean;
          tone: Database["public"]["Enums"]["brand_voice_tone"];
          language_level: Database["public"]["Enums"]["brand_voice_language_level"];
          context: string | null;
          use_emojis: boolean;
          forbidden_words: string[];
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          enabled?: boolean;
          tone?: Database["public"]["Enums"]["brand_voice_tone"];
          language_level?: Database["public"]["Enums"]["brand_voice_language_level"];
          context?: string | null;
          use_emojis?: boolean;
          forbidden_words?: string[];
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          enabled?: boolean;
          tone?: Database["public"]["Enums"]["brand_voice_tone"];
          language_level?: Database["public"]["Enums"]["brand_voice_language_level"];
          context?: string | null;
          use_emojis?: boolean;
          forbidden_words?: string[];
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      business_memory: {
        Row: {
          id: string;
          business_id: string;
          kind: string | null;
          content: string;
          is_active: boolean | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          business_id: string;
          kind?: string | null;
          content: string;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          business_id?: string;
          kind?: string | null;
          content?: string;
          is_active?: boolean | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      business_settings: {
        Row: {
          business_id: string;
          business_name: string;
          default_tone: string | null;
          default_length: string | null;
          signature: string | null;
          do_not_say: string | null;
          preferred_phrases: string | null;
          updated_at: string | null;
        };
        Insert: {
          business_id: string;
          business_name: string;
          default_tone?: string | null;
          default_length?: string | null;
          signature?: string | null;
          do_not_say?: string | null;
          preferred_phrases?: string | null;
          updated_at?: string | null;
        };
        Update: {
          business_id?: string;
          business_name?: string;
          default_tone?: string | null;
          default_length?: string | null;
          signature?: string | null;
          do_not_say?: string | null;
          preferred_phrases?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      ai_tags: {
        Row: {
          id: string;
          tag: string | null;
          category: string | null;
        };
        Insert: {
          id?: string;
          tag?: string | null;
          category?: string | null;
        };
        Update: {
          id?: string;
          tag?: string | null;
          category?: string | null;
        };
        Relationships: [];
      };
      cron_state: {
        Row: {
          key: string;
          value: Json | null;
          updated_at: string | null;
        };
        Insert: {
          key: string;
          value?: Json | null;
          updated_at?: string | null;
        };
        Update: {
          key?: string;
          value?: Json | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      automation_workflows: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          trigger: string;
          enabled: boolean;
          location_id: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          trigger?: string;
          enabled?: boolean;
          location_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          trigger?: string;
          enabled?: boolean;
          location_id?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      automation_conditions: {
        Row: {
          id: string;
          workflow_id: string;
          user_id: string;
          field: string;
          operator: string;
          value: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          workflow_id: string;
          user_id: string;
          field: string;
          operator: string;
          value: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          workflow_id?: string;
          user_id?: string;
          field?: string;
          operator?: string;
          value?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      automation_actions: {
        Row: {
          id: string;
          workflow_id: string;
          user_id: string;
          type: string;
          config: Json;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          workflow_id: string;
          user_id: string;
          type: string;
          config?: Json;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          workflow_id?: string;
          user_id?: string;
          type?: string;
          config?: Json;
          created_at?: string | null;
        };
        Relationships: [];
      };
      google_connections: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          access_token: string | null;
          refresh_token: string | null;
          expires_at: string | null;
          scope: string | null;
          token_type: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
          scope?: string | null;
          token_type?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          access_token?: string | null;
          refresh_token?: string | null;
          expires_at?: string | null;
          scope?: string | null;
          token_type?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      google_locations: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          account_resource_name: string;
          location_resource_name: string;
          location_title: string | null;
          store_code: string | null;
          address_json: Json | null;
          phone: string | null;
          website_uri: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider?: string;
          account_resource_name: string;
          location_resource_name: string;
          location_title?: string | null;
          store_code?: string | null;
          address_json?: Json | null;
          phone?: string | null;
          website_uri?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          account_resource_name?: string;
          location_resource_name?: string;
          location_title?: string | null;
          store_code?: string | null;
          address_json?: Json | null;
          phone?: string | null;
          website_uri?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      google_oauth_states: {
        Row: {
          user_id: string;
          state: string;
          expires_at: string | null;
        };
        Insert: {
          user_id: string;
          state: string;
          expires_at?: string | null;
        };
        Update: {
          user_id?: string;
          state?: string;
          expires_at?: string | null;
        };
        Relationships: [];
      };
      google_reviews: {
        Row: {
          id: string;
          user_id: string;
          location_id: string;
          review_id: string;
          review_name: string | null;
          author_name: string | null;
          rating: number | null;
          comment: string | null;
          create_time: string | null;
          update_time: string | null;
          created_at: string | null;
          status: string | null;
          location_name: string | null;
          owner_reply: string | null;
          owner_reply_time: string | null;
          last_seen_at: string | null;
          reply_text: string | null;
          replied_at: string | null;
          last_synced_at: string | null;
          needs_reply: boolean | null;
          raw: Json | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          location_id: string;
          review_id: string;
          review_name?: string | null;
          author_name?: string | null;
          rating?: number | null;
          comment?: string | null;
          create_time?: string | null;
          update_time?: string | null;
          created_at?: string | null;
          status?: string | null;
          location_name?: string | null;
          owner_reply?: string | null;
          owner_reply_time?: string | null;
          last_seen_at?: string | null;
          reply_text?: string | null;
          replied_at?: string | null;
          last_synced_at?: string | null;
          needs_reply?: boolean | null;
          raw?: Json | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          location_id?: string;
          review_id?: string;
          review_name?: string | null;
          author_name?: string | null;
          rating?: number | null;
          comment?: string | null;
          create_time?: string | null;
          update_time?: string | null;
          created_at?: string | null;
          status?: string | null;
          location_name?: string | null;
          owner_reply?: string | null;
          owner_reply_time?: string | null;
          last_seen_at?: string | null;
          reply_text?: string | null;
          replied_at?: string | null;
          last_synced_at?: string | null;
          needs_reply?: boolean | null;
          raw?: Json | null;
        };
        Relationships: [];
      };
      review_ai_insights: {
        Row: {
          review_pk: string;
          user_id: string | null;
          location_resource_name: string | null;
          sentiment: string | null;
          sentiment_score: number | null;
          summary: string | null;
          topics: Json | null;
          model: string | null;
          processed_at: string | null;
          source_update_time: string | null;
          error: string | null;
        };
        Insert: {
          review_pk: string;
          user_id?: string | null;
          location_resource_name?: string | null;
          sentiment?: string | null;
          sentiment_score?: number | null;
          summary?: string | null;
          topics?: Json | null;
          model?: string | null;
          processed_at?: string | null;
          source_update_time?: string | null;
          error?: string | null;
        };
        Update: {
          review_pk?: string;
          user_id?: string | null;
          location_resource_name?: string | null;
          sentiment?: string | null;
          sentiment_score?: number | null;
          summary?: string | null;
          topics?: Json | null;
          model?: string | null;
          processed_at?: string | null;
          source_update_time?: string | null;
          error?: string | null;
        };
        Relationships: [];
      };
      review_ai_tags: {
        Row: {
          review_pk: string;
          tag_id: string;
          polarity: number | null;
          confidence: number | null;
          evidence: string | null;
        };
        Insert: {
          review_pk: string;
          tag_id: string;
          polarity?: number | null;
          confidence?: number | null;
          evidence?: string | null;
        };
        Update: {
          review_pk?: string;
          tag_id?: string;
          polarity?: number | null;
          confidence?: number | null;
          evidence?: string | null;
        };
        Relationships: [];
      };
      review_drafts: {
        Row: {
          id: string;
          user_id: string;
          review_id: string;
          location_id: string | null;
          tone: string | null;
          workflow_id: string | null;
          draft_text: string;
          status: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          review_id: string;
          location_id?: string | null;
          tone?: string | null;
          workflow_id?: string | null;
          draft_text: string;
          status?: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_id?: string;
          location_id?: string | null;
          tone?: string | null;
          workflow_id?: string | null;
          draft_text?: string;
          status?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      review_tags: {
        Row: {
          id: string;
          user_id: string;
          review_id: string;
          location_id: string | null;
          tag: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          review_id: string;
          location_id?: string | null;
          tag: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_id?: string;
          location_id?: string | null;
          tag?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      review_replies: {
        Row: {
          id: string;
          user_id: string;
          review_id: string;
          source: string | null;
          location_id: string | null;
          business_name: string | null;
          tone: string | null;
          length: string | null;
          reply_text: string;
          status: string;
          sent_at: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          review_id: string;
          source?: string | null;
          location_id?: string | null;
          business_name?: string | null;
          tone?: string | null;
          length?: string | null;
          reply_text: string;
          status?: string;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          review_id?: string;
          source?: string | null;
          location_id?: string | null;
          business_name?: string | null;
          tone?: string | null;
          length?: string | null;
          reply_text?: string;
          status?: string;
          sent_at?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      ai_tag_candidates_count: {
        Args: {
          p_user_id: string | null;
          p_location_id: string | null;
        };
        Returns: number;
      };
      ai_tag_candidates: {
        Args: {
          p_user_id: string | null;
          p_location_id: string | null;
          p_since_time: string;
          p_since_id: string;
          p_limit: number;
          p_force: boolean;
        };
        Returns: Array<{
          id: string;
          comment: string | null;
          update_time: string | null;
          create_time: string | null;
          user_id: string | null;
          location_id: string | null;
          location_name: string | null;
        }>;
      };
      kpi_summary: {
        Args: {
          p_location_id: string;
          p_from: string;
          p_to: string;
          p_rating_min?: number | null;
          p_rating_max?: number | null;
          p_sentiment?: string | null;
          p_status?: string | null;
          p_tags?: string[] | null;
        };
        Returns: {
          reviews_total: number | null;
          reviews_with_text: number | null;
          avg_rating: number | null;
          sentiment_positive: number | null;
          sentiment_neutral: number | null;
          sentiment_negative: number | null;
          top_tags: Json | null;
        };
      };
    };
    Enums: {
      brand_voice_tone: "professional" | "friendly" | "warm" | "formal";
      brand_voice_language_level: "tutoiement" | "vouvoiement";
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
