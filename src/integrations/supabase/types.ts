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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      clips: {
        Row: {
          audio_path: string
          city: string | null
          captions: string | null
          content_rating: string
          created_at: string | null
          duration_seconds: number
          id: string
          listens_count: number
          mood_emoji: string
          moderation: Json | null
          profile_id: string | null
          reactions: Json
          status: string
          summary: string | null
          tags: string[] | null
          title: string | null
          topic_id: string | null
          updated_at: string | null
          waveform: Json | null
        }
        Insert: {
          audio_path: string
          city?: string | null
          captions?: string | null
          content_rating?: string
          created_at?: string | null
          duration_seconds: number
          id?: string
          listens_count?: number
          mood_emoji: string
          moderation?: Json | null
          profile_id?: string | null
          reactions?: Json
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string | null
          topic_id?: string | null
          updated_at?: string | null
          waveform?: Json | null
        }
        Update: {
          audio_path?: string
          city?: string | null
          captions?: string | null
          content_rating?: string
          created_at?: string | null
          duration_seconds?: number
          id?: string
          listens_count?: number
          mood_emoji?: string
          moderation?: Json | null
          profile_id?: string | null
          reactions?: Json
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string | null
          topic_id?: string | null
          updated_at?: string | null
          waveform?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "clips_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      clip_reactions: {
        Row: {
          clip_id: string | null
          created_at: string | null
          emoji: string
          id: string
          profile_id: string | null
        }
        Insert: {
          clip_id?: string | null
          created_at?: string | null
          emoji: string
          id?: string
          profile_id?: string | null
        }
        Update: {
          clip_id?: string | null
          created_at?: string | null
          emoji?: string
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clip_reactions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clip_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_reactions: {
        Row: {
          id: string
          clip_id: string | null
          profile_id: string | null
          audio_path: string
          duration_seconds: number
          created_at: string | null
        }
        Insert: {
          id?: string
          clip_id?: string | null
          profile_id?: string | null
          audio_path: string
          duration_seconds: number
          created_at?: string | null
        }
        Update: {
          id?: string
          clip_id?: string | null
          profile_id?: string | null
          audio_path?: string
          duration_seconds?: number
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_reactions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          id: string
          clip_id: string
          profile_id: string | null
          parent_comment_id: string | null
          content: string
          created_at: string | null
          updated_at: string | null
          deleted_at: string | null
        }
        Insert: {
          id?: string
          clip_id: string
          profile_id?: string | null
          parent_comment_id?: string | null
          content: string
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
        Update: {
          id?: string
          clip_id?: string
          profile_id?: string | null
          parent_comment_id?: string | null
          content?: string
          created_at?: string | null
          updated_at?: string | null
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string | null
          device_id: string
          id: string
          profile_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          device_id: string
          id?: string
          profile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          device_id?: string
          id?: string
          profile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_flags: {
        Row: {
          clip_id: string | null
          created_at: string | null
          id: number
          reasons: string[]
          risk: number
          source: string
          status: string
        }
        Insert: {
          clip_id?: string | null
          created_at?: string | null
          id?: number
          reasons?: string[]
          risk?: number
          source?: string
          status?: string
        }
        Update: {
          clip_id?: string | null
          created_at?: string | null
          id?: number
          reasons?: string[]
          risk?: number
          source?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_flags_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      listens: {
        Row: {
          clip_id: string | null
          id: number
          listened_at: string | null
          profile_id: string | null
          seconds: number | null
        }
        Insert: {
          clip_id?: string | null
          id?: number
          listened_at?: string | null
          profile_id?: string | null
          seconds?: number | null
        }
        Update: {
          clip_id?: string | null
          id?: number
          listened_at?: string | null
          profile_id?: string | null
          seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "listens_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      magic_login_links: {
        Row: {
          created_at: string
          created_device_id: string | null
          email: string | null
          expires_at: string
          id: string
          profile_id: string
          redeemed_at: string | null
          redeemed_device_id: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          created_device_id?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          profile_id: string
          redeemed_at?: string | null
          redeemed_device_id?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          created_device_id?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          profile_id?: string
          redeemed_at?: string | null
          redeemed_device_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "magic_login_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          autoplay_next_clip: boolean
          city: string | null
          consent_city: boolean
          created_at: string | null
          default_captions: boolean
          device_id: string
          emoji_avatar: string
          filter_mature_content: boolean
          handle: string
          handle_last_changed_at: string | null
          id: string
          joined_at: string | null
          notify_new_topics: boolean
          reputation: number | null
          tap_to_record: boolean
          updated_at: string | null
        }
        Insert: {
          autoplay_next_clip?: boolean
          city?: string | null
          consent_city?: boolean
          created_at?: string | null
          default_captions?: boolean
          device_id: string
          emoji_avatar?: string
          filter_mature_content?: boolean
          handle: string
          handle_last_changed_at?: string | null
          id?: string
          joined_at?: string | null
          notify_new_topics?: boolean
          reputation?: number | null
          tap_to_record?: boolean
          updated_at?: string | null
        }
        Update: {
          autoplay_next_clip?: boolean
          city?: string | null
          consent_city?: boolean
          created_at?: string | null
          default_captions?: boolean
          device_id?: string
          emoji_avatar?: string
          filter_mature_content?: boolean
          handle?: string
          handle_last_changed_at?: string | null
          id?: string
          joined_at?: string | null
          notify_new_topics?: boolean
          reputation?: number | null
          tap_to_record?: boolean
          updated_at?: string | null
        }
        Relationships: []
      }
      admins: {
        Row: {
          created_at: string | null
          profile_id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          profile_id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          profile_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          clip_id: string | null
          created_at: string | null
          details: string | null
          id: number
          reason: string
          reporter_profile_id: string | null
          status: string
        }
        Insert: {
          clip_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: number
          reason: string
          reporter_profile_id?: string | null
          status?: string
        }
        Update: {
          clip_id?: string | null
          created_at?: string | null
          details?: string | null
          id?: number
          reason?: string
          reporter_profile_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_profile_id_fkey"
            columns: ["reporter_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      topics: {
        Row: {
          created_at: string | null
          date: string
          description: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      topic_subscriptions: {
        Row: {
          created_at: string | null
          id: string
          profile_id: string | null
          topic_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          topic_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          profile_id?: string | null
          topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topic_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topic_subscriptions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      live_rooms: {
        Row: {
          id: string
          title: string
          description: string | null
          host_profile_id: string | null
          community_id: string | null
          status: string
          is_public: boolean
          max_speakers: number
          max_listeners: number
          scheduled_start_time: string | null
          started_at: string | null
          ended_at: string | null
          participant_count: number
          speaker_count: number
          listener_count: number
          recording_enabled: boolean
          transcription_enabled: boolean
          webrtc_room_id: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          host_profile_id?: string | null
          community_id?: string | null
          status?: string
          is_public?: boolean
          max_speakers?: number
          max_listeners?: number
          scheduled_start_time?: string | null
          started_at?: string | null
          ended_at?: string | null
          participant_count?: number
          speaker_count?: number
          listener_count?: number
          recording_enabled?: boolean
          transcription_enabled?: boolean
          webrtc_room_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          host_profile_id?: string | null
          community_id?: string | null
          status?: string
          is_public?: boolean
          max_speakers?: number
          max_listeners?: number
          scheduled_start_time?: string | null
          started_at?: string | null
          ended_at?: string | null
          participant_count?: number
          speaker_count?: number
          listener_count?: number
          recording_enabled?: boolean
          transcription_enabled?: boolean
          webrtc_room_id?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_rooms_host_profile_id_fkey"
            columns: ["host_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          id: string
          room_id: string
          profile_id: string
          role: string
          is_muted: boolean
          is_speaking: boolean
          joined_at: string | null
          left_at: string | null
          webrtc_connection_id: string | null
        }
        Insert: {
          id?: string
          room_id: string
          profile_id: string
          role?: string
          is_muted?: boolean
          is_speaking?: boolean
          joined_at?: string | null
          left_at?: string | null
          webrtc_connection_id?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          profile_id?: string
          role?: string
          is_muted?: boolean
          is_speaking?: boolean
          joined_at?: string | null
          left_at?: string | null
          webrtc_connection_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_recordings: {
        Row: {
          id: string
          room_id: string
          audio_path: string
          duration_seconds: number | null
          file_size_bytes: number | null
          started_at: string | null
          ended_at: string | null
          status: string
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          audio_path: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          started_at?: string | null
          ended_at?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          audio_path?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          started_at?: string | null
          ended_at?: string | null
          status?: string
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_recordings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_transcripts: {
        Row: {
          id: string
          room_id: string
          profile_id: string | null
          text: string
          timestamp_seconds: number
          confidence: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          room_id: string
          profile_id?: string | null
          text: string
          timestamp_seconds: number
          confidence?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          room_id?: string
          profile_id?: string | null
          text?: string
          timestamp_seconds?: number
          confidence?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_transcripts_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "live_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_transcripts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_pseudonym: {
        Args: {
          new_handle: string
        }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      create_magic_login_link: {
        Args: {
          target_email?: string | null
        }
        Returns: {
          token: string
          expires_at: string
        }[]
      }
      export_profile_data: {
        Args: Record<string, never>
        Returns: Json
      }
      get_request_profile: {
        Args: Record<string, never>
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      profile_ids_for_request: {
        Args: {
          request_device_id?: string | null
        }
        Returns: {
          id: string
        }[]
      }
      redeem_magic_login_link: {
        Args: {
          link_token: string
        }
        Returns: {
          profile_id: string
          handle: string
        }[]
      }
      purge_account: {
        Args: Record<string, never>
        Returns: undefined
      }
      get_comment_count: {
        Args: {
          clip_uuid: string
        }
        Returns: number
      }
      get_top_level_comment_count: {
        Args: {
          clip_uuid: string
        }
        Returns: number
      }
      get_comment_reply_count: {
        Args: {
          comment_uuid: string
        }
        Returns: number
      }
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
