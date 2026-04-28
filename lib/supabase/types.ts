export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          name: string | null
          date_of_birth: string | null
          connected_devices: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          name?: string | null
          date_of_birth?: string | null
          connected_devices?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          name?: string | null
          date_of_birth?: string | null
          connected_devices?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      health_metrics: {
        Row: {
          id: string
          user_id: string
          source: string
          metric_type: string
          value: number
          unit: string
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          source: string
          metric_type: string
          value: number
          unit: string
          recorded_at: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          source?: string
          metric_type?: string
          value?: number
          unit?: string
          recorded_at?: string
          created_at?: string
        }
      }
      baselines: {
        Row: {
          id: string
          user_id: string
          metric_type: string
          baseline_value: number
          baseline_range_low: number
          baseline_range_high: number
          computed_at: string
          window_days: number
        }
        Insert: {
          id?: string
          user_id: string
          metric_type: string
          baseline_value: number
          baseline_range_low: number
          baseline_range_high: number
          computed_at?: string
          window_days?: number
        }
        Update: {
          id?: string
          user_id?: string
          metric_type?: string
          baseline_value?: number
          baseline_range_low?: number
          baseline_range_high?: number
          computed_at?: string
          window_days?: number
        }
      }
      signals: {
        Row: {
          id: string
          user_id: string
          signal_type: string
          severity: 'info' | 'watch' | 'alert'
          title: string
          body: string
          supporting_metrics: string[]
          generated_at: string
          dismissed_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          signal_type: string
          severity: 'info' | 'watch' | 'alert'
          title: string
          body: string
          supporting_metrics?: string[]
          generated_at?: string
          dismissed_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          signal_type?: string
          severity?: 'info' | 'watch' | 'alert'
          title?: string
          body?: string
          supporting_metrics?: string[]
          generated_at?: string
          dismissed_at?: string | null
        }
      }
      context_briefs: {
        Row: {
          id: string
          user_id: string
          appointment_date: string
          provider_name: string
          generated_content: Json | null
          pdf_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          appointment_date: string
          provider_name: string
          generated_content?: Json | null
          pdf_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          appointment_date?: string
          provider_name?: string
          generated_content?: Json | null
          pdf_url?: string | null
          created_at?: string
        }
      }
      appointments: {
        Row: {
          id: string
          user_id: string
          provider_name: string
          specialty: string | null
          appointment_at: string
          brief_generated: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          provider_name: string
          specialty?: string | null
          appointment_at: string
          brief_generated?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          provider_name?: string
          specialty?: string | null
          appointment_at?: string
          brief_generated?: boolean
          created_at?: string
        }
      }
      chat_messages: {
        Row: {
          id: string
          user_id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          session_id: string
          role: 'user' | 'assistant'
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          session_id?: string
          role?: 'user' | 'assistant'
          content?: string
          created_at?: string
        }
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
  }
}

// Convenience types
export type User = Database['public']['Tables']['users']['Row']
export type UserInsert = Database['public']['Tables']['users']['Insert']
export type UserUpdate = Database['public']['Tables']['users']['Update']

export type HealthMetric = Database['public']['Tables']['health_metrics']['Row']
export type HealthMetricInsert = Database['public']['Tables']['health_metrics']['Insert']

export type Baseline = Database['public']['Tables']['baselines']['Row']
export type BaselineInsert = Database['public']['Tables']['baselines']['Insert']

export type Signal = Database['public']['Tables']['signals']['Row']
export type SignalInsert = Database['public']['Tables']['signals']['Insert']

export type ContextBrief = Database['public']['Tables']['context_briefs']['Row']
export type ContextBriefInsert = Database['public']['Tables']['context_briefs']['Insert']

export type Appointment = Database['public']['Tables']['appointments']['Row']
export type AppointmentInsert = Database['public']['Tables']['appointments']['Insert']

export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert']

// Extended types for UI
export type MetricType =
  | 'sleep_score'
  | 'hrv'
  | 'resting_hr'
  | 'spo2'
  | 'recovery_score'
  | 'strain'
  | 'steps'
  | 'active_calories'

export type DeviceSource = 'oura' | 'apple' | 'whoop' | 'garmin'

export interface MetricWithBaseline extends HealthMetric {
  baseline?: Baseline
  deviationSDs?: number
}

export interface BriefContent {
  summary: string
  keyMetrics: {
    name: string
    value: string
    trend: string
    note: string
  }[]
  concerns: string[]
  positives: string[]
  questionsForProvider: string[]
  rawDataSummary: string
}
