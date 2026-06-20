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

interface HostThermalZone {
  celsius: number
  label: string
}

export interface HostMetrics {
  cpu: HostCpuMetrics
  hostname: string
  memory: HostMemoryMetrics
  platform: string
  processCount: number
  thermal: HostThermalZone[]
  timestamp: string
  uptimeSeconds: number
  version: string
}

export interface HostMonitorConfig {
  baseUrl: string
  metricsUrl: string
  port: string
}

interface HostMonitorEnv {
  port?: string
  url?: string
}

declare const __HOST_MONITOR_URL__: string | undefined
declare const __HOST_MONITOR_PORT__: string | undefined

const DEFAULT_HOST_MONITOR_URL = 'http://127.0.0.1'
const DEFAULT_HOST_MONITOR_PORT = '61208'

const GLANCES_ENDPOINTS = {
  cpu: '/cpu',
  load: '/load',
  mem: '/mem',
  memswap: '/memswap',
  percpu: '/percpu',
  processcount: '/processcount',
  quicklook: '/quicklook',
  sensors: '/sensors',
  status: '/status',
  system: '/system',
  uptime: '/uptime'
} as const

export const EMPTY_HOST_METRICS: HostMetrics = {
  cpu: {
    cores: 0,
    loadAverage: [0, 0, 0],
    model: 'unknown',
    perCorePercent: [],
    usagePercent: 0
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
  thermal: [],
  timestamp: '',
  uptimeSeconds: 0,
  version: 'glances'
}

function clean(value: string | undefined): string {
  return value?.trim() ?? ''
}

function normalizeUrl(url: string | undefined): string {
  const trimmed = clean(url) || DEFAULT_HOST_MONITOR_URL
  return trimmed.replace(/\/+$/, '')
}

function normalizePort(port: string | undefined): string {
  const trimmed = clean(port) || DEFAULT_HOST_MONITOR_PORT
  return /^\d{2,5}$/.test(trimmed) ? trimmed : DEFAULT_HOST_MONITOR_PORT
}

export function hostMonitorConfig(env: HostMonitorEnv = {}): HostMonitorConfig {
  const base = normalizeUrl(env.url ?? __HOST_MONITOR_URL__)
  const port = normalizePort(env.port ?? __HOST_MONITOR_PORT__)
  const hasPort = /:\d+$/.test(new URL(base).host)
  const baseUrl = hasPort ? base : `${base}:${port}`
  return {
    baseUrl,
    metricsUrl: `${baseUrl}/api/4`,
    port
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(item => numberValue(item)).filter(Number.isFinite) : []
}

function positiveNumber(value: unknown, fallback = 0): number {
  const parsed = numberValue(value, Number.NaN)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function percentFromPerCpu(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.map(item => numberValue(asRecord(item).total)).filter(Number.isFinite)
}

function thermalArray(value: unknown): HostThermalZone[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      const zone = asRecord(item)
      return {
        celsius: numberValue(zone.value ?? zone.celsius),
        label: stringValue(zone.label, 'thermal')
      }
    })
    .filter(zone => zone.celsius > 0)
}

function parseUptimeSeconds(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return 0

  const weeks = Number(/(\d+)\s+weeks?/i.exec(value)?.[1] ?? 0)
  const days = Number(/(\d+)\s+days?/i.exec(value)?.[1] ?? 0)
  const time = /(\d{1,3}):(\d{2}):(\d{2})/.exec(value)
  const hours = Number(time?.[1] ?? 0)
  const minutes = Number(time?.[2] ?? 0)
  const seconds = Number(time?.[3] ?? 0)
  return weeks * 604_800 + days * 86_400 + hours * 3600 + minutes * 60 + seconds
}

export function normalizeHostMetrics(value: unknown): HostMetrics {
  const input = asRecord(value)
  const quicklook = asRecord(input.quicklook)
  const cpu = asRecord(input.cpu)
  const memory = asRecord(input.mem ?? input.memory)
  const swap = asRecord(input.memswap)
  const load = asRecord(input.load)
  const system = asRecord(input.system)
  const processcount = asRecord(input.processcount)
  const status = asRecord(input.status)

  const perCore = percentFromPerCpu(input.percpu)
  const quicklookPerCore = percentFromPerCpu(quicklook.percpu)
  const perCorePercent = perCore.length
    ? perCore
    : quicklookPerCore.length
      ? quicklookPerCore
      : numberArray(cpu.perCorePercent)
  const cores = numberValue(cpu.cpucore, numberValue(load.cpucore, perCorePercent.length))
  const cpuUsagePercent = positiveNumber(cpu.total, positiveNumber(quicklook.cpu, average(perCorePercent)))
  const memoryTotal = numberValue(memory.total)
  const memoryUsed = numberValue(memory.used)
  const memoryAvailable = numberValue(memory.available, Math.max(0, memoryTotal - memoryUsed))

  return {
    cpu: {
      cores,
      loadAverage: [numberValue(load.min1), numberValue(load.min5), numberValue(load.min15)],
      model: stringValue(quicklook.cpu_name, stringValue(cpu.model, 'unknown')),
      perCorePercent,
      usagePercent: cpuUsagePercent || numberValue(cpu.usagePercent)
    },
    hostname: stringValue(system.hostname, stringValue(input.hostname, 'unknown')),
    memory: {
      availableBytes: memoryAvailable,
      swapTotalBytes: numberValue(swap.total, numberValue(memory.swapTotalBytes)),
      swapUsedBytes: numberValue(swap.used, numberValue(memory.swapUsedBytes)),
      swapUsedPercent: numberValue(swap.percent, numberValue(memory.swapUsedPercent)),
      totalBytes: memoryTotal || numberValue(memory.totalBytes),
      usedBytes: memoryUsed || numberValue(memory.usedBytes),
      usedPercent: numberValue(memory.percent, numberValue(memory.usedPercent))
    },
    platform: stringValue(system.hr_name, stringValue(system.os_name, stringValue(input.platform, 'unknown'))),
    processCount: numberValue(processcount.total, numberValue(input.processCount)),
    thermal: thermalArray(input.sensors ?? input.thermal),
    timestamp: stringValue(input.now, new Date().toISOString()),
    uptimeSeconds: parseUptimeSeconds(input.uptime ?? input.uptimeSeconds),
    version: stringValue(status.version, stringValue(input.version, 'glances'))
  }
}

async function fetchJson(config: HostMonitorConfig, path: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(`${config.metricsUrl}${path}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Glances host monitor returned HTTP ${response.status} for ${path}`)
  }
  return response.json()
}

