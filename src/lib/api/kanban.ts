import { dashboardRequest } from '$lib/api/dashboard'

export type KanbanStatus =
  | 'triage'
  | 'todo'
  | 'scheduled'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'archived'

export interface KanbanBoardMeta {
  archived?: boolean
  color?: string
  counts?: Partial<Record<KanbanStatus, number>>
  created_at?: null | number
  db_path?: string
  default_workdir?: null | string
  description?: string
  icon?: string
  is_current?: boolean
  name: string
  slug: string
  total?: number
}

export interface KanbanBoardsResponse {
  boards: KanbanBoardMeta[]
  current: string
}

interface KanbanTaskAge {
  created_age_seconds?: null | number
  started_age_seconds?: null | number
  time_to_complete_seconds?: null | number
}

interface KanbanDiagnosticSummary {
  count: number
  highest_severity?: null | string
  kinds?: Record<string, number>
  latest_at?: null | number
}

export interface KanbanTask {
  age?: KanbanTaskAge
  assignee?: null | string
  body?: null | string
  branch_name?: null | string
  comment_count?: number
  completed_at?: null | number
  consecutive_failures?: number
  created_at?: null | number
  created_by?: null | string
  current_run_id?: null | number
  current_step_key?: null | string
  diagnostics?: unknown[]
  goal_mode?: boolean
  goal_max_turns?: null | number
  id: string
  latest_summary?: null | string
  last_heartbeat_at?: null | number
  link_counts?: { children: number; parents: number }
  max_runtime_seconds?: null | number
  priority?: number
  progress?: null | { done: number; total: number }
  result?: null | string
  session_id?: null | string
  skills?: null | string[]
  started_at?: null | number
  status: KanbanStatus | (string & {})
  tenant?: null | string
  title: string
  warnings?: null | KanbanDiagnosticSummary
  worker_pid?: null | number
  workspace_kind?: null | string
  workspace_path?: null | string
}

export interface KanbanColumn {
  name: KanbanStatus | (string & {})
  tasks: KanbanTask[]
}

export interface KanbanBoardResponse {
  assignees: string[]
  columns: KanbanColumn[]
  latest_event_id: number
  now: number
  tenants: string[]
}

interface KanbanComment {
  author?: null | string
  body: string
  created_at?: null | number
  id?: number
  task_id?: string
}

export interface KanbanEvent {
  created_at?: null | number
  id?: number
  kind: string
  payload?: unknown
  run_id?: null | number
  task_id?: string
}

interface KanbanRun {
  ended_at?: null | number
  error?: null | string
  id: number
  last_heartbeat_at?: null | number
  metadata?: unknown
  outcome?: null | string
  profile?: null | string
  started_at?: null | number
  status?: null | string
  summary?: null | string
  task_id?: string
  worker_pid?: null | number
}

interface KanbanAttachment {
  content_type?: null | string
  created_at?: null | number
  filename: string
  id: number
  size?: null | number
  stored_path?: null | string
  task_id?: string
  uploaded_by?: null | string
}

export interface KanbanTaskDetailResponse {
  attachments: KanbanAttachment[]
  comments: KanbanComment[]
  events: KanbanEvent[]
  links: { children: string[]; parents: string[] }
  runs: KanbanRun[]
  task: KanbanTask
}

export interface KanbanRequestContext {
  board?: null | string
  profile?: null | string
  tenant?: null | string
}

export interface KanbanStatusUpdateContext extends KanbanRequestContext {
  blockReason?: null | string
  metadata?: Record<string, unknown>
  result?: null | string
  summary?: null | string
}

const KANBAN_PLUGIN_BASE = '/api/plugins/kanban'

function querySuffix(params: Record<string, null | string | undefined>): string {
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    const trimmed = value?.trim()
    if (trimmed) query.set(key, trimmed)
  }

  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

function boardQuery(context: KanbanRequestContext = {}): string {
  return querySuffix({ board: context.board, tenant: context.tenant })
}

export function listKanbanBoards(profile?: null | string): Promise<KanbanBoardsResponse> {
  return dashboardRequest<KanbanBoardsResponse>({
    method: 'GET',
    path: `${KANBAN_PLUGIN_BASE}/boards`,
    profile
  })
}

export function getKanbanBoard(context: KanbanRequestContext = {}): Promise<KanbanBoardResponse> {
  return dashboardRequest<KanbanBoardResponse>({
    method: 'GET',
    path: `${KANBAN_PLUGIN_BASE}/board${boardQuery(context)}`,
    profile: context.profile
  })
}

export function getKanbanTask(taskId: string, context: KanbanRequestContext = {}): Promise<KanbanTaskDetailResponse> {
  return dashboardRequest<KanbanTaskDetailResponse>({
    method: 'GET',
    path: `${KANBAN_PLUGIN_BASE}/tasks/${encodeURIComponent(taskId)}${boardQuery(context)}`,
    profile: context.profile
  })
}

export function updateKanbanTaskStatus(
  taskId: string,
  status: KanbanStatus | (string & {}),
  context: KanbanStatusUpdateContext = {}
): Promise<{ task: KanbanTask | null }> {
  return dashboardRequest<{ task: KanbanTask | null }>({
    body: {
      ...(context.blockReason ? { block_reason: context.blockReason } : {}),
      ...(context.metadata ? { metadata: context.metadata } : {}),
      ...(context.result ? { result: context.result } : {}),
      status,
      ...(context.summary ? { summary: context.summary } : {})
    },
    method: 'PATCH',
    path: `${KANBAN_PLUGIN_BASE}/tasks/${encodeURIComponent(taskId)}${boardQuery(context)}`,
    profile: context.profile
  })
}

export function addKanbanComment(
  taskId: string,
  body: string,
  context: KanbanRequestContext & { author?: null | string } = {}
): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    body: {
      author: context.author?.trim() || 'desktop',
      body
    },
    method: 'POST',
    path: `${KANBAN_PLUGIN_BASE}/tasks/${encodeURIComponent(taskId)}/comments${boardQuery(context)}`,
    profile: context.profile
  })
}
