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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      antiseptic_events: {
        Row: {
          device_id: string | null
          duration_s: number
          id: string
          nurse_id: string | null
          patient_id: string | null
          source: string
          started_at: string
        }
        Insert: {
          device_id?: string | null
          duration_s?: number
          id?: string
          nurse_id?: string | null
          patient_id?: string | null
          source?: string
          started_at?: string
        }
        Update: {
          device_id?: string | null
          duration_s?: number
          id?: string
          nurse_id?: string | null
          patient_id?: string | null
          source?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "antiseptic_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      break_events: {
        Row: {
          ended_at: string | null
          id: string
          nurse_id: string
          session_id: string
          started_at: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          nurse_id: string
          session_id: string
          started_at?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          nurse_id?: string
          session_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "work_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      checkups: {
        Row: {
          created_at: string
          id: string
          note: string | null
          nurse_id: string | null
          nurse_notes: string | null
          patient_id: string
          prescriptions: string | null
          vitals: Json
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          nurse_id?: string | null
          nurse_notes?: string | null
          patient_id: string
          prescriptions?: string | null
          vitals?: Json
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          nurse_id?: string | null
          nurse_notes?: string | null
          patient_id?: string
          prescriptions?: string | null
          vitals?: Json
        }
        Relationships: [
          {
            foreignKeyName: "checkups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          alerts_armed: boolean
          antiseptic_duration_s: number
          antiseptic_start_requested: boolean
          assigned_patient_id: string | null
          bp_measure_requested: boolean
          created_at: string
          created_by: string | null
          device_id: string
          heater_off_c: number
          heater_on_c: number
          label: string | null
          last_seen_at: string | null
          pairing_token: string
        }
        Insert: {
          alerts_armed?: boolean
          antiseptic_duration_s?: number
          antiseptic_start_requested?: boolean
          assigned_patient_id?: string | null
          bp_measure_requested?: boolean
          created_at?: string
          created_by?: string | null
          device_id: string
          heater_off_c?: number
          heater_on_c?: number
          label?: string | null
          last_seen_at?: string | null
          pairing_token: string
        }
        Update: {
          alerts_armed?: boolean
          antiseptic_duration_s?: number
          antiseptic_start_requested?: boolean
          assigned_patient_id?: string | null
          bp_measure_requested?: boolean
          created_at?: string
          created_by?: string | null
          device_id?: string
          heater_off_c?: number
          heater_on_c?: number
          label?: string | null
          last_seen_at?: string | null
          pairing_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_assigned_patient_id_fkey"
            columns: ["assigned_patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      liquid_events: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          device_id: string | null
          empty_at: string
          id: string
          patient_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          device_id?: string | null
          empty_at?: string
          id?: string
          patient_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          device_id?: string | null
          empty_at?: string
          id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquid_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_logs: {
        Row: {
          id: string
          nurse_id: string | null
          patient_id: string
          taken_at: string
        }
        Insert: {
          id?: string
          nurse_id?: string | null
          patient_id: string
          taken_at?: string
        }
        Update: {
          id?: string
          nurse_id?: string | null
          patient_id?: string
          taken_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          age: number
          assigned_nurse_id: string | null
          auto_mode: boolean
          condition: string
          created_at: string
          created_by: string | null
          current_vitals: Json
          device_id: string | null
          gender: string
          id: string
          name: string
          nurse_notes: string
          prescriptions: string
          updated_at: string
        }
        Insert: {
          age?: number
          assigned_nurse_id?: string | null
          auto_mode?: boolean
          condition?: string
          created_at?: string
          created_by?: string | null
          current_vitals?: Json
          device_id?: string | null
          gender?: string
          id?: string
          name: string
          nurse_notes?: string
          prescriptions?: string
          updated_at?: string
        }
        Update: {
          age?: number
          assigned_nurse_id?: string | null
          auto_mode?: boolean
          condition?: string
          created_at?: string
          created_by?: string | null
          current_vitals?: Json
          device_id?: string | null
          gender?: string
          id?: string
          name?: string
          nurse_notes?: string
          prescriptions?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string | null
          full_name: string
          gender: string | null
          id: string
          login_username: string | null
          phone: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: string | null
          id: string
          login_username?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          login_username?: string | null
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vitals: {
        Row: {
          air_temp: number | null
          bpm: number | null
          device_id: string | null
          diastolic: number | null
          humidity: number | null
          id: number
          patient_id: string | null
          recorded_at: string
          spo2: number | null
          systolic: number | null
        }
        Insert: {
          air_temp?: number | null
          bpm?: number | null
          device_id?: string | null
          diastolic?: number | null
          humidity?: number | null
          id?: number
          patient_id?: string | null
          recorded_at?: string
          spo2?: number | null
          systolic?: number | null
        }
        Update: {
          air_temp?: number | null
          bpm?: number | null
          device_id?: string | null
          diastolic?: number | null
          humidity?: number | null
          id?: number
          patient_id?: string | null
          recorded_at?: string
          spo2?: number | null
          systolic?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      work_sessions: {
        Row: {
          id: string
          login_at: string
          logout_at: string | null
          nurse_id: string
          total_break_seconds: number
        }
        Insert: {
          id?: string
          login_at?: string
          logout_at?: string | null
          nurse_id: string
          total_break_seconds?: number
        }
        Update: {
          id?: string
          login_at?: string
          logout_at?: string | null
          nurse_id?: string
          total_break_seconds?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "nurse"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "nurse"],
    },
  },
} as const
