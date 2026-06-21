import { invokeTauriCommand } from '$lib/platform'

import type {
  ModelInfoResponse,
  ModelOptionsResponse,
  PaginatedSessions,
  ProfilesResponse,
  SessionMessagesResponse,
  SessionSearchResponse
} from '$lib/types/hermes'

type DashboardRequestMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT'

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
export const SESSION_MESSAGES_LOAD_DELAY_MS = 500

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
  return invokeTauriCommand<T>('dashboard_request', {
    request: {
      body,
      method,
      path,
      ...(profile ? { profile } : {})
    }
  })
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function profileSuffix(profile: null | string | undefined, prefix = '?'): string {
  return profile ? `${prefix}profile=${encodeURIComponent(profile)}` : ''
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
  const suffix = profileSuffix(profile, '&')

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

export async function getSessionMessages(id: string, profile?: null | string): Promise<SessionMessagesResponse> {
  const suffix = profileSuffix(profile)
  const request = dashboardRequest<SessionMessagesResponse>({
    path: `/api/sessions/${encodeURIComponent(id)}/messages${suffix}`,
    profile
  })

  const [result] = await Promise.allSettled([request, delay(SESSION_MESSAGES_LOAD_DELAY_MS)] as const)

  if (result.status === 'rejected') {
    throw result.reason
  }

  return result.value
}

export function renameSession(
  id: string,
  title: string,
  profile?: null | string
): Promise<{ ok: boolean; title: string }> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<{ ok: boolean; title: string }>({
    body: { title, ...(profile ? { profile } : {}) },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}${suffix}`,
    profile
  })
}

export function setSessionArchived(id: string, archived: boolean, profile?: null | string): Promise<{ ok: boolean }> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<{ ok: boolean }>({
    body: { archived, ...(profile ? { profile } : {}) },
    method: 'PATCH',
    path: `/api/sessions/${encodeURIComponent(id)}${suffix}`,
    profile
  })
}

export function deleteSession(id: string, profile?: null | string): Promise<{ ok: boolean }> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<{ ok: boolean }>({
    method: 'DELETE',
    path: `/api/sessions/${encodeURIComponent(id)}${suffix}`,
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
