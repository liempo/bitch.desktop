export interface PanelWidthConfig {
  readonly defaultWidth: number
  readonly maxWidth: number
  readonly minWidth: number
  readonly storageKey: string
}

export const SESSION_SIDEBAR_WIDTH: PanelWidthConfig = {
  defaultWidth: 256,
  maxWidth: 480,
  minWidth: 256,
  storageKey: 'bitch.desktop.agent.sidebarWidth'
}

export const PREVIEW_PANEL_WIDTH: PanelWidthConfig = {
  defaultWidth: 320,
  maxWidth: 704,
  minWidth: 320,
  storageKey: 'bitch.desktop.agent.previewWidth'
}

export function clampPanelWidth(width: number, config: PanelWidthConfig): number {
  if (!Number.isFinite(width)) return config.defaultWidth

  return Math.min(config.maxWidth, Math.max(config.minWidth, Math.round(width)))
}

export function readPanelWidth(config: PanelWidthConfig, storage = globalThis.localStorage): number {
  if (!storage) return config.defaultWidth

  const stored = storage.getItem(config.storageKey)
  if (!stored) return config.defaultWidth

  return clampPanelWidth(Number(stored), config)
}

export function writePanelWidth(width: number, config: PanelWidthConfig, storage = globalThis.localStorage): void {
  if (!storage) return

  storage.setItem(config.storageKey, String(clampPanelWidth(width, config)))
}

export function panelWidthStyle(cssVariable: string, width: number): string {
  return `${cssVariable}: ${Math.round(width)}px`
}
