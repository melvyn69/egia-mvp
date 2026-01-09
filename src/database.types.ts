export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      business_memory: {
        Row: {
          business_id: string
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          kind: string | null
        }
        Insert: {
          business_id: string
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          kind?: string | null
        }
        Update: {
          business_id?: string
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          kind?: string | null
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
          business_id: string
          business_name: string
          default_length: string | null
          default_tone: string | null
          do_not_say: string | null
          preferred_phrases: string | null
          signature: string | null
          updated_at: string | null
        }
        Insert: {
          business_id: string
          business_name: string
          default_length?: string | null
          default_tone?: string | null
          do_not_say?: string | null
          preferred_phrases?: string | null
          signature?: string | null
          updated_at?: string | null
        }
        Update: {
          business_id?: string
          business_name?: string
          default_length?: string | null
          default_tone?: string | null
          do_not_say?: string | null
          preferred_phrases?: string | null
          signature?: string | null
          updated_at?: string | null
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
          provider: string
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          scope?: string | null
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
      review_replies: {
        Row: {
          business_name: string | null
          created_at: string | null
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
          created_at?: string | null
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
          created_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

