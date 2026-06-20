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
  version: number
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
const DEFAULT_HOST_MONITOR_PORT = '9129'

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
  version: 1
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
    metricsUrl: `${baseUrl}/metrics`,
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
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.map(item => numberValue(item)).filter(Number.isFinite) : []
}

function thermalArray(value: unknown): HostThermalZone[] {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const zone = asRecord(item)
    return {
      celsius: numberValue(zone.celsius),
      label: stringValue(zone.label, 'thermal')
    }
  })
}

export function normalizeHostMetrics(value: unknown): HostMetrics {
  const input = asRecord(value)
  const cpu = asRecord(input.cpu)
  const memory = asRecord(input.memory)

  return {
    cpu: {
      cores: numberValue(cpu.cores),
      loadAverage: numberArray(cpu.loadAverage),
      model: stringValue(cpu.model, 'unknown'),
      perCorePercent: numberArray(cpu.perCorePercent),
      usagePercent: numberValue(cpu.usagePercent)
    },
    hostname: stringValue(input.hostname, 'unknown'),
    memory: {
      availableBytes: numberValue(memory.availableBytes),
      swapTotalBytes: numberValue(memory.swapTotalBytes),
      swapUsedBytes: numberValue(memory.swapUsedBytes),
      swapUsedPercent: numberValue(memory.swapUsedPercent),
      totalBytes: numberValue(memory.totalBytes),
      usedBytes: numberValue(memory.usedBytes),
      usedPercent: numberValue(memory.usedPercent)
    },
    platform: stringValue(input.platform, 'unknown'),
    processCount: numberValue(input.processCount),
    thermal: thermalArray(input.thermal),
    timestamp: stringValue(input.timestamp, ''),
    uptimeSeconds: numberValue(input.uptimeSeconds),
    version: numberValue(input.version, 1)
  }
}

export async function fetchHostMetrics(
  config: HostMonitorConfig = hostMonitorConfig(),
  fetcher: typeof fetch = fetch
): Promise<HostMetrics> {
  const response = await fetcher(config.metricsUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Host monitor returned HTTP ${response.status}`)
  }
  return normalizeHostMetrics(await response.json())
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
