import type { ComposerAttachment } from '../view-models/composer.svelte'
import {
  readNamespacedStorageItem,
  removeNamespacedStorageItem,
  writeNamespacedStorageItem
} from '$lib/storage/namespace'

export interface QueuedPromptEntry {
  attachments: ComposerAttachment[]
  id: string
  queuedAt: number
  text: string
}

export interface AutoDrainSettleInput {
  isBusy: boolean
  queueLength: number
  userInterrupted: boolean
  wasBusy: boolean
}

type QueueState = Record<string, QueuedPromptEntry[]>
type QueueSubscriber = (state: QueueState) => void

const STORAGE_SUFFIX = 'composerQueue.v1'

let queuedPromptsBySession = loadQueue()
const subscribers = new Set<QueueSubscriber>()

function loadQueue(): QueueState {
  if (typeof window === 'undefined') return {}

  try {
    const raw = readNamespacedStorageItem(STORAGE_SUFFIX, window.localStorage)
    const parsed = raw ? JSON.parse(raw) : null

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return parsed as QueueState
  } catch {
    return {}
  }
}

function saveQueue(state: QueueState): void {
  if (typeof window === 'undefined') return

  try {
    if (Object.keys(state).length === 0) {
      removeNamespacedStorageItem(STORAGE_SUFFIX, window.localStorage)
    } else {
      writeNamespacedStorageItem(STORAGE_SUFFIX, JSON.stringify(state), window.localStorage)
    }
  } catch {
    // Storage can be full or unavailable. Keep the in-memory queue alive.
  }
}

function cloneAttachment(attachment: ComposerAttachment): ComposerAttachment {
  return { ...attachment }
}

function cloneEntry(entry: QueuedPromptEntry): QueuedPromptEntry {
  return {
    ...entry,
    attachments: entry.attachments.map(cloneAttachment)
  }
}

function cloneState(state: QueueState): QueueState {
  return Object.fromEntries(Object.entries(state).map(([key, queue]) => [key, queue.map(cloneEntry)]))
}

function sessionKeyOf(key: null | string | undefined): null | string {
  const trimmed = key?.trim()
  return trimmed ? trimmed : null
}

function queueFor(sessionKey: string): QueuedPromptEntry[] {
  return queuedPromptsBySession[sessionKey] ?? []
}

function writeSession(sessionKey: string, queue: QueuedPromptEntry[]): void {
  const next = { ...queuedPromptsBySession }

  if (queue.length === 0) {
    delete next[sessionKey]
  } else {
    next[sessionKey] = queue.map(cloneEntry)
  }

  queuedPromptsBySession = next
  saveQueue(next)
  emitQueue()
}

function emitQueue(): void {
  const snapshot = cloneState(queuedPromptsBySession)

  for (const subscriber of subscribers) {
    subscriber(snapshot)
  }
}

function nextId(): string {
  return `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function subscribeQueuedPrompts(subscriber: QueueSubscriber): () => void {
  subscribers.add(subscriber)
  subscriber(cloneState(queuedPromptsBySession))

  return () => {
    subscribers.delete(subscriber)
  }
}

export function getQueuedPromptState(): QueueState {
  return cloneState(queuedPromptsBySession)
}

export function getQueuedPrompts(key: null | string | undefined): QueuedPromptEntry[] {
  const sessionKey = sessionKeyOf(key)
  return sessionKey ? queueFor(sessionKey).map(cloneEntry) : []
}

export function enqueueQueuedPrompt(
  key: null | string | undefined,
  payload: { attachments: ComposerAttachment[]; text: string }
): null | QueuedPromptEntry {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return null

  const entry: QueuedPromptEntry = {
    attachments: payload.attachments.map(cloneAttachment),
    id: nextId(),
    queuedAt: Date.now(),
    text: payload.text
  }

  writeSession(sessionKey, [...queueFor(sessionKey), entry])
  return cloneEntry(entry)
}

export function dequeueQueuedPrompt(key: null | string | undefined): null | QueuedPromptEntry {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return null

  const [head, ...rest] = queueFor(sessionKey)
  if (!head) return null

  writeSession(sessionKey, rest)
  return cloneEntry(head)
}

export function removeQueuedPrompt(key: null | string | undefined, id: string): boolean {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return false

  const queue = queueFor(sessionKey)
  const next = queue.filter(entry => entry.id !== id)

  if (next.length === queue.length) return false

  writeSession(sessionKey, next)
  return true
}

export function updateQueuedPrompt(
  key: null | string | undefined,
  id: string,
  patch: { attachments?: ComposerAttachment[]; text?: string }
): boolean {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return false

  const queue = queueFor(sessionKey)
  const index = queue.findIndex(entry => entry.id === id)
  if (index < 0) return false

  const next = queue.map((entry, entryIndex) =>
    entryIndex === index
      ? {
          ...entry,
          ...(patch.text !== undefined ? { text: patch.text } : {}),
          ...(patch.attachments !== undefined ? { attachments: patch.attachments.map(cloneAttachment) } : {})
        }
      : entry
  )

  writeSession(sessionKey, next)
  return true
}

export function moveQueuedPrompt(key: null | string | undefined, id: string, direction: 'down' | 'up'): boolean {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey) return false

  const queue = queueFor(sessionKey)
  const index = queue.findIndex(entry => entry.id === id)
  if (index < 0) return false

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= queue.length) return false

  const next = queue.slice()
  const [entry] = next.splice(index, 1)
  if (!entry) return false
  next.splice(targetIndex, 0, entry)

  writeSession(sessionKey, next)
  return true
}

export function clearQueuedPrompts(key: null | string | undefined): void {
  const sessionKey = sessionKeyOf(key)
  if (!sessionKey || !(sessionKey in queuedPromptsBySession)) return

  writeSession(sessionKey, [])
}

export function shouldAutoDrainOnSettle(params: AutoDrainSettleInput): boolean {
  const { isBusy, queueLength, userInterrupted, wasBusy } = params

  if (isBusy || !wasBusy) return false
  if (userInterrupted) return false

  return queueLength > 0
}
