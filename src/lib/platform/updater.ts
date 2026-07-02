import { invokeTauriCommand } from '$lib/platform/tauri'

export interface SourceUpdateStatus {
  currentBranch?: string | null
  dirty: boolean
  headCommit?: string | null
  installPath: string
  mainCommit?: string | null
  sourceDir: string
  sourceExists: boolean
  updateAvailable: boolean
}

export interface SourceUpdateStepResult {
  label: string
  ok: boolean
  output: string
}

export interface SourceUpdateResult {
  installPath: string
  sourceDir: string
  steps: SourceUpdateStepResult[]
  updated: boolean
}

export function checkSourceUpdate(): Promise<SourceUpdateStatus> {
  return invokeTauriCommand<SourceUpdateStatus>('check_source_update')
}

export function runSourceUpdate(): Promise<SourceUpdateResult> {
  return invokeTauriCommand<SourceUpdateResult>('run_source_update')
}
