export type UserRole = "admin" | "employee";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type TaskOrigin = "system" | "notion";
export type ProjectStatus = "active" | "paused" | "archived";
export type SourceKind = "local" | "github";
export type TimeRecordSource = "real" | "manual" | "estimated";
export type ClosingStatus = "draft" | "closed" | "reopened";
export type IntegrationProvider = "notion" | "github" | "telegram" | "ai";
export type IntegrationStatus = "connected" | "disconnected" | "error";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  closing_day: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string | null;
  full_name: string;
  email: string;
  avatar_url: string | null;
  job_title: string | null;
  role: UserRole;
  is_active: boolean;
  ai_preferences: {
    max_tokens_per_request?: number;
    tone?: string;
  };
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  canonical_origin: string | null;
  status: ProjectStatus;
  is_private: boolean;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectSyncEvent {
  id: string;
  organization_id: string;
  project_id: string;
  source_id: string | null;
  user_id: string;
  event_type: string;
  commit_sha: string | null;
  branch: string | null;
  summary: string;
  occurred_at: string;
  created_at: string;
  project?: {
    id: string;
    name: string;
  } | null;
}

export interface Task {
  id: string;
  organization_id: string;
  project_id: string | null;
  assignee_id: string;
  created_by: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string | null;
  origin: TaskOrigin;
  external_id: string | null;
  external_url: string | null;
  sync_hash: string | null;
  is_private: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWithProject extends Task {
  project?: {
    id: string;
    name: string;
  } | null;
  assignee?: {
    id: string;
    full_name: string;
  } | null;
}

export interface TimeRecord {
  id: string;
  organization_id: string;
  user_id: string;
  work_date: string;
  clock_in: string | null;
  lunch_out: string | null;
  lunch_in: string | null;
  clock_out: string | null;
  worked_minutes: number;
  source: TimeRecordSource;
  justification: string | null;
  is_holiday: boolean;
  is_day_off: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntegrationSummary {
  id: string;
  provider: IntegrationProvider;
  status: IntegrationStatus;
  last_sync_at: string | null;
  last_error: string | null;
}

export interface ReportSummary {
  id: string;
  report_type: string;
  period_start: string;
  period_end: string;
  created_at: string;
  user_id: string | null;
}
