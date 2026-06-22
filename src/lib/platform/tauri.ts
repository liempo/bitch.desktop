import { invoke } from '@tauri-apps/api/core'
import { listen, type Event as TauriEvent, type UnlistenFn } from '@tauri-apps/api/event'

export type { TauriEvent, UnlistenFn }

type TauriCommandArgs = Record<string, unknown> | undefined

export function invokeTauriCommand<T>(command: string, args?: TauriCommandArgs): Promise<T> {
  return invoke<T>(command, args)
}

export function listenTauriEvent<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<UnlistenFn> {
  return listen<T>(event, handler)
}

export function openExternalUrl(url: string): Promise<void> {
  return invokeTauriCommand<void>('open_external_url', { url })
}
