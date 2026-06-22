export interface HostMonitorConfig {
  baseUrl: string
  metricsUrl: string
  port: string
  systemId: string
}

export interface HostMonitorEnv {
  systemId?: string
  url?: string
}

export type HostMonitorRequestJson = (path: string) => Promise<unknown>
