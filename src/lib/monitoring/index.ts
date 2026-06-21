import { invoke } from '@tauri-apps/api/core'

interface HostCpuMetrics {
  cores: number
  loadAverage: number[]
  model: string
  perCorePercent: number[]
  usagePercent: number
}

interface HostMemoryMetrics {
  availableBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
  swapUsedPercent: number
  totalBytes: number
  usedBytes: number
  usedPercent: number
}

interface HostDiskMetrics {
  totalBytes: number
  usedBytes: number
  usedPercent: number
}

interface HostThermalZone {
  celsius: number
  label: string
}

export interface HostProcessMetrics {
  command: string
  cpuPercent: number
  memoryBytes: number
  memoryPercent: number
  name: string
  pid: number
  status: string
  user: string
}

export type HostProcessSortKey = 'cpu' | 'memory'
export type HostProcessSortDirection = 'asc' | 'desc'

export interface HostMetrics {
  cpu: HostCpuMetrics
  disk: HostDiskMetrics
  hostname: string
  memory: HostMemoryMetrics
  platform: string
  processCount: number
  processes: HostProcessMetrics[]
  thermal: HostThermalZone[]
  timestamp: string
  uptimeSeconds: number
  version: string
}

export interface HostMonitorConfig {
  baseUrl: string
  metricsUrl: string
  port: string
  systemId: string
}

interface HostMonitorEnv {
  systemId?: string
  url?: string
}

export type HostMonitorRequestJson = (path: string) => Promise<unknown>

declare const __MONITORING_SYSTEM_ID__: string | undefined
declare const __MONITORING_URL__: string | undefined

const DEFAULT_MONITORING_URL = 'http://homestation:8090'
const GIB = 1024 ** 3

const BESZEL_COLLECTIONS = {
  systemDetails: 'system_details',
  systems: 'systems',
  systemStats: 'system_stats'
} as const

const BESZEL_SYSTEM_DETAILS_FIELDS = 'hostname,kernel,cores,threads,cpu,os,os_name,arch,memory,podman'

export const EMPTY_HOST_METRICS: HostMetrics = {
  cpu: {
    cores: 0,
    loadAverage: [0, 0, 0],
    model: 'unknown',
    perCorePercent: [],
    usagePercent: 0
  },
  disk: {
    totalBytes: 0,
    usedBytes: 0,
    usedPercent: 0
  },
  hostname: 'unknown',
  memory: {
    availableBytes: 0,
    swapTotalBytes: 0,
    swapUsedBytes: 0,
    swapUsedPercent: 0,
    totalBytes: 0,
    usedBytes: 0,
    usedPercent: 0
  },
  platform: 'unknown',
  processCount: 0,
  processes: [],
  thermal: [],
  timestamp: '',
  uptimeSeconds: 0,
  version: 'beszel'
}

function clean(value: string | undefined): string {
  return value?.trim() ?? ''
}

function configuredHostMonitorUrl(): string | undefined {
  return typeof __MONITORING_URL__ === 'undefined' ? undefined : __MONITORING_URL__
}

function configuredHostMonitorSystemId(): string | undefined {
  return typeof __MONITORING_SYSTEM_ID__ === 'undefined' ? undefined : __MONITORING_SYSTEM_ID__
}

function systemIdFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean)
  const systemIndex = parts.indexOf('system')
  return systemIndex >= 0 ? clean(parts[systemIndex + 1]) : ''
}

function normalizeUrl(url: string | undefined): { baseUrl: string; systemId: string } {
  const trimmed = clean(url) || DEFAULT_MONITORING_URL
  const parsedUrl = new URL(trimmed)
  const systemId = systemIdFromUrl(parsedUrl)
  parsedUrl.hash = ''
  parsedUrl.search = ''
  parsedUrl.pathname = ''

  return {
    baseUrl: parsedUrl.toString().replace(/\/+$/, ''),
    systemId
  }
}

function urlPort(url: URL): string {
  if (url.port) return url.port
  if (url.protocol === 'https:') return '443'
  if (url.protocol === 'http:') return '80'
  return ''
}