async function fetchOptionalJson(
  config: HostMonitorConfig,
  path: string,
  fetcher: typeof fetch,
  fallback: unknown
): Promise<unknown> {
  try {
    return await fetchJson(config, path, fetcher)
  } catch {
    return fallback
  }
}

export async function fetchHostMetrics(
  config: HostMonitorConfig = hostMonitorConfig(),
  fetcher: typeof fetch = fetch
): Promise<HostMetrics> {
  const [cpu, mem, memswap, percpu, load, system, uptime, processcount, sensors, quicklook, status] = await Promise.all(
    [
      fetchJson(config, GLANCES_ENDPOINTS.cpu, fetcher),
      fetchJson(config, GLANCES_ENDPOINTS.mem, fetcher),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.memswap, fetcher, {}),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.percpu, fetcher, []),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.load, fetcher, {}),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.system, fetcher, {}),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.uptime, fetcher, ''),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.processcount, fetcher, {}),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.sensors, fetcher, []),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.quicklook, fetcher, {}),
      fetchOptionalJson(config, GLANCES_ENDPOINTS.status, fetcher, {})
    ]
  )

  return normalizeHostMetrics({
    cpu,
    load,
    mem,
    memswap,
    now: new Date().toISOString(),
    percpu,
    processcount,
    quicklook,
    sensors,
    status,
    system,
    uptime
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
