import { invoke } from '@tauri-apps/api/core'

import type {
  ModelInfoResponse,
  ModelOptionsResponse,
  PaginatedSessions,
  ProfileCreatePayload,
  ProfileSetupCommand,
  ProfilesResponse,
  ProfileSoul,
  SessionMessagesResponse,
  SessionSearchResponse
} from '$lib/types/hermes'

export type DashboardRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

export interface DashboardRequestOptions {
  body?: unknown
  method?: DashboardRequestMethod
  path: string
  profile?: null | string
}

export interface ActiveProfileResponse {
  active: string
  current: string
}

export interface SessionSourceFilter {
  excludeSources?: string[]
  source?: string
}

const DEFAULT_LIMIT = 40

// Profile that profile-scoped REST settings should target. The profile store
// pushes the active gateway profile here to avoid an import cycle.
let apiProfile: null | string = null

export function setApiRequestProfile(profile: null | string): void {
  apiProfile = profile?.trim() || null
}

function profileScoped(): { profile?: string } {
  return apiProfile ? { profile: apiProfile } : {}
}

export async function dashboardRequest<T>({
  path,
  method = 'GET',
  body,
  profile
}: DashboardRequestOptions): Promise<T> {
  return invoke<T>('dashboard_request', {
    request: {
      body,
      method,
      path,
      ...(profile ? { profile } : {})
    }
  })
}

export async function listSessions(
  limit = DEFAULT_LIMIT,
  offset = 0,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  profile?: null | string
): Promise<PaginatedSessions> {
  const safeLimit = Math.max(0, limit)
  const safeOffset = Math.max(0, offset)
  const suffix = profile ? `&profile=${encodeURIComponent(profile)}` : ''

  return dashboardRequest<PaginatedSessions>({
    path: `/api/sessions?limit=${safeLimit}&offset=${safeOffset}&min_messages=${Math.max(0, minMessages)}&archived=${archived}&order=${order}${suffix}`,
    profile
  })
}

export async function listAllProfileSessions(
  limit = DEFAULT_LIMIT,
  offset = 0,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  profile: 'all' | (string & {}) = 'all',
  filter: SessionSourceFilter = {}
): Promise<PaginatedSessions> {
  const safeLimit = Math.max(0, limit)
  const safeOffset = Math.max(0, offset)
  const sourceParam = filter.source ? `&source=${encodeURIComponent(filter.source)}` : ''
  const excludeParam = filter.excludeSources?.length
    ? `&exclude_sources=${encodeURIComponent(filter.excludeSources.join(','))}`
    : ''

  return dashboardRequest<PaginatedSessions>({
    path:
      `/api/profiles/sessions?limit=${safeLimit}&offset=${safeOffset}&min_messages=${Math.max(0, minMessages)}` +
      `&archived=${archived}&order=${order}&profile=${encodeURIComponent(profile)}${sourceParam}${excludeParam}`,
    profile: profile === 'all' ? null : profile
  })
}

export function searchSessions(query: string): Promise<SessionSearchResponse> {
  return dashboardRequest<SessionSearchResponse>({
    path: `/api/sessions/search?q=${encodeURIComponent(query)}`
  })
}

export function getSessionMessages(id: string, profile?: null | string): Promise<SessionMessagesResponse> {
  const suffix = profile ? `?profile=${encodeURIComponent(profile)}` : ''

  return dashboardRequest<SessionMessagesResponse>({
    path: `/api/sessions/${encodeURIComponent(id)}/messages${suffix}`,
    profile
  })
}

export function renameSession(
  id: string,
  title: string,
  profile?: null | string
): Promise<{ ok: boolean; title: string }> {
  return dashboardRequest<{ ok: boolean; title: string }>({
    body: { title, ...(profile ? { profile } : {}) },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}`,
    profile
  })
}

export function setSessionArchived(id: string, archived: boolean, profile?: null | string): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    body: { archived },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}`,
    profile
  })
}

export function deleteSession(id: string, profile?: null | string): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    method: 'DELETE',
    path: `/api/sessions/${encodeURIComponent(id)}`,
    profile
  })
}

export function getGlobalModelInfo(): Promise<ModelInfoResponse> {
  return dashboardRequest<ModelInfoResponse>({
    ...profileScoped(),
    path: '/api/model/info'
  })
}

export function getModelOptions(): Promise<ModelOptionsResponse> {
  return dashboardRequest<ModelOptionsResponse>({
    ...profileScoped(),
    path: '/api/model/options'
  })
}

export function getProfiles(): Promise<ProfilesResponse> {
  return dashboardRequest<ProfilesResponse>({ path: '/api/profiles' })
}

export function getActiveProfile(): Promise<ActiveProfileResponse> {
  return dashboardRequest<ActiveProfileResponse>({ path: '/api/profiles/active' })
}

export function createProfile(body: ProfileCreatePayload): Promise<{ name: string; ok: boolean; path: string }> {
  return dashboardRequest<{ name: string; ok: boolean; path: string }>({
    body,
    method: 'POST',
    path: '/api/profiles'
  })
}

export function renameProfile(name: string, newName: string): Promise<{ name: string; ok: boolean; path: string }> {
  return dashboardRequest<{ name: string; ok: boolean; path: string }>({
    body: { new_name: newName },
    method: 'PATCH',
    path: `/api/profiles/${encodeURIComponent(name)}`
  })
}

export function deleteProfile(name: string): Promise<{ ok: boolean; path: string }> {
  return dashboardRequest<{ ok: boolean; path: string }>({
    method: 'DELETE',
    path: `/api/profiles/${encodeURIComponent(name)}`
  })
}

export function getProfileSoul(name: string): Promise<ProfileSoul> {
  return dashboardRequest<ProfileSoul>({ path: `/api/profiles/${encodeURIComponent(name)}/soul` })
}

export function updateProfileSoul(name: string, content: string): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    body: { content },
    method: 'PUT',
    path: `/api/profiles/${encodeURIComponent(name)}/soul`
  })
}

export function getProfileSetupCommand(name: string): Promise<ProfileSetupCommand> {
  return dashboardRequest<ProfileSetupCommand>({
    path: `/api/profiles/${encodeURIComponent(name)}/setup-command`
  })
}
