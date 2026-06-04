import { invoke } from '@tauri-apps/api/core'

import type {
  ModelInfoResponse,
  ModelOptionsResponse,
  PaginatedSessions,
  SessionMessagesResponse,
  SessionSearchResponse
} from './types/hermes'

export type DashboardRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export interface DashboardRequestOptions {
  body?: unknown
  method?: DashboardRequestMethod
  path: string
}

const DEFAULT_LIMIT = 40

export async function dashboardRequest<T>({ path, method = 'GET', body }: DashboardRequestOptions): Promise<T> {
  return invoke<T>('dashboard_request', {
    body,
    method,
    path
  })
}

export async function listSessions(
  limit = DEFAULT_LIMIT,
  offset = 0,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent'
): Promise<PaginatedSessions> {
  const safeLimit = Math.max(0, limit)
  const safeOffset = Math.max(0, offset)

  return dashboardRequest<PaginatedSessions>({
    path: `/api/sessions?limit=${safeLimit}&offset=${safeOffset}&min_messages=${Math.max(0, minMessages)}&archived=${archived}&order=${order}`
  })
}

export function searchSessions(query: string): Promise<SessionSearchResponse> {
  return dashboardRequest<SessionSearchResponse>({
    path: `/api/sessions/search?q=${encodeURIComponent(query)}`
  })
}

export function getSessionMessages(id: string): Promise<SessionMessagesResponse> {
  return dashboardRequest<SessionMessagesResponse>({
    path: `/api/sessions/${encodeURIComponent(id)}/messages`
  })
}

export function renameSession(id: string, title: string): Promise<{ ok: boolean; title: string }> {
  return dashboardRequest<{ ok: boolean; title: string }>({
    body: { title },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}`
  })
}

export function setSessionArchived(id: string, archived: boolean): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    body: { archived },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}`
  })
}

export function deleteSession(id: string): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    method: 'DELETE',
    path: `/api/sessions/${encodeURIComponent(id)}`
  })
}

export function getGlobalModelInfo(): Promise<ModelInfoResponse> {
  return dashboardRequest<ModelInfoResponse>({
    path: '/api/model/info'
  })
}

export function getModelOptions(): Promise<ModelOptionsResponse> {
  return dashboardRequest<ModelOptionsResponse>({
    path: '/api/model/options'
  })
}
