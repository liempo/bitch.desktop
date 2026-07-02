import { invokeTauriCommand } from '$lib/platform'

import type { MonitoringConfig, MonitoringEnv, MonitoringRequestJson } from '../ports/monitoring-port'

const DEFAULT_MONITORING_URL = 'http://homestation:8090'
export const BESZEL_CONTAINER_FIELDS = 'id,name,image,ports,cpu,memory,net,health,status,system,updated'
export const BESZEL_SYSTEM_DETAILS_FIELDS = 'hostname,kernel,cores,threads,cpu,os,os_name,arch,memory,podman'

export const BESZEL_COLLECTIONS = {
  containers: 'containers',
  systemDetails: 'system_details',
  systems: 'systems',
  systemStats: 'system_stats'
} as const

interface ResolvedMonitoringBridgeConfig {
  baseUrl: string
  systemId?: string | null
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function systemIdFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean)
  const systemIndex = parts.indexOf('system')
  return systemIndex >= 0 ? clean(parts[systemIndex + 1]) : ''
}

function normalizeMonitoringUrl(url: string | undefined): { baseUrl: string; systemId: string } {
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

export function monitoringConfig(env: MonitoringEnv = {}): MonitoringConfig {
  const normalized = normalizeMonitoringUrl(env.url)
  const baseUrl = normalized.baseUrl
  const parsedUrl = new URL(baseUrl)
  const systemId = clean(env.systemId) || normalized.systemId

  return {
    baseUrl,
    metricsUrl: `${baseUrl}/api/collections`,
    port: urlPort(parsedUrl),
    systemId
  }
}

export async function loadMonitoringConfig(): Promise<MonitoringConfig> {
  const config = await invokeTauriCommand<ResolvedMonitoringBridgeConfig>('get_monitoring_config')
  return monitoringConfig({
    systemId: config.systemId ?? undefined,
    url: config.baseUrl
  })
}

export function collectionRecordsPath(collection: string, params: Record<string, string>): string {
  const url = new URL(`/api/collections/${collection}/records`, 'http://monitoring.local')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}

export function collectionRecordPath(collection: string, id: string): string {
  return `/api/collections/${collection}/records/${encodeURIComponent(id)}`
}

export function collectionRecordFieldsPath(collection: string, id: string, fields: string): string {
  const url = new URL(collectionRecordPath(collection, id), 'http://monitoring.local')
  url.searchParams.set('fields', fields)
  return `${url.pathname}${url.search}`
}

export const requestMonitoringJson: MonitoringRequestJson = async path =>
  invokeTauriCommand<unknown>('monitoring_request', {
    request: {
      method: 'GET',
      path
    }
  })
