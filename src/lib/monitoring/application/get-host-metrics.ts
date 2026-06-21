import {
  BESZEL_COLLECTIONS,
  BESZEL_SYSTEM_DETAILS_FIELDS,
  collectionRecordFieldsPath,
  collectionRecordPath,
  collectionRecordsPath,
  hostMonitorConfig,
  requestHostMonitorJson
} from '../adapters/beszel-monitoring-adapter'
import type { HostMetrics } from '../domain/metrics'
import { asRecord, normalizeHostMetrics, stringValue } from '../domain/normalize'
import type { HostMonitorConfig, HostMonitorRequestJson } from '../ports/monitoring-port'

function pocketBaseItems(value: unknown): unknown[] {
  const payload = asRecord(value)
  return Array.isArray(payload.items) ? payload.items : []
}

async function fetchCollectionRecords(
  collection: string,
  params: Record<string, string>,
  requestJson: HostMonitorRequestJson
): Promise<unknown[]> {
  return pocketBaseItems(await requestJson(collectionRecordsPath(collection, params)))
}

function hostMonitorAuthHint(): string {
  return 'Set MONITORING_AUTH_TOKEN or MONITORING_EMAIL/MONITORING_PASSWORD, and set MONITORING_SYSTEM_ID to target a specific Beszel system.'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function fetchConfiguredSystem(config: HostMonitorConfig, requestJson: HostMonitorRequestJson): Promise<unknown> {
  try {
    return await requestJson(collectionRecordPath(BESZEL_COLLECTIONS.systems, config.systemId))
  } catch (error) {
    throw new Error(
      `Beszel system "${config.systemId}" is not visible to the app. Check MONITORING_SYSTEM_ID and Beszel auth. ${hostMonitorAuthHint()} ${errorMessage(error)}`
    )
  }
}

async function fetchSystemDetails(systemId: string, requestJson: HostMonitorRequestJson): Promise<unknown | undefined> {
  if (!systemId) return undefined

  try {
    return await requestJson(
      collectionRecordFieldsPath(BESZEL_COLLECTIONS.systemDetails, systemId, BESZEL_SYSTEM_DETAILS_FIELDS)
    )
  } catch {
    return undefined
  }
}

async function fetchVisibleSystem(requestJson: HostMonitorRequestJson): Promise<unknown> {
  let systems = await fetchCollectionRecords(
    BESZEL_COLLECTIONS.systems,
    { filter: 'status="up"', perPage: '1', sort: '-updated' },
    requestJson
  )

  if (!systems.length) {
    systems = await fetchCollectionRecords(BESZEL_COLLECTIONS.systems, { perPage: '1', sort: '-updated' }, requestJson)
  }

  const system = systems[0]
  const systemId = stringValue(asRecord(system).id, '')
  if (!system || !systemId) {
    throw new Error(
      `Beszel host monitor did not return any visible systems. The hub can be healthy while PocketBase records remain hidden from unauthenticated requests. ${hostMonitorAuthHint()}`
    )
  }

  return system
}

export async function fetchHostMetrics(
  config: HostMonitorConfig = hostMonitorConfig(),
  requestJson: HostMonitorRequestJson = requestHostMonitorJson
): Promise<HostMetrics> {
  const system = config.systemId
    ? await fetchConfiguredSystem(config, requestJson)
    : await fetchVisibleSystem(requestJson)
  const systemId = stringValue(asRecord(system).id, '')

  const [statsResult, detailsResult] = await Promise.allSettled([
    fetchCollectionRecords(
      BESZEL_COLLECTIONS.systemStats,
      { fields: 'created,stats,system', filter: `system="${systemId}"`, perPage: '1', sort: '-created' },
      requestJson
    ),
    fetchSystemDetails(systemId, requestJson)
  ])
  const statsRecords = statsResult.status === 'fulfilled' ? statsResult.value : []
  const details = detailsResult.status === 'fulfilled' ? detailsResult.value : undefined

  return normalizeHostMetrics({
    details,
    now: new Date().toISOString(),
    statsRecord: statsRecords[0],
    system
  })
}
