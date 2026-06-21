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
  usedPercent: number
}

interface HostThermalZone {
  celsius: number
  label: string
}

interface HostFilesystemMetrics {
  mountPoint: string
  sizeBytes: number
  usedPercent: number
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
}

interface HostMonitorEnv {
  url?: string
}

declare const __HOST_MONITOR_URL__: string | undefined

const DEFAULT_HOST_MONITOR_URL = 'http://homestation:8090'
const GIB = 1024 ** 3

const BESZEL_COLLECTIONS = {
  systems: 'systems',
  systemStats: 'system_stats'
} as const

export const EMPTY_HOST_METRICS: HostMetrics = {
  cpu: {
    cores: 0,
    loadAverage: [0, 0, 0],
    model: 'unknown',
    perCorePercent: [],
    usagePercent: 0
  },
  disk: {
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

function normalizeUrl(url: string | undefined): string {
  const trimmed = clean(url) || DEFAULT_HOST_MONITOR_URL
  return trimmed.replace(/\/+$/, '')
}

function urlPort(url: URL): string {
  if (url.port) return url.port
  if (url.protocol === 'https:') return '443'
  if (url.protocol === 'http:') return '80'
  return ''
}

export function hostMonitorConfig(env: HostMonitorEnv = {}): HostMonitorConfig {
  const baseUrl = normalizeUrl(env.url ?? __HOST_MONITOR_URL__)
  const parsedUrl = new URL(baseUrl)
  return {
    baseUrl,
    metricsUrl: `${baseUrl}/api/collections`,
    port: urlPort(parsedUrl)
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function commandValue(value: unknown, fallback: string): string {
  if (Array.isArray(value)) {
    const command = value
      .map(item => (typeof item === 'string' || typeof item === 'number' ? String(item) : ''))
      .filter(Boolean)
      .join(' ')
      .trim()
    return command || fallback
  }

  return stringValue(value, fallback)
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
  return value.map(item => numberValue(asRecord(item).total, numberValue(item, Number.NaN))).filter(Number.isFinite)
}

function bytesFromGib(value: unknown): number {
  const parsed = numberValue(value)
  return parsed > 0 ? parsed * GIB : 0
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

  if (Array.isArray(value))
    return value.flatMap((item, index) => collectThermalSensors(item, `${fallback} ${index + 1}`))

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

function arrayFromPayload(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value)) return value

  const record = asRecord(value)
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key]
  }

  const values = Object.values(record)
  return values.every(item => item && typeof item === 'object') ? values : []
}

function filesystemMountPoint(filesystem: Record<string, unknown>): string {
  return stringValue(
    filesystem.mnt_point,
    stringValue(filesystem.mountpoint, stringValue(filesystem.mountPoint, stringValue(filesystem.path, '')))
  )
}

function isIgnoredFilesystemMount(mountPoint: string): boolean {
  return mountPoint === '/etc/resolv.conf' || mountPoint === '/etc/hosts' || mountPoint === '/etc/hostname'
}

function normalizeFilesystems(value: unknown): HostFilesystemMetrics[] {
  return arrayFromPayload(value, ['fs', 'filesystems']).map(item => {
    const filesystem = asRecord(item)
    return {
      mountPoint: filesystemMountPoint(filesystem),
      sizeBytes: numberValue(filesystem.size, numberValue(filesystem.total, numberValue(filesystem.totalBytes))),
      usedPercent: numberValue(
        filesystem.percent,
        numberValue(filesystem.usedPercent, numberValue(filesystem.used_percent))
      )
    }
  })
}

function normalizeDisk(value: unknown): HostDiskMetrics {
  const disk = asRecord(value)
  const directPercent = numberValue(disk.percent ?? disk.usedPercent ?? disk.used_percent, Number.NaN)
  if (Number.isFinite(directPercent)) return { usedPercent: directPercent }

  const filesystems = normalizeFilesystems(value).filter(filesystem => filesystem.mountPoint)
  const displayableFilesystems = filesystems.filter(filesystem => !isIgnoredFilesystemMount(filesystem.mountPoint))
  const primaryFilesystem =
    displayableFilesystems.find(filesystem => filesystem.mountPoint === '/') ??
    [...displayableFilesystems].sort((left, right) => right.sizeBytes - left.sizeBytes)[0] ??
    [...filesystems].sort((left, right) => right.sizeBytes - left.sizeBytes)[0]

  return { usedPercent: primaryFilesystem?.usedPercent ?? 0 }
}

function memoryInfoBytes(value: unknown): number {
  if (Array.isArray(value)) return numberValue(value[0])

  const record = asRecord(value)
  return numberValue(record.rss, numberValue(record.resident, numberValue(record.used)))
}

function normalizeProcessList(value: unknown, memoryTotalBytes: number): HostProcessMetrics[] {
  return arrayFromPayload(value, ['processes'])
    .map(item => {
      const process = asRecord(item)
      const pid = numberValue(process.pid)
      const memoryBytes = numberValue(
        process.memoryBytes ?? process.memory_bytes ?? process.memory_rss ?? process.rss,
        memoryInfoBytes(process.memory_info ?? process.memoryInfo ?? process.mem_info)
      )
      const memoryPercent = numberValue(
        process.memory_percent ?? process.memoryPercent ?? process.mem_percent ?? process.percent_mem,
        memoryBytes > 0 && memoryTotalBytes > 0 ? (memoryBytes / memoryTotalBytes) * 100 : 0
      )
      const cpuPercent = numberValue(process.cpu_percent ?? process.cpuPercent ?? process.percent_cpu ?? process.cpu)
      const name = commandValue(process.name, pid > 0 ? `pid ${pid}` : 'process')
      const command = commandValue(process.cmdline, commandValue(process.command, name))

      return {
        command,
        cpuPercent,
        memoryBytes,
        memoryPercent,
        name,
        pid,
        status: stringValue(process.status, ''),
        user: stringValue(process.username, stringValue(process.user, ''))
      }
    })
    .filter(process => process.pid > 0 || process.name !== 'process' || process.command !== 'process')
}

function isBeszelPayload(input: Record<string, unknown>): boolean {
  const system = asRecord(input.system)
  const statsRecord = asRecord(input.statsRecord ?? input.systemStats)
  return Object.keys(system).length > 0 || Object.keys(statsRecord).length > 0 || input.stats !== undefined
}

function osLabel(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value
  const labels = ['Linux', 'macOS', 'Windows', 'FreeBSD']
  return labels[numberValue(value, -1)] ?? 'unknown'
}

function normalizeBeszelHostMetrics(input: Record<string, unknown>): HostMetrics {
  const system = asRecord(input.system)
  const info = asRecord(system.info)
  const details = asRecord(input.details)
  const statsRecord = asRecord(input.statsRecord ?? input.systemStats)
  const stats = asRecord(statsRecord.stats ?? input.stats)
  const perCorePercent = numberArray(stats.cpus)
  const memoryTotal = bytesFromGib(stats.m)
  const memoryUsed = bytesFromGib(stats.mu)
  const swapTotal = bytesFromGib(stats.s)
  const swapUsed = bytesFromGib(stats.su)
  const agentVersion = stringValue(info.v, stringValue(system.v, ''))
  const temperatureMap = Object.keys(asRecord(stats.t)).length ? stats.t : info.dt ? { temp: info.dt } : undefined

  return {
    cpu: {
      cores: numberValue(details.cores, numberValue(info.c, perCorePercent.length)),
      loadAverage: numberArray(stats.la).length ? numberArray(stats.la) : numberArray(info.la),
      model: stringValue(details.cpu, stringValue(info.m, 'unknown')),
      perCorePercent,
      usagePercent: numberValue(stats.cpu, numberValue(info.cpu))
    },
    disk: {
      usedPercent: numberValue(stats.dp, numberValue(info.dp))
    },
    hostname: stringValue(
      details.hostname,
      stringValue(info.h, stringValue(system.name, stringValue(system.host, 'unknown')))
    ),
    memory: {
      availableBytes: Math.max(0, memoryTotal - memoryUsed),
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapUsedPercent: numberValue(stats.sp, percentFromUsed(swapTotal, swapUsed)),
      totalBytes: memoryTotal || bytesFromGib(details.memory),
      usedBytes: memoryUsed,
      usedPercent: numberValue(stats.mp, numberValue(info.mp))
    },
    platform: osLabel(details.os_name ?? info.o ?? info.os),
    processCount: 0,
    processes: [],
    thermal: thermalArray(temperatureMap),
    timestamp: stringValue(
      statsRecord.created,
      stringValue(system.updated, stringValue(input.now, new Date().toISOString()))
    ),
    uptimeSeconds: numberValue(info.u, numberValue(input.uptimeSeconds)),
    version: agentVersion ? `beszel ${agentVersion}` : 'beszel'
  }
}

function normalizeLegacyHostMetrics(input: Record<string, unknown>): HostMetrics {
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
  const disk = normalizeDisk(input.fs ?? input.disk ?? input.filesystems)
  const processes = normalizeProcessList(input.processes, memoryTotal || numberValue(memory.totalBytes))

  return {
    cpu: {
      cores,
      loadAverage: [numberValue(load.min1), numberValue(load.min5), numberValue(load.min15)],
      model: stringValue(quicklook.cpu_name, stringValue(cpu.model, 'unknown')),
      perCorePercent,
      usagePercent: cpuUsagePercent || numberValue(cpu.usagePercent)
    },
    disk,
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
    processCount: numberValue(processcount.total, numberValue(input.processCount, processes.length)),
    processes,
    thermal: thermalArray(input.sensors ?? input.thermal),
    timestamp: stringValue(input.now, new Date().toISOString()),
    uptimeSeconds: parseUptimeSeconds(input.uptime ?? input.uptimeSeconds),
    version: stringValue(status.version, stringValue(input.version, 'legacy'))
  }
}

export function normalizeHostMetrics(value: unknown): HostMetrics {
  const input = asRecord(value)
  return isBeszelPayload(input) ? normalizeBeszelHostMetrics(input) : normalizeLegacyHostMetrics(input)
}

function collectionRecordsUrl(config: HostMonitorConfig, collection: string, params: Record<string, string>): string {
  const url = new URL(`${config.metricsUrl}/${collection}/records`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function fetchJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  const response = await fetcher(url, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Beszel host monitor returned HTTP ${response.status} for ${new URL(url).pathname}`)
  }
  return response.json()
}

function pocketBaseItems(value: unknown): unknown[] {
  const payload = asRecord(value)
  return Array.isArray(payload.items) ? payload.items : []
}

async function fetchCollectionRecords(
  config: HostMonitorConfig,
  collection: string,
  params: Record<string, string>,
  fetcher: typeof fetch
): Promise<unknown[]> {
  const url = collectionRecordsUrl(config, collection, params)
  return pocketBaseItems(await fetchJson(url, fetcher))
}

export async function fetchHostMetrics(
  config: HostMonitorConfig = hostMonitorConfig(),
  fetcher: typeof fetch = fetch
): Promise<HostMetrics> {
  let systems = await fetchCollectionRecords(
    config,
    BESZEL_COLLECTIONS.systems,
    { filter: 'status="up"', perPage: '1', sort: '-updated' },
    fetcher
  )

  if (!systems.length) {
    systems = await fetchCollectionRecords(
      config,
      BESZEL_COLLECTIONS.systems,
      { perPage: '1', sort: '-updated' },
      fetcher
    )
  }

  const system = systems[0]
  const systemId = stringValue(asRecord(system).id, '')
  if (!system || !systemId) {
    throw new Error('Beszel host monitor did not return any systems')
  }

  let statsRecords: unknown[] = []
  try {
    statsRecords = await fetchCollectionRecords(
      config,
      BESZEL_COLLECTIONS.systemStats,
      { fields: 'created,stats,system', filter: `system="${systemId}"`, perPage: '1', sort: '-created' },
      fetcher
    )
  } catch {
    statsRecords = []
  }

  return normalizeHostMetrics({
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
