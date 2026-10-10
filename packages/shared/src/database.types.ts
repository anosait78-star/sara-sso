export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_link_requests: {
        Row: {
          created_at: string
          full_name: string
          id: string
          matched_customer_id: string
          national_id: string
          phone: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          matched_customer_id: string
          national_id: string
          phone: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          matched_customer_id?: string
          national_id?: string
          phone?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_link_requests_matched_customer_id_fkey"
            columns: ["matched_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_link_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_events: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          customer_id: string | null
          event_type: string
          id: number
          lead_id: string | null
          occurred_at: string
          payload: Json
          service_request_id: string | null
          summary_ar: string
          summary_en: string | null
          visible_to_client: boolean
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          customer_id?: string | null
          event_type: string
          id?: never
          lead_id?: string | null
          occurred_at?: string
          payload?: Json
          service_request_id?: string | null
          summary_ar: string
          summary_en?: string | null
          visible_to_client?: boolean
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          customer_id?: string | null
          event_type?: string
          id?: never
          lead_id?: string | null
          occurred_at?: string
          payload?: Json
          service_request_id?: string | null
          summary_ar?: string
          summary_en?: string | null
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          created_by: string | null
          customer_id: string | null
          department_id: string | null
          employee_id: string | null
          ends_at: string | null
          id: string
          lead_id: string | null
          location: string | null
          outcome: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          title: string
          type: Database["public"]["Enums"]["appointment_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          department_id?: string | null
          employee_id?: string | null
          ends_at?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          outcome?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          department_id?: string | null
          employee_id?: string | null
          ends_at?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          outcome?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          title?: string
          type?: Database["public"]["Enums"]["appointment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          action_key: string | null
          actor_name: string | null
          actor_type: string
          actor_user_id: string | null
          changed_fields: string[] | null
          id: number
          ip_address: string | null
          new_values: Json | null
          occurred_at: string
          old_values: Json | null
          record_id: string | null
          record_label: string | null
          table_name: string
          user_agent: string | null
        }
        Insert: {
          action: string
          action_key?: string | null
          actor_name?: string | null
          actor_type?: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          id?: never
          ip_address?: string | null
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          record_id?: string | null
          record_label?: string | null
          table_name: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          action_key?: string | null
          actor_name?: string | null
          actor_type?: string
          actor_user_id?: string | null
          changed_fields?: string[] | null
          id?: never
          ip_address?: string | null
          new_values?: Json | null
          occurred_at?: string
          old_values?: Json | null
          record_id?: string | null
          record_label?: string | null
          table_name?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      company_files: {
        Row: {
          activity: string | null
          address: string | null
          approved_name: string | null
          capital: number | null
          chamber_no: string | null
          city: string | null
          commercial_register_no: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          department_id: string | null
          established_on: string | null
          file_no: string | null
          id: string
          legal_form: string | null
          notes: string | null
          owner_employee_id: string | null
          proposed_names: string[]
          social_insurance_no: string | null
          status: Database["public"]["Enums"]["company_file_status"]
          tax_card_no: string | null
          updated_at: string
        }
        Insert: {
          activity?: string | null
          address?: string | null
          approved_name?: string | null
          capital?: number | null
          chamber_no?: string | null
          city?: string | null
          commercial_register_no?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          department_id?: string | null
          established_on?: string | null
          file_no?: string | null
          id?: string
          legal_form?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          proposed_names?: string[]
          social_insurance_no?: string | null
          status?: Database["public"]["Enums"]["company_file_status"]
          tax_card_no?: string | null
          updated_at?: string
        }
        Update: {
          activity?: string | null
          address?: string | null
          approved_name?: string | null
          capital?: number | null
          chamber_no?: string | null
          city?: string | null
          commercial_register_no?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          department_id?: string | null
          established_on?: string | null
          file_no?: string | null
          id?: string
          legal_form?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          proposed_names?: string[]
          social_insurance_no?: string | null
          status?: Database["public"]["Enums"]["company_file_status"]
          tax_card_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_files_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_files_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      company_partners: {
        Row: {
          company_file_id: string
          created_at: string
          customer_id: string | null
          full_name: string
          id: string
          is_manager: boolean
          national_id: string | null
          nationality: string
          phone: string | null
          share_percent: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          company_file_id: string
          created_at?: string
          customer_id?: string | null
          full_name: string
          id?: string
          is_manager?: boolean
          national_id?: string | null
          nationality?: string
          phone?: string | null
          share_percent?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          company_file_id?: string
          created_at?: string
          customer_id?: string | null
          full_name?: string
          id?: string
          is_manager?: boolean
          national_id?: string | null
          nationality?: string
          phone?: string | null
          share_percent?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_partners_company_file_id_fkey"
            columns: ["company_file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_partners_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          alt_phone: string | null
          app_access: Database["public"]["Enums"]["app_access"]
          birth_date: string | null
          city: string | null
          commercial_register_no: string | null
          company_name: string | null
          converted_from_lead_id: string | null
          created_at: string
          created_by: string | null
          customer_no: string | null
          customer_type: Database["public"]["Enums"]["customer_type"]
          deleted_at: string | null
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          owner_employee_id: string | null
          phone: string
          source: string | null
          status: Database["public"]["Enums"]["customer_status"]
          tags: string[]
          tax_no: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          alt_phone?: string | null
          app_access?: Database["public"]["Enums"]["app_access"]
          birth_date?: string | null
          city?: string | null
          commercial_register_no?: string | null
          company_name?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          owner_employee_id?: string | null
          phone: string
          source?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tags?: string[]
          tax_no?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          alt_phone?: string | null
          app_access?: Database["public"]["Enums"]["app_access"]
          birth_date?: string | null
          city?: string | null
          commercial_register_no?: string | null
          company_name?: string | null
          converted_from_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_no?: string | null
          customer_type?: Database["public"]["Enums"]["customer_type"]
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          owner_employee_id?: string | null
          phone?: string
          source?: string | null
          status?: Database["public"]["Enums"]["customer_status"]
          tags?: string[]
          tax_no?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_converted_from_lead_fkey"
            columns: ["converted_from_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      document_files: {
        Row: {
          created_at: string
          document_id: string
          id: string
          mime_type: string
          original_name: string | null
          review_note: string | null
          review_status: string
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          uploader_type: string
          version_no: number
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          mime_type: string
          original_name?: string | null
          review_note?: string | null
          review_status?: string
          size_bytes: number
          storage_path: string
          uploaded_by?: string | null
          uploader_type: string
          version_no: number
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          mime_type?: string
          original_name?: string | null
          review_note?: string | null
          review_status?: string
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          uploader_type?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_files_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          allowed_mime: string[]
          created_at: string
          description_ar: string | null
          has_expiry: boolean
          id: string
          is_active: boolean
          key: string
          max_size_mb: number
          name_ar: string
          name_en: string | null
          reusable: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          allowed_mime?: string[]
          created_at?: string
          description_ar?: string | null
          has_expiry?: boolean
          id?: string
          is_active?: boolean
          key: string
          max_size_mb?: number
          name_ar: string
          name_en?: string | null
          reusable?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allowed_mime?: string[]
          created_at?: string
          description_ar?: string | null
          has_expiry?: boolean
          id?: string
          is_active?: boolean
          key?: string
          max_size_mb?: number
          name_ar?: string
          name_en?: string | null
          reusable?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          current_file_id: string | null
          customer_id: string
          document_type_id: string
          expires_at: string | null
          id: string
          instructions_ar: string | null
          is_required: boolean
          max_files: number
          name_ar: string
          name_en: string | null
          received_physically: boolean
          rejection_note: string | null
          rejection_reason_id: string | null
          request_id: string | null
          request_step_id: string | null
          reused_from_document_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["document_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_file_id?: string | null
          customer_id: string
          document_type_id: string
          expires_at?: string | null
          id?: string
          instructions_ar?: string | null
          is_required?: boolean
          max_files?: number
          name_ar: string
          name_en?: string | null
          received_physically?: boolean
          rejection_note?: string | null
          rejection_reason_id?: string | null
          request_id?: string | null
          request_step_id?: string | null
          reused_from_document_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_file_id?: string | null
          customer_id?: string
          document_type_id?: string
          expires_at?: string | null
          id?: string
          instructions_ar?: string | null
          is_required?: boolean
          max_files?: number
          name_ar?: string
          name_en?: string | null
          received_physically?: boolean
          rejection_note?: string | null
          rejection_reason_id?: string | null
          request_id?: string | null
          request_step_id?: string | null
          reused_from_document_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_current_file_id_fkey"
            columns: ["current_file_id"]
            isOneToOne: false
            referencedRelation: "document_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_rejection_reason_id_fkey"
            columns: ["rejection_reason_id"]
            isOneToOne: false
            referencedRelation: "rejection_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_request_step_id_fkey"
            columns: ["request_step_id"]
            isOneToOne: false
            referencedRelation: "service_request_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_reused_from_document_id_fkey"
            columns: ["reused_from_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          employee_no: string | null
          id: string
          job_title: string | null
          profile_id: string
          role_id: string
          status: Database["public"]["Enums"]["employee_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          employee_no?: string | null
          id?: string
          job_title?: string | null
          profile_id: string
          role_id: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          employee_no?: string | null
          id?: string
          job_title?: string | null
          profile_id?: string
          role_id?: string
          status?: Database["public"]["Enums"]["employee_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      financing_entities: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          kind: string
          name_ar: string
          name_en: string | null
          phone: string | null
          sort_order: number
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name_ar: string
          name_en?: string | null
          phone?: string | null
          sort_order?: number
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name_ar?: string
          name_en?: string | null
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      insurance_companies: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          phone: string | null
          sort_order: number
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          phone?: string | null
          sort_order?: number
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          phone?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      insurance_policies: {
        Row: {
          coverage_amount: number | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          department_id: string | null
          end_date: string | null
          file_no: string | null
          id: string
          insurance_company_id: string | null
          insurance_type_id: string | null
          notes: string | null
          owner_employee_id: string | null
          payment_frequency: string | null
          policy_no: string | null
          premium: number | null
          renewed_from_policy_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["policy_status"]
          subject: string | null
          updated_at: string
        }
        Insert: {
          coverage_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          department_id?: string | null
          end_date?: string | null
          file_no?: string | null
          id?: string
          insurance_company_id?: string | null
          insurance_type_id?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          payment_frequency?: string | null
          policy_no?: string | null
          premium?: number | null
          renewed_from_policy_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          subject?: string | null
          updated_at?: string
        }
        Update: {
          coverage_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          department_id?: string | null
          end_date?: string | null
          file_no?: string | null
          id?: string
          insurance_company_id?: string | null
          insurance_type_id?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          payment_frequency?: string | null
          policy_no?: string | null
          premium?: number | null
          renewed_from_policy_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "insurance_policies_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_insurance_type_id_fkey"
            columns: ["insurance_type_id"]
            isOneToOne: false
            referencedRelation: "insurance_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insurance_policies_renewed_from_policy_id_fkey"
            columns: ["renewed_from_policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_types: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name_ar: string
          name_en: string | null
          reminder_days: number[] | null
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name_ar: string
          name_en?: string | null
          reminder_days?: number[] | null
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name_ar?: string
          name_en?: string | null
          reminder_days?: number[] | null
          sort_order?: number
        }
        Relationships: []
      }
      lead_activities: {
        Row: {
          actor_employee_id: string | null
          created_at: string
          from_stage_id: string | null
          id: string
          lead_id: string
          occurred_at: string
          summary: string | null
          to_stage_id: string | null
          type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Insert: {
          actor_employee_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id: string
          occurred_at?: string
          summary?: string | null
          to_stage_id?: string | null
          type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Update: {
          actor_employee_id?: string | null
          created_at?: string
          from_stage_id?: string | null
          id?: string
          lead_id?: string
          occurred_at?: string
          summary?: string | null
          to_stage_id?: string | null
          type?: Database["public"]["Enums"]["lead_activity_type"]
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_actor_employee_id_fkey"
            columns: ["actor_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stages: {
        Row: {
          color: string
          id: string
          is_active: boolean
          is_pipeline: boolean
          key: string
          name_ar: string
          name_en: string | null
          requires: string
          sort_order: number
          stage_category: Database["public"]["Enums"]["stage_category"]
        }
        Insert: {
          color?: string
          id?: string
          is_active?: boolean
          is_pipeline?: boolean
          key: string
          name_ar: string
          name_en?: string | null
          requires?: string
          sort_order?: number
          stage_category: Database["public"]["Enums"]["stage_category"]
        }
        Update: {
          color?: string
          id?: string
          is_active?: boolean
          is_pipeline?: boolean
          key?: string
          name_ar?: string
          name_en?: string | null
          requires?: string
          sort_order?: number
          stage_category?: Database["public"]["Enums"]["stage_category"]
        }
        Relationships: []
      }
      leads: {
        Row: {
          budget: number | null
          company_name: string | null
          converted_at: string | null
          converted_customer_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department_id: string | null
          email: string | null
          full_name: string
          id: string
          interest_details: string | null
          interest_line: string | null
          lead_no: string | null
          lost_note: string | null
          lost_reason: string | null
          next_follow_up_at: string | null
          owner_employee_id: string | null
          phone: string | null
          postponed_until: string | null
          source: string | null
          stage_id: string
          updated_at: string
        }
        Insert: {
          budget?: number | null
          company_name?: string | null
          converted_at?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          full_name: string
          id?: string
          interest_details?: string | null
          interest_line?: string | null
          lead_no?: string | null
          lost_note?: string | null
          lost_reason?: string | null
          next_follow_up_at?: string | null
          owner_employee_id?: string | null
          phone?: string | null
          postponed_until?: string | null
          source?: string | null
          stage_id: string
          updated_at?: string
        }
        Update: {
          budget?: number | null
          company_name?: string | null
          converted_at?: string | null
          converted_customer_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          interest_details?: string | null
          interest_line?: string | null
          lead_no?: string | null
          lost_note?: string | null
          lost_reason?: string | null
          next_follow_up_at?: string | null
          owner_employee_id?: string | null
          phone?: string | null
          postponed_until?: string | null
          source?: string | null
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_applications: {
        Row: {
          annual_revenue: number | null
          approved_amount: number | null
          collateral: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          deleted_at: string | null
          department_id: string | null
          employees_count: number | null
          file_no: string | null
          financing_type: string | null
          id: string
          notes: string | null
          owner_employee_id: string | null
          purpose: string | null
          requested_amount: number | null
          sector: string | null
          status: Database["public"]["Enums"]["loan_status"]
          tenor_months: number | null
          updated_at: string
          years_in_business: number | null
        }
        Insert: {
          annual_revenue?: number | null
          approved_amount?: number | null
          collateral?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          deleted_at?: string | null
          department_id?: string | null
          employees_count?: number | null
          file_no?: string | null
          financing_type?: string | null
          id?: string
          notes?: string | null
          owner_employee_id?: string | null
          purpose?: string | null
          requested_amount?: number | null
          sector?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          tenor_months?: number | null
          updated_at?: string
          years_in_business?: number | null
        }
        Update: {
          annual_revenue?: number | null
          approved_amount?: number | null
          collateral?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          deleted_at?: string | null
          department_id?: string | null
          employees_count?: number | null
          file_no?: string | null
          financing_type?: string | null
          id?: string
          notes?: string | null
          owner_employee_id?: string | null
          purpose?: string | null
          requested_amount?: number | null
          sector?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          tenor_months?: number | null
          updated_at?: string
          years_in_business?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loan_applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_applications_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_entity_submissions: {
        Row: {
          created_at: string
          decision_note: string | null
          decision_on: string | null
          financing_entity_id: string
          id: string
          loan_application_id: string
          offered_amount: number | null
          offered_rate: number | null
          offered_tenor_months: number | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decision_note?: string | null
          decision_on?: string | null
          financing_entity_id: string
          id?: string
          loan_application_id: string
          offered_amount?: number | null
          offered_rate?: number | null
          offered_tenor_months?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_on?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decision_note?: string | null
          decision_on?: string | null
          financing_entity_id?: string
          id?: string
          loan_application_id?: string
          offered_amount?: number | null
          offered_rate?: number | null
          offered_tenor_months?: number | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_entity_submissions_financing_entity_id_fkey"
            columns: ["financing_entity_id"]
            isOneToOne: false
            referencedRelation: "financing_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_entity_submissions_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      lookups: {
        Row: {
          id: string
          is_active: boolean
          key: string
          name_ar: string
          name_en: string | null
          sort_order: number
          type: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          key: string
          name_ar: string
          name_en?: string | null
          sort_order?: number
          type: string
        }
        Update: {
          id?: string
          is_active?: boolean
          key?: string
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          type?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          author_employee_id: string | null
          body: string
          created_at: string
          customer_id: string | null
          id: string
          lead_id: string | null
          updated_at: string
          visibility: string
        }
        Insert: {
          author_employee_id?: string | null
          body: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_employee_id?: string | null
          body?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lead_id?: string | null
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_author_employee_id_fkey"
            columns: ["author_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          body_tpl: string
          category: string
          description_ar: string | null
          event_key: string
          push_enabled: boolean
          title_tpl: string
          updated_at: string
        }
        Insert: {
          body_tpl?: string
          category: string
          description_ar?: string | null
          event_key: string
          push_enabled?: boolean
          title_tpl?: string
          updated_at?: string
        }
        Update: {
          body_tpl?: string
          category?: string
          description_ar?: string | null
          event_key?: string
          push_enabled?: boolean
          title_tpl?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          channels: string[]
          created_at: string
          delivery_status: Json
          entity_id: string | null
          entity_type: string | null
          event_key: string
          id: string
          link: string | null
          push_attempted_at: string | null
          push_body: string | null
          push_error: string | null
          push_status: string | null
          push_title: string | null
          read_at: string | null
          recipient_user_id: string
          title: string
        }
        Insert: {
          body?: string | null
          channels?: string[]
          created_at?: string
          delivery_status?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_key: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_body?: string | null
          push_error?: string | null
          push_status?: string | null
          push_title?: string | null
          read_at?: string | null
          recipient_user_id: string
          title: string
        }
        Update: {
          body?: string | null
          channels?: string[]
          created_at?: string
          delivery_status?: Json
          entity_id?: string | null
          entity_type?: string | null
          event_key?: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_body?: string | null
          push_error?: string | null
          push_status?: string | null
          push_title?: string | null
          read_at?: string | null
          recipient_user_id?: string
          title?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string
          department_id: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          owner_employee_id: string | null
          paid_at: string
          payment_no: string | null
          recorded_by: string | null
          reference_no: string | null
          service_request_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id: string
          department_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          owner_employee_id?: string | null
          paid_at?: string
          payment_no?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string
          department_id?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          owner_employee_id?: string | null
          paid_at?: string
          payment_no?: string | null
          recorded_by?: string | null
          reference_no?: string | null
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: string
          description_ar: string | null
          id: string
          module: string
          sort_order: number
        }
        Insert: {
          action: string
          description_ar?: string | null
          id?: string
          module: string
          sort_order?: number
        }
        Update: {
          action?: string
          description_ar?: string | null
          id?: string
          module?: string
          sort_order?: number
        }
        Relationships: []
      }
      policy_renewals: {
        Row: {
          created_at: string
          due_date: string
          id: string
          new_policy_id: string | null
          note: string | null
          policy_id: string
          reminded_days: number[]
          status: string
          task_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          id?: string
          new_policy_id?: string | null
          note?: string | null
          policy_id: string
          reminded_days?: number[]
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          id?: string
          new_policy_id?: string | null
          note?: string | null
          policy_id?: string
          reminded_days?: number[]
          status?: string
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policy_renewals_new_policy_id_fkey"
            columns: ["new_policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_renewals_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policy_renewals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          locale: string
          must_change_password: boolean
          phone: string | null
          updated_at: string
          user_type: Database["public"]["Enums"]["user_type"]
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          locale?: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          locale?: string
          must_change_password?: boolean
          phone?: string | null
          updated_at?: string
          user_type?: Database["public"]["Enums"]["user_type"]
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      rejection_reasons: {
        Row: {
          id: string
          is_active: boolean
          sort_order: number
          text_ar: string
          text_en: string | null
        }
        Insert: {
          id?: string
          is_active?: boolean
          sort_order?: number
          text_ar: string
          text_en?: string | null
        }
        Update: {
          id?: string
          is_active?: boolean
          sort_order?: number
          text_ar?: string
          text_en?: string | null
        }
        Relationships: []
      }
      request_field_values: {
        Row: {
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["field_type"]
          filled_by_user_id: string | null
          id: string
          request_id: string
          request_step_id: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type: Database["public"]["Enums"]["field_type"]
          filled_by_user_id?: string | null
          id?: string
          request_id: string
          request_step_id: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["field_type"]
          filled_by_user_id?: string | null
          id?: string
          request_id?: string
          request_step_id?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "request_field_values_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_field_values_request_step_id_fkey"
            columns: ["request_step_id"]
            isOneToOne: false
            referencedRelation: "service_request_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      request_messages: {
        Row: {
          body: string
          created_at: string
          customer_id: string
          id: string
          read_at: string | null
          request_id: string | null
          sender_name: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          customer_id: string
          id?: string
          read_at?: string | null
          request_id?: string | null
          sender_name?: string | null
          sender_type: string
          sender_user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          customer_id?: string
          id?: string
          read_at?: string | null
          request_id?: string | null
          sender_name?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "request_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      required_documents: {
        Row: {
          created_at: string
          document_type_id: string
          id: string
          instructions_ar: string | null
          instructions_en: string | null
          is_required: boolean
          max_files: number
          sort_order: number
          updated_at: string
          workflow_step_id: string
        }
        Insert: {
          created_at?: string
          document_type_id: string
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_required?: boolean
          max_files?: number
          sort_order?: number
          updated_at?: string
          workflow_step_id: string
        }
        Update: {
          created_at?: string
          document_type_id?: string
          id?: string
          instructions_ar?: string | null
          instructions_en?: string | null
          is_required?: boolean
          max_files?: number
          sort_order?: number
          updated_at?: string
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "required_documents_document_type_id_fkey"
            columns: ["document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "required_documents_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      required_fields: {
        Row: {
          created_at: string
          field_key: string
          field_type: Database["public"]["Enums"]["field_type"]
          filled_by: Database["public"]["Enums"]["field_filler"]
          help_text: string | null
          id: string
          is_required: boolean
          label_ar: string
          label_en: string | null
          maps_to: string | null
          options: Json
          sort_order: number
          updated_at: string
          validation: Json
          workflow_step_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          field_type?: Database["public"]["Enums"]["field_type"]
          filled_by?: Database["public"]["Enums"]["field_filler"]
          help_text?: string | null
          id?: string
          is_required?: boolean
          label_ar: string
          label_en?: string | null
          maps_to?: string | null
          options?: Json
          sort_order?: number
          updated_at?: string
          validation?: Json
          workflow_step_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          field_type?: Database["public"]["Enums"]["field_type"]
          filled_by?: Database["public"]["Enums"]["field_filler"]
          help_text?: string | null
          id?: string
          is_required?: boolean
          label_ar?: string
          label_en?: string | null
          maps_to?: string | null
          options?: Json
          sort_order?: number
          updated_at?: string
          validation?: Json
          workflow_step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "required_fields_workflow_step_id_fkey"
            columns: ["workflow_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: string
          role_id: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }
        Insert: {
          permission_id: string
          role_id: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Update: {
          permission_id?: string
          role_id?: string
          scope?: Database["public"]["Enums"]["permission_scope"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean
          key: string
          name_ar: string
          name_en: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          key: string
          name_ar: string
          name_en?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean
          key?: string
          name_ar?: string
          name_en?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          key: string
          name_ar: string
          name_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key: string
          name_ar: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          key?: string
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      service_request_steps: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approver_role_id: string | null
          assigned_department_id: string | null
          assigned_employee_id: string | null
          assignee_department_id: string | null
          assignee_employee_id: string | null
          assignee_role_id: string | null
          assignee_type: Database["public"]["Enums"]["assignee_type"]
          auto_create_task: boolean
          client_action_required: boolean
          client_instructions: string | null
          completed_at: string | null
          completed_by: string | null
          completion_status_label_ar: string | null
          completion_status_label_en: string | null
          created_at: string
          description: string | null
          due_at: string | null
          duration_unit: Database["public"]["Enums"]["duration_unit"]
          duration_value: number
          fields_snapshot: Json
          id: string
          is_adhoc: boolean
          is_client_visible: boolean
          is_required: boolean
          name_ar: string
          name_en: string | null
          note: string | null
          request_id: string
          requires_approval: boolean
          return_reason: string | null
          sets_request_status:
            | Database["public"]["Enums"]["request_status"]
            | null
          skip_reason: string | null
          sort_order: number
          source_step_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["request_step_status"]
          step_key: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approver_role_id?: string | null
          assigned_department_id?: string | null
          assigned_employee_id?: string | null
          assignee_department_id?: string | null
          assignee_employee_id?: string | null
          assignee_role_id?: string | null
          assignee_type?: Database["public"]["Enums"]["assignee_type"]
          auto_create_task?: boolean
          client_action_required?: boolean
          client_instructions?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_status_label_ar?: string | null
          completion_status_label_en?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"]
          duration_value?: number
          fields_snapshot?: Json
          id?: string
          is_adhoc?: boolean
          is_client_visible?: boolean
          is_required?: boolean
          name_ar: string
          name_en?: string | null
          note?: string | null
          request_id: string
          requires_approval?: boolean
          return_reason?: string | null
          sets_request_status?:
            | Database["public"]["Enums"]["request_status"]
            | null
          skip_reason?: string | null
          sort_order: number
          source_step_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_step_status"]
          step_key: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approver_role_id?: string | null
          assigned_department_id?: string | null
          assigned_employee_id?: string | null
          assignee_department_id?: string | null
          assignee_employee_id?: string | null
          assignee_role_id?: string | null
          assignee_type?: Database["public"]["Enums"]["assignee_type"]
          auto_create_task?: boolean
          client_action_required?: boolean
          client_instructions?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_status_label_ar?: string | null
          completion_status_label_en?: string | null
          created_at?: string
          description?: string | null
          due_at?: string | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"]
          duration_value?: number
          fields_snapshot?: Json
          id?: string
          is_adhoc?: boolean
          is_client_visible?: boolean
          is_required?: boolean
          name_ar?: string
          name_en?: string | null
          note?: string | null
          request_id?: string
          requires_approval?: boolean
          return_reason?: string | null
          sets_request_status?:
            | Database["public"]["Enums"]["request_status"]
            | null
          skip_reason?: string | null
          sort_order?: number
          source_step_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["request_step_status"]
          step_key?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_steps_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_approver_role_id_fkey"
            columns: ["approver_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_assigned_department_id_fkey"
            columns: ["assigned_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_assigned_employee_id_fkey"
            columns: ["assigned_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_assignee_department_id_fkey"
            columns: ["assignee_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_assignee_role_id_fkey"
            columns: ["assignee_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_source_step_id_fkey"
            columns: ["source_step_id"]
            isOneToOne: false
            referencedRelation: "workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_steps_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          company_file_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_step_id: string | null
          customer_id: string
          deleted_at: string | null
          department_id: string | null
          due_at: string | null
          expected_completion_at: string | null
          hold_reason: string | null
          id: string
          insurance_policy_id: string | null
          is_overdue: boolean
          loan_application_id: string | null
          notes: string | null
          owner_employee_id: string | null
          paid_amount: number
          priority: Database["public"]["Enums"]["task_priority"]
          request_no: string | null
          service_id: string
          source: string
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          total_amount: number | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          company_file_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          customer_id: string
          deleted_at?: string | null
          department_id?: string | null
          due_at?: string | null
          expected_completion_at?: string | null
          hold_reason?: string | null
          id?: string
          insurance_policy_id?: string | null
          is_overdue?: boolean
          loan_application_id?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          paid_amount?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          request_no?: string | null
          service_id: string
          source?: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          total_amount?: number | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          company_file_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_step_id?: string | null
          customer_id?: string
          deleted_at?: string | null
          department_id?: string | null
          due_at?: string | null
          expected_completion_at?: string | null
          hold_reason?: string | null
          id?: string
          insurance_policy_id?: string | null
          is_overdue?: boolean
          loan_application_id?: string | null
          notes?: string | null
          owner_employee_id?: string | null
          paid_amount?: number
          priority?: Database["public"]["Enums"]["task_priority"]
          request_no?: string | null
          service_id?: string
          source?: string
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          total_amount?: number | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_company_file_id_fkey"
            columns: ["company_file_id"]
            isOneToOne: false
            referencedRelation: "company_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_current_step_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "service_request_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_insurance_policy_id_fkey"
            columns: ["insurance_policy_id"]
            isOneToOne: false
            referencedRelation: "insurance_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_loan_application_id_fkey"
            columns: ["loan_application_id"]
            isOneToOne: false
            referencedRelation: "loan_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_owner_employee_id_fkey"
            columns: ["owner_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      service_workflows: {
        Row: {
          archived_at: string | null
          based_on_workflow_id: string | null
          change_note: string | null
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          published_by: string | null
          service_id: string
          status: Database["public"]["Enums"]["workflow_status"]
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          based_on_workflow_id?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          version: number
        }
        Update: {
          archived_at?: string | null
          based_on_workflow_id?: string | null
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_workflows_based_on_workflow_id_fkey"
            columns: ["based_on_workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_workflows_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          allow_client_request: boolean
          category_id: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          current_workflow_id: string | null
          default_price: number | null
          deleted_at: string | null
          description_ar: string | null
          description_en: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_client_visible: boolean
          module_key: Database["public"]["Enums"]["service_module"]
          name_ar: string
          name_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          allow_client_request?: boolean
          category_id: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_workflow_id?: string | null
          default_price?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_client_visible?: boolean
          module_key?: Database["public"]["Enums"]["service_module"]
          name_ar: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allow_client_request?: boolean
          category_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          current_workflow_id?: string | null
          default_price?: number | null
          deleted_at?: string | null
          description_ar?: string | null
          description_en?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_client_visible?: boolean
          module_key?: Database["public"]["Enums"]["service_module"]
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_current_workflow_fkey"
            columns: ["current_workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          department_id: string | null
          description: string | null
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["task_kind"]
          lead_id: string | null
          outcome: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          request_step_id: string | null
          service_request_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          request_step_id?: string | null
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          department_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["task_kind"]
          lead_id?: string | null
          outcome?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          request_step_id?: string | null
          service_request_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_request_step_id_fkey"
            columns: ["request_step_id"]
            isOneToOne: false
            referencedRelation: "service_request_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          approver_role_id: string | null
          assignee_department_id: string | null
          assignee_employee_id: string | null
          assignee_role_id: string | null
          assignee_type: Database["public"]["Enums"]["assignee_type"]
          auto_create_task: boolean
          client_action_required: boolean
          client_instructions: string | null
          completion_status_label_ar: string | null
          completion_status_label_en: string | null
          conditions: Json | null
          created_at: string
          description: string | null
          duration_unit: Database["public"]["Enums"]["duration_unit"]
          duration_value: number
          id: string
          is_client_visible: boolean
          is_required: boolean
          name_ar: string
          name_en: string | null
          requires_approval: boolean
          sets_request_status:
            | Database["public"]["Enums"]["request_status"]
            | null
          sort_order: number
          step_key: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          approver_role_id?: string | null
          assignee_department_id?: string | null
          assignee_employee_id?: string | null
          assignee_role_id?: string | null
          assignee_type?: Database["public"]["Enums"]["assignee_type"]
          auto_create_task?: boolean
          client_action_required?: boolean
          client_instructions?: string | null
          completion_status_label_ar?: string | null
          completion_status_label_en?: string | null
          conditions?: Json | null
          created_at?: string
          description?: string | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"]
          duration_value?: number
          id?: string
          is_client_visible?: boolean
          is_required?: boolean
          name_ar: string
          name_en?: string | null
          requires_approval?: boolean
          sets_request_status?:
            | Database["public"]["Enums"]["request_status"]
            | null
          sort_order: number
          step_key: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          approver_role_id?: string | null
          assignee_department_id?: string | null
          assignee_employee_id?: string | null
          assignee_role_id?: string | null
          assignee_type?: Database["public"]["Enums"]["assignee_type"]
          auto_create_task?: boolean
          client_action_required?: boolean
          client_instructions?: string | null
          completion_status_label_ar?: string | null
          completion_status_label_en?: string | null
          conditions?: Json | null
          created_at?: string
          description?: string | null
          duration_unit?: Database["public"]["Enums"]["duration_unit"]
          duration_value?: number
          id?: string
          is_client_visible?: boolean
          is_required?: boolean
          name_ar?: string
          name_en?: string | null
          requires_approval?: boolean
          sets_request_status?:
            | Database["public"]["Enums"]["request_status"]
            | null
          sort_order?: number
          step_key?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_approver_role_id_fkey"
            columns: ["approver_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_assignee_department_id_fkey"
            columns: ["assignee_department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_assignee_employee_id_fkey"
            columns: ["assignee_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_assignee_role_id_fkey"
            columns: ["assignee_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "service_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_account_link: {
        Args: { p_link_id: string; p_note?: string }
        Returns: undefined
      }
      approve_request_step: {
        Args: { p_note?: string; p_request_step_id: string }
        Returns: undefined
      }
      cancel_service_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      change_lead_stage: {
        Args: {
          p_follow_up_at?: string
          p_lead_id: string
          p_lost_reason?: string
          p_note?: string
          p_stage_id: string
        }
        Returns: undefined
      }
      check_client_registration: {
        Args: { p_national_id: string; p_phone: string }
        Returns: string
      }
      claim_push_batch: {
        Args: { p_limit?: number }
        Returns: {
          body: string
          entity_id: string
          entity_type: string
          id: string
          link: string
          title: string
          tokens: string[]
        }[]
      }
      clear_must_change_password: { Args: never; Returns: undefined }
      client_create_request: {
        Args: { p_notes?: string; p_service_id: string }
        Returns: string
      }
      client_submit_step: {
        Args: { p_request_step_id: string }
        Returns: undefined
      }
      client_submit_step_data: {
        Args: { p_request_step_id: string; p_values: Json }
        Returns: undefined
      }
      clone_workflow_as_draft: {
        Args: { p_change_note?: string; p_workflow_id: string }
        Returns: string
      }
      complete_request_step: {
        Args: { p_note?: string; p_request_step_id: string }
        Returns: undefined
      }
      convert_lead_to_customer: {
        Args: {
          p_customer_type?: Database["public"]["Enums"]["customer_type"]
          p_lead_id: string
          p_merge_into?: string
          p_national_id?: string
        }
        Returns: string
      }
      create_company_file_from_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      create_loan_from_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      create_policy_from_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      create_service_request: {
        Args: {
          p_customer_id: string
          p_notes?: string
          p_owner_employee_id?: string
          p_priority?: Database["public"]["Enums"]["task_priority"]
          p_service_id: string
        }
        Returns: string
      }
      create_workflow_draft: { Args: { p_service_id: string }; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      dashboard_summary: { Args: never; Returns: Json }
      delete_workflow_step: { Args: { p_step_id: string }; Returns: undefined }
      finish_push_batch: { Args: { p_results: Json }; Returns: undefined }
      get_company_contact: { Args: never; Returns: Json }
      get_my_permissions: {
        Args: never
        Returns: {
          action: string
          module: string
          scope: Database["public"]["Enums"]["permission_scope"]
        }[]
      }
      get_my_staff_context: {
        Args: never
        Returns: {
          department_id: string
          department_name_ar: string
          email: string
          employee_id: string
          employee_no: string
          full_name: string
          locale: string
          must_change_password: boolean
          role_key: string
          role_name_ar: string
          role_name_en: string
        }[]
      }
      global_search: {
        Args: { p_query: string }
        Returns: {
          id: string
          kind: string
          number: string
          subtitle: string
          title: string
        }[]
      }
      insert_adhoc_step: {
        Args: { p_after_step_id: string; p_config: Json; p_request_id: string }
        Returns: string
      }
      insert_workflow_step: {
        Args: {
          p_name_ar: string
          p_name_en?: string
          p_position: number
          p_workflow_id: string
        }
        Returns: string
      }
      link_request_company_file: {
        Args: { p_company_file_id: string; p_request_id: string }
        Returns: undefined
      }
      link_request_loan: {
        Args: { p_loan_id: string; p_request_id: string }
        Returns: undefined
      }
      link_request_policy: {
        Args: { p_policy_id: string; p_request_id: string }
        Returns: undefined
      }
      log_client_access_change: {
        Args: { p_action: string; p_customer_id: string }
        Returns: undefined
      }
      log_lead_activity: {
        Args: {
          p_lead_id: string
          p_next_follow_up_at?: string
          p_summary: string
          p_type: Database["public"]["Enums"]["lead_activity_type"]
        }
        Returns: string
      }
      mark_messages_read: {
        Args: { p_request_id?: string }
        Returns: undefined
      }
      mark_notifications_read: {
        Args: { p_ids?: string[] }
        Returns: undefined
      }
      my_account_status: { Args: never; Returns: Json }
      publish_workflow: {
        Args: { p_change_note?: string; p_workflow_id: string }
        Returns: Json
      }
      reassign_request_step: {
        Args: { p_employee_id: string; p_request_step_id: string }
        Returns: undefined
      }
      receive_document: {
        Args: { p_document_id: string; p_expires_at?: string; p_note?: string }
        Returns: undefined
      }
      refresh_overdue_requests: { Args: never; Returns: number }
      register_client_account: {
        Args: {
          p_full_name: string
          p_national_id: string
          p_phone: string
          p_user_id: string
        }
        Returns: Json
      }
      register_document_upload: {
        Args: {
          p_document_id: string
          p_mime: string
          p_original_name: string
          p_path: string
          p_size: number
        }
        Returns: string
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      reject_account_link: {
        Args: { p_link_id: string; p_reason: string }
        Returns: undefined
      }
      reject_document: {
        Args: { p_document_id: string; p_note?: string; p_reason_id: string }
        Returns: undefined
      }
      renew_insurance_policy: {
        Args: { p_open_request?: boolean; p_policy_id: string }
        Returns: string
      }
      reorder_workflow_steps: {
        Args: { p_step_ids: string[]; p_workflow_id: string }
        Returns: undefined
      }
      report_employees: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      report_finance: { Args: { p_from: string; p_to: string }; Returns: Json }
      report_lines: { Args: never; Returns: Json }
      report_operations: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      report_sales: { Args: { p_from: string; p_to: string }; Returns: Json }
      request_new_document_copy: {
        Args: { p_document_id: string; p_note: string }
        Returns: undefined
      }
      request_step_missing: {
        Args: { p_step_id: string }
        Returns: {
          item_key: string
          kind: string
          name_ar: string
          name_en: string
        }[]
      }
      return_request_step: {
        Args: { p_reason: string; p_request_step_id: string }
        Returns: undefined
      }
      send_request_message: {
        Args: { p_body: string; p_request_id: string }
        Returns: string
      }
      set_request_amount: {
        Args: { p_amount: number; p_request_id: string }
        Returns: undefined
      }
      set_request_hold: {
        Args: { p_hold: boolean; p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      set_role_permissions: {
        Args: { p_grants: Json; p_role_id: string }
        Returns: undefined
      }
      skip_request_step: {
        Args: { p_reason: string; p_request_step_id: string }
        Returns: undefined
      }
      start_document_review: {
        Args: { p_document_id: string }
        Returns: undefined
      }
      submit_step_data: {
        Args: { p_request_step_id: string; p_values: Json }
        Returns: undefined
      }
      update_policy_renewal: {
        Args: { p_note?: string; p_renewal_id: string; p_status: string }
        Returns: undefined
      }
      validate_workflow: {
        Args: { p_workflow_id: string }
        Returns: {
          detail: string
          issue: string
          step_id: string
          step_key: string
          step_name: string
        }[]
      }
      workflow_diff: {
        Args: { p_from: string; p_to: string }
        Returns: {
          change: string
          detail: Json
          item_key: string
          item_name_ar: string
          item_name_en: string
          step_key: string
          step_name_ar: string
          step_name_en: string
        }[]
      }
      workflow_running_requests: {
        Args: { p_workflow_id: string }
        Returns: number
      }
    }
    Enums: {
      app_access: "none" | "active" | "suspended"
      appointment_status: "scheduled" | "done" | "cancelled" | "no_show"
      appointment_type:
        | "meeting"
        | "call"
        | "property_visit"
        | "gov_visit"
        | "other"
      assignee_type: "role" | "department" | "employee" | "request_owner"
      company_file_status: "draft" | "in_progress" | "established" | "closed"
      customer_status:
        | "self_registered"
        | "pending_link"
        | "active"
        | "inactive"
      customer_type: "individual" | "company"
      document_status:
        | "pending"
        | "uploaded"
        | "under_review"
        | "approved"
        | "rejected"
      duration_unit: "hours" | "days" | "business_days"
      employee_status: "invited" | "active" | "suspended"
      field_filler: "client" | "staff"
      field_type:
        | "text"
        | "textarea"
        | "number"
        | "money"
        | "date"
        | "select"
        | "multiselect"
        | "checkbox"
        | "phone"
        | "email"
        | "national_id"
      lead_activity_type:
        | "created"
        | "call"
        | "meeting"
        | "whatsapp"
        | "email"
        | "note"
        | "stage_change"
        | "converted"
      loan_status:
        | "draft"
        | "preparing"
        | "submitted"
        | "approved"
        | "rejected"
        | "disbursed"
        | "cancelled"
      payment_method: "cash" | "bank_transfer" | "card" | "wallet" | "cheque"
      payment_status: "paid" | "refunded" | "cancelled"
      permission_scope: "own" | "department" | "all"
      policy_status:
        | "pending"
        | "active"
        | "expiring"
        | "expired"
        | "renewed"
        | "cancelled"
      request_status:
        | "draft"
        | "submitted"
        | "in_progress"
        | "waiting_client"
        | "on_hold"
        | "completed"
        | "cancelled"
      request_step_status:
        | "pending"
        | "active"
        | "waiting_client"
        | "waiting_approval"
        | "completed"
        | "skipped"
        | "returned"
      service_module:
        | "generic"
        | "real_estate"
        | "insurance"
        | "company_formation"
        | "loans"
      stage_category: "open" | "won" | "lost" | "on_hold"
      submission_status:
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "withdrawn"
      task_kind:
        | "task"
        | "follow_up"
        | "call"
        | "inquiry"
        | "renewal"
        | "step_work"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "done" | "cancelled"
      user_type: "staff" | "client"
      workflow_status: "draft" | "published" | "archived"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_access: ["none", "active", "suspended"],
      appointment_status: ["scheduled", "done", "cancelled", "no_show"],
      appointment_type: [
        "meeting",
        "call",
        "property_visit",
        "gov_visit",
        "other",
      ],
      assignee_type: ["role", "department", "employee", "request_owner"],
      company_file_status: ["draft", "in_progress", "established", "closed"],
      customer_status: [
        "self_registered",
        "pending_link",
        "active",
        "inactive",
      ],
      customer_type: ["individual", "company"],
      document_status: [
        "pending",
        "uploaded",
        "under_review",
        "approved",
        "rejected",
      ],
      duration_unit: ["hours", "days", "business_days"],
      employee_status: ["invited", "active", "suspended"],
      field_filler: ["client", "staff"],
      field_type: [
        "text",
        "textarea",
        "number",
        "money",
        "date",
        "select",
        "multiselect",
        "checkbox",
        "phone",
        "email",
        "national_id",
      ],
      lead_activity_type: [
        "created",
        "call",
        "meeting",
        "whatsapp",
        "email",
        "note",
        "stage_change",
        "converted",
      ],
      loan_status: [
        "draft",
        "preparing",
        "submitted",
        "approved",
        "rejected",
        "disbursed",
        "cancelled",
      ],
      payment_method: ["cash", "bank_transfer", "card", "wallet", "cheque"],
      payment_status: ["paid", "refunded", "cancelled"],
      permission_scope: ["own", "department", "all"],
      policy_status: [
        "pending",
        "active",
        "expiring",
        "expired",
        "renewed",
        "cancelled",
      ],
      request_status: [
        "draft",
        "submitted",
        "in_progress",
        "waiting_client",
        "on_hold",
        "completed",
        "cancelled",
      ],
      request_step_status: [
        "pending",
        "active",
        "waiting_client",
        "waiting_approval",
        "completed",
        "skipped",
        "returned",
      ],
      service_module: [
        "generic",
        "real_estate",
        "insurance",
        "company_formation",
        "loans",
      ],
      stage_category: ["open", "won", "lost", "on_hold"],
      submission_status: [
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "withdrawn",
      ],
      task_kind: [
        "task",
        "follow_up",
        "call",
        "inquiry",
        "renewal",
        "step_work",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["todo", "in_progress", "done", "cancelled"],
      user_type: ["staff", "client"],
      workflow_status: ["draft", "published", "archived"],
    },
  },
} as const

