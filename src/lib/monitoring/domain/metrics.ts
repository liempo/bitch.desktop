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

export interface HostThermalZone {
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

export const BYTES_PER_GIB = 1024 ** 3

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
