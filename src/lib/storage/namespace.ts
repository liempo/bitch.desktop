const STORAGE_NAMESPACE = 'bitch'

const LEGACY_STORAGE_NAMESPACE = ['bitch', 'desktop'].join('.')

export function namespacedStorageKey(suffix: string): string {
  return `${STORAGE_NAMESPACE}.${suffix}`
}

function legacyNamespacedStorageKey(suffix: string): string {
  return `${LEGACY_STORAGE_NAMESPACE}.${suffix}`
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage

  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

export function readNamespacedStorageItem(suffix: string, storage?: Storage): null | string {
  const target = resolveStorage(storage)
  if (!target) return null

  try {
    const currentKey = namespacedStorageKey(suffix)
    const legacyKey = legacyNamespacedStorageKey(suffix)
    const currentValue = target.getItem(currentKey)

    if (currentValue != null) {
      target.removeItem(legacyKey)
      return currentValue
    }

    const legacyValue = target.getItem(legacyKey)

    if (legacyValue != null) {
      target.setItem(currentKey, legacyValue)
      target.removeItem(legacyKey)
    }

    return legacyValue
  } catch {
    return null
  }
}

export function writeNamespacedStorageItem(suffix: string, value: string, storage?: Storage): void {
  const target = resolveStorage(storage)
  if (!target) return

  try {
    target.setItem(namespacedStorageKey(suffix), value)
    target.removeItem(legacyNamespacedStorageKey(suffix))
  } catch {
    // Storage can be full, blocked, or unavailable. Persistence is best-effort.
  }
}

export function removeNamespacedStorageItem(suffix: string, storage?: Storage): void {
  const target = resolveStorage(storage)
  if (!target) return

  try {
    target.removeItem(namespacedStorageKey(suffix))
    target.removeItem(legacyNamespacedStorageKey(suffix))
  } catch {
    // Storage can be blocked or unavailable. Persistence is best-effort.
  }
}
