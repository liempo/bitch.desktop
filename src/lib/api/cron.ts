import { dashboardRequest } from '$lib/api/dashboard'
import type { SessionInfo } from '$lib/types/hermes'

interface CronSchedule {
  display?: string
  expr?: string
  kind?: string
  minutes?: number
  run_at?: string
  value?: string
}

interface CronJobRepeat {
  completed?: number
  times?: null | number
}

export interface CronJob {
  base_url?: null | string
  context_from?: null | string[]
  created_at?: null | string
  deliver?: null | string
  enabled?: boolean
  enabled_toolsets?: null | string[]
  hermes_home?: null | string
  id: string
  is_default_profile?: boolean
  last_delivery_error?: null | string
  last_error?: null | string
  last_run_at?: null | number | string
  last_status?: null | string
  model?: null | string
  name?: null | string
  next_run_at?: null | number | string
  no_agent?: boolean
  profile?: null | string
  profile_name?: null | string
  prompt?: null | string
  provider?: null | string
  repeat?: null | CronJobRepeat
  schedule?: CronSchedule | null | string
  schedule_display?: null | string
  script?: null | string
  skill?: null | string
  skills?: null | string[]
  state?: null | string
  workdir?: null | string
}

export interface CronJobRunsResponse {
  limit: number
  runs: SessionInfo[]
}

export interface CronDeliveryTarget {
  home_env_var?: null | string
  home_target_set?: boolean
  id: string
  name?: null | string
}

export interface CronDeliveryTargetsResponse {
  targets: CronDeliveryTarget[]
}

export interface CronJobPayload {
  context_from?: null | string[]
  deliver?: string
  enabled_toolsets?: null | string[]
  model?: null | string
  name?: string
  no_agent?: boolean
  prompt?: string
  provider?: null | string
  schedule?: string
  script?: null | string
  skills?: string[]
  workdir?: null | string
}

export type CronJobPayloadInput = Omit<CronJobPayload, 'context_from' | 'enabled_toolsets' | 'skills'> & {
  context_from?: unknown
  enabled_toolsets?: unknown
  skills?: unknown
  [key: string]: unknown
}

type CronCreatePayload = Pick<CronJobPayload, 'deliver' | 'name' | 'prompt' | 'schedule' | 'skills'>

const CREATE_ADVANCED_FIELDS = [
  'context_from',
  'enabled_toolsets',
  'model',
  'no_agent',
  'provider',
  'script',
  'workdir'
] as const

function clean(value: null | string | undefined): string {
  return value?.trim() ?? ''
}

function profileQuery(profile?: null | string): string {
  const value = clean(profile)
  return value ? `?profile=${encodeURIComponent(value)}` : ''
}

function requestProfile(profile?: null | string): string | undefined {
  const value = clean(profile)
  return value && value !== 'all' ? value : undefined
}

function splitList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean)
  }

  return undefined
}

