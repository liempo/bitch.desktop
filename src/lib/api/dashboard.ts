import { invoke } from '@tauri-apps/api/core'

import type {
  ConfigRawResponse,
  ConfigSchemaResponse,
  MessagingPlatformTestResponse,
  MessagingPlatformUpdate,
  MessagingPlatformsResponse,
  ModelAssignmentRequest,
  ModelAssignmentResponse,
  ModelInfoResponse,
  ModelOptionsResponse,
  PaginatedSessions,
  ProfilesResponse,
  SessionMessagesResponse,
  SessionSearchResponse,
  SkillContentResponse,
  SkillInfo,
  ToolsetInfo
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

export function getGlobalModelInfo(profile?: null | string): Promise<ModelInfoResponse> {
  const scoped = profile ?? apiProfile

  return dashboardRequest<ModelInfoResponse>({
    path: `/api/model/info${profileSuffix(scoped)}`,
    profile: scoped
  })
}

export function getModelOptions(profile?: null | string): Promise<ModelOptionsResponse> {
  const scoped = profile ?? apiProfile

  return dashboardRequest<ModelOptionsResponse>({
    path: `/api/model/options${profileSuffix(scoped)}`,
    profile: scoped
  })
}

export function getProfiles(): Promise<ProfilesResponse> {
  return dashboardRequest<ProfilesResponse>({ path: '/api/profiles' })
}

export function getActiveProfile(): Promise<ActiveProfileResponse> {
  return dashboardRequest<ActiveProfileResponse>({ path: '/api/profiles/active' })
}

export function getConfigRaw(profile?: null | string): Promise<ConfigRawResponse> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<ConfigRawResponse>({
    path: `/api/config/raw${suffix}`,
    profile
  })
}

export function saveConfigRaw(yamlText: string, profile?: null | string): Promise<{ ok: boolean }> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<{ ok: boolean }>({
    body: { yaml_text: yamlText, ...(profile ? { profile } : {}) },
    method: 'PUT',
    path: `/api/config/raw${suffix}`,
    profile
  })
}

export function getConfigSchema(): Promise<ConfigSchemaResponse> {
  return dashboardRequest<ConfigSchemaResponse>({ path: '/api/config/schema' })
}

export function getSkills(profile?: null | string): Promise<SkillInfo[]> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<SkillInfo[]>({
    path: `/api/skills${suffix}`,
    profile
  })
}

export function getSkillContent(name: string, profile?: null | string): Promise<SkillContentResponse> {
  const params = new URLSearchParams({ name })
  if (profile) params.set('profile', profile)

  return dashboardRequest<SkillContentResponse>({
    path: `/api/skills/content?${params.toString()}`,
    profile
  })
}

export function toggleSkill(
  name: string,
  enabled: boolean,
  profile?: null | string
): Promise<{ ok: boolean; name: string; enabled: boolean }> {
  return dashboardRequest<{ ok: boolean; name: string; enabled: boolean }>({
    body: { name, enabled, ...(profile ? { profile } : {}) },
    method: 'PUT',
    path: '/api/skills/toggle',
    profile
  })
}

export function createSkill(
  body: { category?: null | string; content: string; name: string },
  profile?: null | string
): Promise<Record<string, unknown>> {
  return dashboardRequest<Record<string, unknown>>({
    body: { ...body, ...(profile ? { profile } : {}) },
    method: 'POST',
    path: '/api/skills',
    profile
  })
}

export function updateSkillContent(
  name: string,
  content: string,
  profile?: null | string
): Promise<Record<string, unknown>> {
  return dashboardRequest<Record<string, unknown>>({
    body: { name, content, ...(profile ? { profile } : {}) },
    method: 'PUT',
    path: '/api/skills/content',
    profile
  })
}

export function uninstallSkillFromHub(name: string, profile?: null | string): Promise<Record<string, unknown>> {
  return dashboardRequest<Record<string, unknown>>({
    body: { name, ...(profile ? { profile } : {}) },
    method: 'POST',
    path: '/api/skills/hub/uninstall',
    profile
  })
}

export function getToolsets(profile?: null | string): Promise<ToolsetInfo[]> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<ToolsetInfo[]>({
    path: `/api/tools/toolsets${suffix}`,
    profile
  })
}

export function toggleToolset(
  name: string,
  enabled: boolean,
  profile?: null | string
): Promise<{ ok: boolean; name: string; enabled: boolean }> {
  return dashboardRequest<{ ok: boolean; name: string; enabled: boolean }>({
    body: { enabled, ...(profile ? { profile } : {}) },
    method: 'PUT',
    path: `/api/tools/toolsets/${encodeURIComponent(name)}`,
    profile
  })
}

export function setModelAssignment(
  body: ModelAssignmentRequest,
  profile?: null | string
): Promise<ModelAssignmentResponse> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<ModelAssignmentResponse>({
    body: { ...body, ...(profile ? { profile } : {}) },
    method: 'POST',
    path: `/api/model/set${suffix}`,
    profile
  })
}

export function getMessagingPlatforms(profile?: null | string): Promise<MessagingPlatformsResponse> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<MessagingPlatformsResponse>({
    path: `/api/messaging/platforms${suffix}`,
    profile
  })
}

export function updateMessagingPlatform(
  platformId: string,
  body: MessagingPlatformUpdate,
  profile?: null | string
): Promise<{ ok: boolean; platform: string }> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<{ ok: boolean; platform: string }>({
    body: { ...body, ...(profile ? { profile } : {}) },
    method: 'PUT',
    path: `/api/messaging/platforms/${encodeURIComponent(platformId)}${suffix}`,
    profile
  })
}

export function testMessagingPlatform(
  platformId: string,
  profile?: null | string
): Promise<MessagingPlatformTestResponse> {
  const suffix = profileSuffix(profile)

  return dashboardRequest<MessagingPlatformTestResponse>({
    method: 'POST',
    path: `/api/messaging/platforms/${encodeURIComponent(platformId)}/test${suffix}`,
    profile
  })
}
