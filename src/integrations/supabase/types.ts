export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      players: {
        Row: { created_at: string; display_name: string; id: string; is_active: boolean; is_host: boolean; normalized_name: string | null; pin_hash: string | null; updated_at: string };
        Insert: { created_at?: string; display_name: string; id?: string; is_active?: boolean; is_host?: boolean; normalized_name?: string | null; pin_hash?: string | null; updated_at?: string };
        Update: { created_at?: string; display_name?: string; id?: string; is_active?: boolean; is_host?: boolean; normalized_name?: string | null; pin_hash?: string | null; updated_at?: string };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      list_active_players: { Args: never; Returns: { display_name: string; id: string; is_host: boolean }[] };
      set_player_pin: { Args: { p_pin: string; p_player_id: string }; Returns: undefined };
      verify_player_pin: { Args: { p_pin: string; p_player_id: string }; Returns: { display_name: string; id: string; is_host: boolean }[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
export type CompositeTypes<T extends keyof Database['public']['CompositeTypes']> = Database['public']['CompositeTypes'][T];

export const Constants = { public: { Enums: {} } } as const;
