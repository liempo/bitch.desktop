import { invokeTauriCommand } from '$lib/platform'

import type { HostMonitorConfig, HostMonitorEnv, HostMonitorRequestJson } from '../ports/monitoring-port'

const DEFAULT_MONITORING_URL = 'http://homestation:8090'
export const BESZEL_SYSTEM_DETAILS_FIELDS = 'hostname,kernel,cores,threads,cpu,os,os_name,arch,memory,podman'

export const BESZEL_COLLECTIONS = {
  systemDetails: 'system_details',
  systems: 'systems',
  systemStats: 'system_stats'
} as const

declare const __MONITORING_SYSTEM_ID__: string | undefined
declare const __MONITORING_URL__: string | undefined

function clean(value: string | undefined): string {
  return value?.trim() ?? ''
}

function configuredHostMonitorUrl(): string | undefined {
  return typeof __MONITORING_URL__ === 'undefined' ? undefined : __MONITORING_URL__
}

function configuredHostMonitorSystemId(): string | undefined {
  return typeof __MONITORING_SYSTEM_ID__ === 'undefined' ? undefined : __MONITORING_SYSTEM_ID__
}

function systemIdFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean)
  const systemIndex = parts.indexOf('system')
  return systemIndex >= 0 ? clean(parts[systemIndex + 1]) : ''
}

function normalizeHostMonitorUrl(url: string | undefined): { baseUrl: string; systemId: string } {
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

export function hostMonitorConfig(env: HostMonitorEnv = {}): HostMonitorConfig {
  const normalized = normalizeHostMonitorUrl(env.url ?? configuredHostMonitorUrl())
  const baseUrl = normalized.baseUrl
  const parsedUrl = new URL(baseUrl)
  const systemId = clean(env.systemId ?? configuredHostMonitorSystemId()) || normalized.systemId

  return {
    baseUrl,
    metricsUrl: `${baseUrl}/api/collections`,
    port: urlPort(parsedUrl),
    systemId
  }
}

export function collectionRecordsPath(collection: string, params: Record<string, string>): string {
  const url = new URL(`/api/collections/${collection}/records`, 'http://host-monitor.local')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return `${url.pathname}${url.search}`
}

export function collectionRecordPath(collection: string, id: string): string {
  return `/api/collections/${collection}/records/${encodeURIComponent(id)}`
}

export function collectionRecordFieldsPath(collection: string, id: string, fields: string): string {
  const url = new URL(collectionRecordPath(collection, id), 'http://host-monitor.local')
  url.searchParams.set('fields', fields)
  return `${url.pathname}${url.search}`
}

export const requestHostMonitorJson: HostMonitorRequestJson = async path =>
  invokeTauriCommand<unknown>('host_monitor_request', {
    request: {
      method: 'GET',
      path
    }
  })