function nullableString(value: unknown): null | string | undefined {
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.trim()
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function hasCreateAdvancedValue(
  key: (typeof CREATE_ADVANCED_FIELDS)[number],
  value: CronJobPayload[typeof key]
): boolean {
  if (Array.isArray(value)) return value.length > 0
  if (key === 'no_agent') return value === true
  return value != null
}

export function normalizeCronJobPayload(input: CronJobPayloadInput): CronJobPayload {
  const output: CronJobPayload = {}

  for (const key of ['name', 'prompt', 'schedule', 'deliver'] as const) {
    if (hasOwn(input, key)) {
      const value = optionalTrimmedString(input[key])
      if (value !== undefined) output[key] = value
    }
  }

  for (const key of ['skills', 'context_from', 'enabled_toolsets'] as const) {
    if (hasOwn(input, key)) {
      const value = splitList(input[key])
      if (value !== undefined) output[key] = value
    }
  }

  for (const key of ['script', 'workdir', 'model', 'provider'] as const) {
    if (hasOwn(input, key)) {
      const value = nullableString(input[key])
      if (value !== undefined) output[key] = value
    }
  }

  if (hasOwn(input, 'no_agent')) output.no_agent = Boolean(input.no_agent)

  return output
}

function createPayload(payload: CronJobPayload): CronCreatePayload {
  return {
    deliver: payload.deliver || 'local',
    name: payload.name || '',
    prompt: payload.prompt ?? '',
    schedule: payload.schedule ?? '',
    ...(payload.skills ? { skills: payload.skills } : {})
  }
}

function advancedCreateUpdates(payload: CronJobPayload): Partial<CronJobPayload> {
  const updates: Partial<CronJobPayload> = {}

  for (const key of CREATE_ADVANCED_FIELDS) {
    const value = payload[key]
    if (hasOwn(payload, key) && hasCreateAdvancedValue(key, value)) {
      updates[key] = value as never
    }
  }

  return updates
}

function hasUpdates(updates: Partial<CronJobPayload>): boolean {
  return Object.keys(updates).length > 0
}

function queryWithLimit(profile: null | string | undefined, limit: number): string {
  const query = new URLSearchParams()
  const selectedProfile = clean(profile)
  if (selectedProfile) query.set('profile', selectedProfile)
  query.set('limit', String(Math.max(1, Math.min(Math.trunc(limit), 100))))
  return `?${query.toString()}`
}

export function getCronJobs(profile = 'all'): Promise<CronJob[]> {
  return dashboardRequest<CronJob[]>({
    path: `/api/cron/jobs?profile=${encodeURIComponent(profile)}`,
    profile: requestProfile(profile)
  })
}

export function getCronDeliveryTargets(): Promise<CronDeliveryTargetsResponse> {
  return dashboardRequest<CronDeliveryTargetsResponse>({ path: '/api/cron/delivery-targets' })
}

export async function createCronJob(payload: CronJobPayloadInput, profile = 'default'): Promise<CronJob> {
  const body = normalizeCronJobPayload(payload)
  const created = await dashboardRequest<CronJob>({
    body: createPayload(body),
    method: 'POST',
    path: `/api/cron/jobs${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })

  const updates = advancedCreateUpdates(body)
  if (!created.id || !hasUpdates(updates)) return created

  return updateCronJob(created.id, updates, profile)
}

export function updateCronJob(id: string, payload: CronJobPayloadInput, profile?: null | string): Promise<CronJob> {
  const updates = normalizeCronJobPayload(payload)
  return dashboardRequest<CronJob>({
    body: { updates },
    method: 'PUT',
    path: `/api/cron/jobs/${encodeURIComponent(id)}${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })
}

export function pauseCronJob(id: string, profile?: null | string): Promise<CronJob> {
  return dashboardRequest<CronJob>({
    method: 'POST',
    path: `/api/cron/jobs/${encodeURIComponent(id)}/pause${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })
}

export function resumeCronJob(id: string, profile?: null | string): Promise<CronJob> {
  return dashboardRequest<CronJob>({
    method: 'POST',
    path: `/api/cron/jobs/${encodeURIComponent(id)}/resume${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })
}

export function runCronJob(id: string, profile?: null | string): Promise<CronJob> {
  return dashboardRequest<CronJob>({
    method: 'POST',
    path: `/api/cron/jobs/${encodeURIComponent(id)}/trigger${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })
}

export function deleteCronJob(id: string, profile?: null | string): Promise<{ ok: boolean }> {
  return dashboardRequest<{ ok: boolean }>({
    method: 'DELETE',
    path: `/api/cron/jobs/${encodeURIComponent(id)}${profileQuery(profile)}`,
    profile: requestProfile(profile)
  })
}

export function getCronJobRuns(id: string, profile?: null | string, limit = 5): Promise<CronJobRunsResponse> {
  return dashboardRequest<CronJobRunsResponse>({
    path: `/api/cron/jobs/${encodeURIComponent(id)}/runs${queryWithLimit(profile, limit)}`,
    profile: requestProfile(profile)
  })
}

export function cronJobProfile(job: CronJob): string {
  return clean(job.profile) || clean(job.profile_name) || 'default'
}

export function cronJobState(job: CronJob): string {
  return clean(job.state) || (job.enabled === false ? 'paused' : 'scheduled')
}

export function cronJobTitle(job: CronJob): string {
  return clean(job.name) || clean(job.prompt).slice(0, 80) || clean(job.script) || job.id
}

export function cronJobScheduleLabel(job: CronJob): string {
  if (clean(job.schedule_display)) return clean(job.schedule_display)
  const schedule = job.schedule
  if (typeof schedule === 'string') return clean(schedule) || '—'
  return clean(schedule?.display) || clean(schedule?.expr) || clean(schedule?.value) || clean(schedule?.run_at) || '—'
}
