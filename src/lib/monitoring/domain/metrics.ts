interface MonitoringCpuMetrics {
  cores: number
  loadAverage: number[]
  model: string
  perCorePercent: number[]
  usagePercent: number
}

interface MonitoringMemoryMetrics {
  availableBytes: number
  swapTotalBytes: number
  swapUsedBytes: number
  swapUsedPercent: number
  totalBytes: number
  usedBytes: number
  usedPercent: number
}

interface MonitoringDiskMetrics {
  totalBytes: number
  usedBytes: number
  usedPercent: number
}

export interface MonitoringThermalZone {
  celsius: number
  label: string
}

export interface MonitoringContainerMetrics {
  cpuPercent: number
  id?: string
  image: string
  memoryBytes: number
  memoryPercent: number
  name: string
  ports: string
  status: string
}

export type MonitoringContainerSortKey = 'cpu' | 'memory'
export type MonitoringContainerSortDirection = 'asc' | 'desc'

export interface MonitoringMetrics {
  containerCount: number
  containers: MonitoringContainerMetrics[]
  cpu: MonitoringCpuMetrics
  disk: MonitoringDiskMetrics
  systemName: string
  memory: MonitoringMemoryMetrics
  platform: string
  thermal: MonitoringThermalZone[]
  timestamp: string
  uptimeSeconds: number
  version: string
}

export const BYTES_PER_GIB = 1024 ** 3

export const EMPTY_MONITORING_METRICS: MonitoringMetrics = {
  containerCount: 0,
  containers: [],
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
  systemName: 'unknown',
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
  thermal: [],
  timestamp: '',
  uptimeSeconds: 0,
  version: 'beszel'
}
