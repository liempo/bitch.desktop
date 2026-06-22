import type { HostMetrics, HostThermalZone } from './metrics'
import { BYTES_PER_GIB } from './metrics'

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export function stringValue(value: unknown, fallback: string): string {
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
  return parsed > 0 ? parsed * BYTES_PER_GIB : 0
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
