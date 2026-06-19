import { namespacedStorageKey, readNamespacedStorageItem, writeNamespacedStorageItem } from '$lib/storage/namespace'

export interface PanelWidthConfig {
  readonly defaultWidth: number
  readonly maxWidth: number
  readonly minWidth: number
  readonly storageKey: string
  readonly storageSuffix: string
}

const SESSION_SIDEBAR_WIDTH_STORAGE_SUFFIX = 'agent.sidebarWidth'
const PREVIEW_PANEL_WIDTH_STORAGE_SUFFIX = 'agent.previewWidth'

export const SESSION_SIDEBAR_WIDTH: PanelWidthConfig = {
  defaultWidth: 256,
  maxWidth: 480,
  minWidth: 256,
  storageKey: namespacedStorageKey(SESSION_SIDEBAR_WIDTH_STORAGE_SUFFIX),
  storageSuffix: SESSION_SIDEBAR_WIDTH_STORAGE_SUFFIX
}

export const PREVIEW_PANEL_WIDTH: PanelWidthConfig = {
  defaultWidth: 320,
  maxWidth: 704,
  minWidth: 320,
  storageKey: namespacedStorageKey(PREVIEW_PANEL_WIDTH_STORAGE_SUFFIX),
  storageSuffix: PREVIEW_PANEL_WIDTH_STORAGE_SUFFIX
}

export function clampPanelWidth(width: number, config: PanelWidthConfig): number {
  if (!Number.isFinite(width)) return config.defaultWidth

  return Math.min(config.maxWidth, Math.max(config.minWidth, Math.round(width)))
}

export function readPanelWidth(config: PanelWidthConfig, storage?: Storage): number {
  const stored = storage
    ? readNamespacedStorageItem(config.storageSuffix, storage)
    : arguments.length > 1
      ? null
      : readNamespacedStorageItem(config.storageSuffix)
  if (!stored) return config.defaultWidth

  return clampPanelWidth(Number(stored), config)
}

export function writePanelWidth(width: number, config: PanelWidthConfig, storage?: Storage): void {
  if (!storage && arguments.length > 2) return

  writeNamespacedStorageItem(config.storageSuffix, String(clampPanelWidth(width, config)), storage)
}

export function panelWidthStyle(cssVariable: string, width: number): string {
  return `${cssVariable}: ${Math.round(width)}px`
}
