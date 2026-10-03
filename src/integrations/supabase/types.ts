export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      game_participants: {
        Row: { bot_display_name: string | null; bot_id: string | null; bot_personality_id: string | null; final_placement: number | null; final_score: number | null; game_id: string; owner_type: string; player_id: string | null; seat_index: number; status: string }
        Insert: { bot_display_name?: string | null; bot_id?: string | null; bot_personality_id?: string | null; final_placement?: number | null; final_score?: number | null; game_id: string; owner_type: string; player_id?: string | null; seat_index: number; status?: string }
        Update: { bot_display_name?: string | null; bot_id?: string | null; bot_personality_id?: string | null; final_placement?: number | null; final_score?: number | null; game_id?: string; owner_type?: string; player_id?: string | null; seat_index?: number; status?: string }
        Relationships: [
          { foreignKeyName: "game_participants_game_id_fkey"; columns: ["game_id"]; isOneToOne: false; referencedRelation: "games"; referencedColumns: ["id"] },
          { foreignKeyName: "game_participants_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
        ]
      }
      games: {
        Row: { completed_at: string | null; created_at: string; id: string; lifecycle: string; room_id: string; rules_version: string; ruleset_id: string; state_schema_version: number; state_version: number }
        Insert: { completed_at?: string | null; created_at?: string; id?: string; lifecycle?: string; room_id: string; rules_version: string; ruleset_id: string; state_schema_version?: number; state_version?: number }
        Update: { completed_at?: string | null; created_at?: string; id?: string; lifecycle?: string; room_id?: string; rules_version?: string; ruleset_id?: string; state_schema_version?: number; state_version?: number }
        Relationships: [{ foreignKeyName: "games_room_id_fkey"; columns: ["room_id"]; isOneToOne: true; referencedRelation: "rooms"; referencedColumns: ["id"] }]
      }
      players: {
        Row: { created_at: string; display_name: string; id: string; is_active: boolean; is_host: boolean; normalized_name: string | null; updated_at: string }
        Insert: { created_at?: string; display_name: string; id?: string; is_active?: boolean; is_host?: boolean; normalized_name?: string | null; updated_at?: string }
        Update: { created_at?: string; display_name?: string; id?: string; is_active?: boolean; is_host?: boolean; normalized_name?: string | null; updated_at?: string }
        Relationships: []
      }
      room_seats: {
        Row: { bot_display_name: string | null; bot_id: string | null; bot_personality_id: string | null; connected: boolean; occupant_type: string; player_id: string | null; room_id: string; seat_index: number }
        Insert: { bot_display_name?: string | null; bot_id?: string | null; bot_personality_id?: string | null; connected?: boolean; occupant_type?: string; player_id?: string | null; room_id: string; seat_index: number }
        Update: { bot_display_name?: string | null; bot_id?: string | null; bot_personality_id?: string | null; connected?: boolean; occupant_type?: string; player_id?: string | null; room_id?: string; seat_index?: number }
        Relationships: [
          { foreignKeyName: "room_seats_player_id_fkey"; columns: ["player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
          { foreignKeyName: "room_seats_room_id_fkey"; columns: ["room_id"]; isOneToOne: false; referencedRelation: "rooms"; referencedColumns: ["id"] },
        ]
      }
      rooms: {
        Row: { allow_profanity: boolean; bots_talk: boolean; code: string; created_at: string; current_game_id: string | null; host_player_id: string; id: string; room_version: number; rules_version: string; ruleset_id: string; started_at: string | null; status: string; updated_at: string }
        Insert: { allow_profanity?: boolean; bots_talk?: boolean; code: string; created_at?: string; current_game_id?: string | null; host_player_id: string; id?: string; room_version?: number; rules_version?: string; ruleset_id: string; started_at?: string | null; status?: string; updated_at?: string }
        Update: { allow_profanity?: boolean; bots_talk?: boolean; code?: string; created_at?: string; current_game_id?: string | null; host_player_id?: string; id?: string; room_version?: number; rules_version?: string; ruleset_id?: string; started_at?: string | null; status?: string; updated_at?: string }
        Relationships: [
          { foreignKeyName: "rooms_current_game_id_fkey"; columns: ["current_game_id"]; isOneToOne: false; referencedRelation: "games"; referencedColumns: ["id"] },
          { foreignKeyName: "rooms_host_player_id_fkey"; columns: ["host_player_id"]; isOneToOne: false; referencedRelation: "players"; referencedColumns: ["id"] },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      authenticate_player_pin_internal: { Args: { p_current_session_token?: string; p_pin: string; p_player_id: string; p_source: string }; Returns: { out_display_name: string; out_is_host: boolean; out_player_id: string; result_code: string; retry_after_seconds: number; reuse_session: boolean; session_token: string }[] }
      create_room_internal: { Args: { p_action_id: string; p_allow_profanity: boolean; p_bots_talk: boolean; p_ruleset_id: string; p_session_token: string }; Returns: Json }
      get_room_for_session_internal: { Args: { p_code: string; p_session_token: string }; Returns: Json }
      join_room_internal: { Args: { p_action_id: string; p_code: string; p_session_token: string }; Returns: Json }
      list_active_players: { Args: never; Returns: { display_name: string; id: string; is_host: boolean }[] }
      revoke_player_session_internal: { Args: { p_session_token: string }; Returns: boolean }
      set_player_pin: { Args: { p_pin: string; p_player_id: string }; Returns: undefined }
      start_room_internal: { Args: { p_action_id: string; p_code: string; p_session_token: string }; Returns: Json }
      validate_player_session_internal: { Args: { p_session_token: string }; Returns: { display_name: string; expires_at: string; id: string; is_host: boolean }[] }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"]) : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] & DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends { Row: infer R } ? R : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends { Row: infer R } ? R : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Insert: infer I } ? I : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I } ? I : never : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends { Update: infer U } ? U : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U } ? U : never : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"] : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions] : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals } ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"] : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions] : never

export const Constants = { public: { Enums: {} } } as const
