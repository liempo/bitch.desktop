import { describe, expect, it, vi } from 'vitest'

import {
  PREVIEW_PANEL_WIDTH,
  SESSION_SIDEBAR_WIDTH,
  clampPanelWidth,
  panelWidthStyle,
  readPanelWidth,
  writePanelWidth
} from '../../layout/panel-resize'

function storageStub(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))

  return {
    get length() {
      return values.size
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    })
  }
}

function legacyStorageKey(suffix: string): string {
  return `${['bitch', 'desktop'].join('.')}.${suffix}`
}

describe('panel resize width helpers', () => {
  it('defaults both side panels to their minimum supported widths', () => {
    expect(SESSION_SIDEBAR_WIDTH.defaultWidth).toBe(SESSION_SIDEBAR_WIDTH.minWidth)
    expect(PREVIEW_PANEL_WIDTH.defaultWidth).toBe(PREVIEW_PANEL_WIDTH.minWidth)
  })

  it('clamps session sidebar and preview panel widths to their supported ranges', () => {
    expect(clampPanelWidth(120, SESSION_SIDEBAR_WIDTH)).toBe(256)
    expect(clampPanelWidth(999, SESSION_SIDEBAR_WIDTH)).toBe(480)
    expect(clampPanelWidth(321.7, SESSION_SIDEBAR_WIDTH)).toBe(322)

    expect(clampPanelWidth(240, PREVIEW_PANEL_WIDTH)).toBe(320)
    expect(clampPanelWidth(900, PREVIEW_PANEL_WIDTH)).toBe(704)
    expect(clampPanelWidth(Number.NaN, PREVIEW_PANEL_WIDTH)).toBe(PREVIEW_PANEL_WIDTH.minWidth)
  })

  it('reads persisted widths and falls back safely when storage is missing or invalid', () => {
    expect(readPanelWidth(SESSION_SIDEBAR_WIDTH, undefined)).toBe(SESSION_SIDEBAR_WIDTH.defaultWidth)
    expect(readPanelWidth(SESSION_SIDEBAR_WIDTH, storageStub({ [SESSION_SIDEBAR_WIDTH.storageKey]: '444' }))).toBe(444)
    expect(
      readPanelWidth(SESSION_SIDEBAR_WIDTH, storageStub({ [SESSION_SIDEBAR_WIDTH.storageKey]: 'not-a-number' }))
    ).toBe(SESSION_SIDEBAR_WIDTH.defaultWidth)
    expect(readPanelWidth(SESSION_SIDEBAR_WIDTH, storageStub({ [SESSION_SIDEBAR_WIDTH.storageKey]: '99' }))).toBe(256)
  })

  it('migrates legacy desktop-qualified width keys when reading persisted widths', () => {
    const storage = storageStub({ [legacyStorageKey(SESSION_SIDEBAR_WIDTH.storageSuffix)]: '444' })

    expect(readPanelWidth(SESSION_SIDEBAR_WIDTH, storage)).toBe(444)
    expect(storage.getItem(SESSION_SIDEBAR_WIDTH.storageKey)).toBe('444')
    expect(storage.getItem(legacyStorageKey(SESSION_SIDEBAR_WIDTH.storageSuffix))).toBeNull()
  })

  it('persists clamped widths and exposes CSS variable styles for Svelte panels', () => {
    const storage = storageStub()

    writePanelWidth(999, PREVIEW_PANEL_WIDTH, storage)

    expect(storage.setItem).toHaveBeenCalledWith(PREVIEW_PANEL_WIDTH.storageKey, '704')
    expect(panelWidthStyle('--agent-preview-width', 416)).toBe('--agent-preview-width: 416px')
  })
})
