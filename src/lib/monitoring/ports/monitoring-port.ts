export interface MonitoringConfig {
  baseUrl: string
  metricsUrl: string
  port: string
  systemId: string
}

export interface MonitoringEnv {
  systemId?: string
  url?: string
}

export type MonitoringRequestJson = (path: string) => Promise<unknown>
