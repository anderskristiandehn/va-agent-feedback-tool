export type TriageStatus = 'unreviewed' | 'noted' | 'actionable' | 'dismissed'

export interface SourceLink {
  id: string | null
  title: string | null
  url: string
  score: number | null
}

export interface MessageData {
  event_id: string
  timestamp: string | null
  speaker: string
  locale: string | null
  current_page: string | null
  message_text: string
  feedback_type: string | null
  feedback_comment: string | null
  feedback_category: string | null
  has_feedback: boolean
  feedback_status: TriageStatus
  contact_support: boolean
  sources: SourceLink[]
}

export interface SessionFeedback {
  category: string | null
  details: string | null
  created_at: string
  status: TriageStatus
}

export interface SessionData {
  session_id: string
  thread_number: number
  user_id: string
  app_name: string
  org_id: string | null
  org_name: string | null
  org_url: string | null
  org_country: string | null
  org_plan: string | null
  org_is_trial: boolean | null
  org_is_test: boolean | null
  org_created: string | null
  first_timestamp: string | null
  last_timestamp: string | null
  message_count: number
  speakers: string[]
  thumbs_down_count: number
  thumbs_up_count: number
  escalation_count: number
  has_session_feedback: boolean
  categories: string[]
  messages: MessageData[]
  session_feedback: SessionFeedback | null
}

export interface AnnotationEntry {
  text: string
  status: TriageStatus
  updated_at: string
}

export interface Annotations {
  sessions: Record<string, AnnotationEntry>
  messages: Record<string, AnnotationEntry>
}

export interface FeedbackEntry {
  type: 'message' | 'session'
  feedback_type: string | null
  session_id: string
  event_id: string | null
  timestamp: string | null
  speaker: string | null
  app_name: string | null
  org_id: string | null
  org_name: string | null
  org_is_test: boolean | null
  category: string | null
  details: string | null
  message_preview: string | null
}

export interface OrgMeta {
  org_id: string
  org_name: string
  org_is_test: boolean | null
}

export interface MetaData {
  app_names: string[]
  locales: string[]
  categories: string[]
  org_names: string[]
  orgs: OrgMeta[]
}