export function hostMonitorConfig(env: HostMonitorEnv = {}): HostMonitorConfig {
  const normalized = normalizeUrl(env.url ?? configuredHostMonitorUrl())
  const baseUrl = normalized.baseUrl
  const parsedUrl = new URL(baseUrl)
  const systemId = clean(env.systemId ?? configuredHostMonitorSystemId()) || normalized.systemId

  return {
    baseUrl,
    metricsUrl: `${baseUrl}/api/collections`,
    port: urlPort(parsedUrl),
    systemId
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed || fallback
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function firstStringValue(values: unknown[], fallback: string): string {
  for (const value of values) {
    const parsed = stringValue(value, '')
    if (parsed) return parsed
  }
  return fallback
}

function firstNumberValue(values: unknown[], fallback = 0): number {
  for (const value of values) {
    const parsed = numberValue(value, Number.NaN)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(item => numberValue(item, Number.NaN)).filter(Number.isFinite) : []
}

function bytesFromGib(value: unknown): number {
  const parsed = numberValue(value)
  return parsed > 0 ? parsed * GIB : 0
}

function bytesValue(value: unknown): number {
  const parsed = numberValue(value, Number.NaN)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function firstBytesValue(values: unknown[]): number {
  for (const value of values) {
    const parsed = bytesValue(value)
    if (parsed > 0) return parsed
  }
  return 0
}

function bytesFromPercent(total: number, percent: unknown): number {
  const parsed = numberValue(percent, Number.NaN)
  return total > 0 && Number.isFinite(parsed) ? (total * parsed) / 100 : 0
}

function percentFromUsed(total: number, used: number): number {
  return total > 0 && used >= 0 ? (used / total) * 100 : 0
}

function sensorUnit(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/^°/, '') : ''
}

function sensorValueInCelsius(sensor: Record<string, unknown>): number {
  const raw = numberValue(
    sensor.value ?? sensor.celsius ?? sensor.temperature ?? sensor.temp ?? sensor.current,
    Number.NaN
  )
  if (!Number.isFinite(raw)) return 0

  const unit = sensorUnit(sensor.unit)
  return unit === 'f' || unit === 'fahrenheit' ? ((raw - 32) * 5) / 9 : raw
}

function thermalSensorLabel(sensor: Record<string, unknown>, fallback: string): string {
  return stringValue(sensor.label, stringValue(sensor.name, stringValue(sensor.key, fallback)))
}

function isThermalSensor(sensor: Record<string, unknown>, fallback: string): boolean {
  const unit = sensorUnit(sensor.unit)
  const label = thermalSensorLabel(sensor, fallback)
  const descriptor = `${label} ${stringValue(sensor.type, '')} ${unit}`.toLowerCase()

  if (/battery|fan|rpm|volt|watt|amp|percent|%/.test(descriptor)) return false
  if (sensor.celsius !== undefined || sensor.temperature !== undefined || sensor.temp !== undefined) return true
  if (/temp|thermal|celsius|fahrenheit|°c|°f/.test(descriptor)) return true
  if (unit === 'c' || unit === 'f') return true

  return (sensor.value !== undefined || sensor.current !== undefined) && !unit
}

function collectThermalSensors(value: unknown, fallback = 'thermal'): HostThermalZone[] {
  const numeric = numberValue(value, Number.NaN)
  if (fallback !== 'thermal' && Number.isFinite(numeric) && numeric > 0) {
    return [{ celsius: numeric, label: fallback }]
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectThermalSensors(item, `${fallback} ${index + 1}`))
  }

  const sensor = asRecord(value)
  if (!Object.keys(sensor).length) return []

  if (
    sensor.value !== undefined ||
    sensor.celsius !== undefined ||
    sensor.temperature !== undefined ||
    sensor.temp !== undefined ||
    sensor.current !== undefined
  ) {
    return isThermalSensor(sensor, fallback)
      ? [
          {
            celsius: sensorValueInCelsius(sensor),
            label: thermalSensorLabel(sensor, fallback)
          }
        ]
      : []
  }

  return Object.entries(sensor).flatMap(([key, nestedValue]) => collectThermalSensors(nestedValue, key))
}

function thermalArray(value: unknown): HostThermalZone[] {
  return collectThermalSensors(value).filter(zone => Number.isFinite(zone.celsius) && zone.celsius > 0)
}

function osLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  const labels = ['Linux', 'macOS', 'Windows', 'FreeBSD']
  return labels[numberValue(value, -1)] ?? 'unknown'
}

function latestPercent(value: unknown, total: number, used: number, fallback: unknown): number {
  const direct = numberValue(value, Number.NaN)
  if (Number.isFinite(direct)) return direct

  const computed = total > 0 ? percentFromUsed(total, used) : Number.NaN
  return numberValue(computed, numberValue(fallback))
}

function normalizeBeszelHostMetrics(payload: Record<string, unknown>): HostMetrics {
  const explicitSystem = asRecord(payload.system)
  let system = explicitSystem
  if (!Object.keys(system).length) {
    system = payload
  }
  const info = asRecord(system.info)
  const details = { ...asRecord(system.details), ...asRecord(payload.details) }
  const statsRecord = asRecord(payload.statsRecord ?? payload.systemStats)
  const stats = asRecord(statsRecord.stats ?? payload.stats)
  const perCorePercent = numberArray(stats.cpus)
  const statsLoadAverage = numberArray(stats.la)
  const infoLoadAverage = numberArray(info.la)

  const memoryTotal =
    bytesFromGib(stats.m) || firstBytesValue([details.memory, details.MemoryTotal, details.memoryTotal])
  const memoryUsed = bytesFromGib(stats.mu) || bytesFromPercent(memoryTotal, stats.mp ?? info.mp)
  const swapTotal = bytesFromGib(stats.s)
  const swapUsed = bytesFromGib(stats.su)
  const diskTotal = bytesFromGib(stats.d)
  const diskUsed = bytesFromGib(stats.du)
  const agentVersion = stringValue(info.v, stringValue(system.v, ''))
  const cpuModel = firstStringValue(
    [
      details.cpu,
      details.cpu_model,
      details.CpuModel,
      details.cpuModel,
      info.m,
      info.cpu_name,
      info.cpu_model,
      info.CpuModel,
      info.cpuModel
    ],
    'unknown'
  )
  const osDisplayName = firstStringValue(
    [
      details.os_name,
      details.OsName,
      details.osName,
      details.kernel,
      details.Kernel,
      details.kernelVersion,
      details.KernelVersion,
      info.k,
      info.KernelVersion
    ],
    ''
  )
  const osEnum = details.os ?? details.Os ?? details.OS ?? info.os
  const temperatureMap =
    stats.t ?? stats.temps ?? stats.temperatures ?? (info.dt !== undefined ? { CPU: info.dt } : info.t)

  return {
    cpu: {
      cores: firstNumberValue(
        [details.cores, details.Cores, details.coreCount, details.CoreCount, info.c],
        perCorePercent.length
      ),
      loadAverage: statsLoadAverage.length ? statsLoadAverage : infoLoadAverage,
      model: cpuModel,
      perCorePercent,
      usagePercent: numberValue(stats.cpu, numberValue(info.cpu))
    },
    disk: {
      totalBytes: diskTotal,
      usedBytes: diskUsed,
      usedPercent: latestPercent(stats.dp, diskTotal, diskUsed, info.dp)
    },
    hostname: firstStringValue(
      [details.hostname, details.Hostname, details.hostName, info.h, system.name, system.host],
      'unknown'
    ),
    memory: {
      availableBytes: memoryTotal > 0 ? Math.max(0, memoryTotal - memoryUsed) : 0,
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapUsedPercent: latestPercent(stats.sp, swapTotal, swapUsed, 0),
      totalBytes: memoryTotal,
      usedBytes: memoryUsed,
      usedPercent: latestPercent(stats.mp, memoryTotal, memoryUsed, info.mp)
    },
    platform: osDisplayName || osLabel(osEnum),
    processCount: 0,
    processes: [],
    thermal: thermalArray(temperatureMap),
    timestamp: stringValue(
      statsRecord.created,
      stringValue(system.updated, stringValue(payload.now, new Date().toISOString()))
    ),
    uptimeSeconds: numberValue(info.u, numberValue(payload.uptimeSeconds)),
    version: agentVersion ? `beszel ${agentVersion}` : 'beszel'
  }
}

export function normalizeHostMetrics(value: unknown): HostMetrics {
  return normalizeBeszelHostMetrics(asRecord(value))
}

function collectionRecordsPath(collection: string, params: Record<string, string>): string {
  const url = new URL(`/api/collections/${collection}/records`, 'http://host-monitor.local')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}

function collectionRecordPath(collection: string, id: string): string {
  return `/api/collections/${collection}/records/${encodeURIComponent(id)}`
}

function collectionRecordFieldsPath(collection: string, id: string, fields: string): string {
  const url = new URL(collectionRecordPath(collection, id), 'http://host-monitor.local')
  url.searchParams.set('fields', fields)
  return `${url.pathname}${url.search}`
}

export async function requestHostMonitorJson(path: string): Promise<unknown> {
  return invoke<unknown>('host_monitor_request', {
    request: {
      method: 'GET',
      path
    }
  })
}

function pocketBaseItems(value: unknown): unknown[] {
  const payload = asRecord(value)
  return Array.isArray(payload.items) ? payload.items : []
}

async function fetchCollectionRecords(
  collection: string,
  params: Record<string, string>,
  requestJson: HostMonitorRequestJson
): Promise<unknown[]> {
  return pocketBaseItems(await requestJson(collectionRecordsPath(collection, params)))
}

function hostMonitorAuthHint(): string {
  return 'Set MONITORING_AUTH_TOKEN or MONITORING_EMAIL/MONITORING_PASSWORD, and set MONITORING_SYSTEM_ID to target a specific Beszel system.'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchConfiguredSystem(config: HostMonitorConfig, requestJson: HostMonitorRequestJson): Promise<unknown> {
  try {
    return await requestJson(collectionRecordPath(BESZEL_COLLECTIONS.systems, config.systemId))
  } catch (error) {
    throw new Error(
      `Beszel system "${config.systemId}" is not visible to the app. Check MONITORING_SYSTEM_ID and Beszel auth. ${hostMonitorAuthHint()} ${errorMessage(error)}`
    )
  }
}

async function fetchSystemDetails(systemId: string, requestJson: HostMonitorRequestJson): Promise<unknown | undefined> {
  if (!systemId) return undefined

  try {
    return await requestJson(
      collectionRecordFieldsPath(BESZEL_COLLECTIONS.systemDetails, systemId, BESZEL_SYSTEM_DETAILS_FIELDS)
    )
  } catch {
    return undefined
  }
}

async function fetchVisibleSystem(requestJson: HostMonitorRequestJson): Promise<unknown> {
  let systems = await fetchCollectionRecords(
    BESZEL_COLLECTIONS.systems,
    { filter: 'status="up"', perPage: '1', sort: '-updated' },
    requestJson
  )

  if (!systems.length) {
    systems = await fetchCollectionRecords(BESZEL_COLLECTIONS.systems, { perPage: '1', sort: '-updated' }, requestJson)
  }

  const system = systems[0]
  const systemId = stringValue(asRecord(system).id, '')
  if (!system || !systemId) {
    throw new Error(
      `Beszel host monitor did not return any visible systems. The hub can be healthy while PocketBase records remain hidden from unauthenticated requests. ${hostMonitorAuthHint()}`
    )
  }

  return system
}

export async function fetchHostMetrics(
  config: HostMonitorConfig = hostMonitorConfig(),
  requestJson: HostMonitorRequestJson = requestHostMonitorJson
): Promise<HostMetrics> {
  const system = config.systemId
    ? await fetchConfiguredSystem(config, requestJson)
    : await fetchVisibleSystem(requestJson)
  const systemId = stringValue(asRecord(system).id, '')

  const [statsResult, detailsResult] = await Promise.allSettled([
    fetchCollectionRecords(
      BESZEL_COLLECTIONS.systemStats,
      { fields: 'created,stats,system', filter: `system="${systemId}"`, perPage: '1', sort: '-created' },
      requestJson
    ),
    fetchSystemDetails(systemId, requestJson)
  ])
  const statsRecords = statsResult.status === 'fulfilled' ? statsResult.value : []
  const details = detailsResult.status === 'fulfilled' ? detailsResult.value : undefined

  return normalizeHostMetrics({
    details,
    now: new Date().toISOString(),
    statsRecord: statsRecords[0],
    system
  })
}

export function sortHostProcesses(
  processes: HostProcessMetrics[],
  key: HostProcessSortKey,
  direction: HostProcessSortDirection = 'desc'
): HostProcessMetrics[] {
  const multiplier = direction === 'asc' ? 1 : -1

  return [...processes].sort((left, right) => {
    if (key === 'memory') {
      const memoryDelta = left.memoryPercent - right.memoryPercent
      if (Math.abs(memoryDelta) > 0.001) return memoryDelta * multiplier

      const memoryBytesDelta = left.memoryBytes - right.memoryBytes
      if (memoryBytesDelta !== 0) return memoryBytesDelta * multiplier
    } else {
      const cpuDelta = left.cpuPercent - right.cpuPercent
      if (Math.abs(cpuDelta) > 0.001) return cpuDelta * multiplier
    }

    return left.name.localeCompare(right.name) || left.pid - right.pid
  })
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  const decimals = value >= 10 || unit === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[unit]}`
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.0%'
  return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00:00'
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}
