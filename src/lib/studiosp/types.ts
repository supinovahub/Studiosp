export interface StudiospLead {
  id: string;
  contact_id: string;
  primary_conversation_id?: string | null;
  assigned_broker_id?: string | null;
  stage: string;
  attention_state: string;
  qualification_status: string;
  meeting_status: string;
  commercial_status: string;
  source_type: string;
  source_metadata?: Record<string, unknown>;
  lead_summary?: string | null;
  won_gross_value?: number | null;
  last_lead_message_at?: string | null;
  next_action_at?: string | null;
  stage_changed_at: string;
  created_at: string;
  updated_at: string;
  contact?: {
    id: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  broker?: {
    id: string;
    display_name: string;
    whatsapp_e164?: string | null;
  } | null;
}

export interface StudiospAttention {
  id: string;
  opportunity_id?: string | null;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  status: string;
  title: string;
  context?: Record<string, unknown>;
  due_at?: string | null;
  created_at: string;
  lead?: StudiospLead | null;
}

export interface StudiospAppointment {
  id: string;
  opportunity_id: string;
  broker_profile_id?: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  channel: string;
  meeting_url?: string | null;
  lead?: StudiospLead | null;
  broker?: StudiospLead['broker'];
}

export interface StudiospData {
  view: string;
  role: string;
  profileId?: string | null;
  brokerProfileId?: string | null;
  leads?: StudiospLead[];
  lead?: StudiospLead | null;
  attention?: StudiospAttention[];
  appointments?: StudiospAppointment[];
  events?: Record<string, unknown>[];
  questions?: Record<string, unknown>[];
  answers?: Record<string, unknown>[];
  matches?: Record<string, unknown>[];
  developments?: Record<string, unknown>[];
  developers?: Record<string, unknown>[];
  neighborhoods?: Record<string, unknown>[];
  offers?: Record<string, unknown>[];
  media?: Record<string, unknown>[];
  mediaVersions?: Record<string, unknown>[];
  brokers?: Record<string, unknown>[];
  profiles?: Record<string, unknown>[];
  windows?: Record<string, unknown>[];
  assignmentOffers?: Record<string, unknown>[];
  followupPolicies?: Record<string, unknown>[];
  followups?: Record<string, unknown>[];
  aiConfig?: Record<string, unknown> | null;
  aiRuns?: Record<string, unknown>[];
  schedulingPolicy?: Record<string, unknown> | null;
  reasons?: Record<string, unknown>[];
  audit?: Record<string, unknown>[];
  report?: {
    metrics: {
      leads_received: number;
      active_opportunities: number;
      meetings_completed: number;
      confirmed_revenue: number;
      won_count: number;
    };
    stages: { key: string; count: number }[];
    sources: { key: string; count: number }[];
    leads: StudiospLead[];
  };
  error?: string;
}
