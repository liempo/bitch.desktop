import { describe, expect, it } from 'vitest'

import agentShellSource from './AgentShell.svelte?raw'
import sessionBranchBarSource from './SessionBranchBar.svelte?raw'
import composerStoreSource from '$lib/stores/composer.svelte?raw'

describe('SessionBranchBar source contract', () => {
  it('is wired into the thread shell with the selected session and loaded related sessions', () => {
    expect(agentShellSource).toContain('SessionBranchBar')
    expect(agentShellSource).toContain('session={selectedSession}')
    expect(agentShellSource).toContain('relatedSessions={sessionState.sessions}')
  })

  it('exposes branch creation through the shared branch store action', () => {
    expect(sessionBranchBarSource).toContain('branchSession(')
    expect(sessionBranchBarSource).toContain('aria-label="Fork current session"')
    expect(sessionBranchBarSource).toContain('Fork session')
  })

  it('shows parentage and related branch navigation controls in the thread chrome', () => {
    expect(sessionBranchBarSource).toContain('parentSessionForSession')
    expect(sessionBranchBarSource).toContain('branchChildrenForSession')
    expect(sessionBranchBarSource).toContain('selectSession(parentSession.id)')
    expect(sessionBranchBarSource).toContain('aria-label="Open parent session"')
    expect(sessionBranchBarSource).toContain('aria-label={`Open branch ${relatedBranchTitle(child)}`}')
  })

  it('routes /branch and /fork through the branch action instead of slash.exec', () => {
    expect(composerStoreSource).toContain("normalizedName === 'branch' || normalizedName === 'fork'")
    expect(composerStoreSource).toContain('branchSession(')
  })
})
