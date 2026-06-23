import { describe, expect, it, vi } from 'vitest'

import {
  namespacedStorageKey,
  readNamespacedStorageItem,
  removeNamespacedStorageItem,
  writeNamespacedStorageItem
} from '../../storage/namespace'

function legacyStorageKey(suffix: string): string {
  return `${['bitch', 'desktop'].join('.')}.${suffix}`
}

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

describe('namespaced storage helpers', () => {
  it('uses the BITCH namespace for new storage keys', () => {
    expect(namespacedStorageKey('composerQueue.v1')).toBe('bitch.composerQueue.v1')
  })

  it('migrates legacy desktop-qualified values on read', () => {
    const suffix = 'profileOrder'
    const storage = storageStub({ [legacyStorageKey(suffix)]: '["default"]' })

    expect(readNamespacedStorageItem(suffix, storage)).toBe('["default"]')
    expect(storage.setItem).toHaveBeenCalledWith(namespacedStorageKey(suffix), '["default"]')
    expect(storage.removeItem).toHaveBeenCalledWith(legacyStorageKey(suffix))
    expect(storage.getItem(namespacedStorageKey(suffix))).toBe('["default"]')
    expect(storage.getItem(legacyStorageKey(suffix))).toBeNull()
  })

  it('prefers current values and cleans up stale legacy keys', () => {
    const suffix = 'showAllProfiles'
    const storage = storageStub({ [legacyStorageKey(suffix)]: 'false', [namespacedStorageKey(suffix)]: 'true' })

    expect(readNamespacedStorageItem(suffix, storage)).toBe('true')
    expect(storage.removeItem).toHaveBeenCalledWith(legacyStorageKey(suffix))
  })

  it('writes and removes only through the current namespace while cleaning legacy keys', () => {
    const suffix = 'composerQueue.v1'
    const storage = storageStub({ [legacyStorageKey(suffix)]: '{"old":[]}' })

    writeNamespacedStorageItem(suffix, '{"new":[]}', storage)
    expect(storage.getItem(namespacedStorageKey(suffix))).toBe('{"new":[]}')
    expect(storage.getItem(legacyStorageKey(suffix))).toBeNull()

    removeNamespacedStorageItem(suffix, storage)
    expect(storage.getItem(namespacedStorageKey(suffix))).toBeNull()
    expect(storage.getItem(legacyStorageKey(suffix))).toBeNull()
  })
})
