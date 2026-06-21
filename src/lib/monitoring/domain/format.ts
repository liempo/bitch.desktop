import type { HostProcessMetrics, HostProcessSortDirection, HostProcessSortKey } from './metrics'

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
