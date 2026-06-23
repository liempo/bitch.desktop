import { describe, expect, it } from 'vitest'
import appSource from '../../App.svelte?raw'
import agentShellSource from '../agent/AgentShell.svelte?raw'

describe('message stream route lifecycle', () => {
  it('keeps gateway message events subscribed at the app root instead of the AGENT-only shell', () => {
    expect(appSource).toContain('startMessageStream')
    expect(appSource).toContain('stopMessageStream')
    expect(agentShellSource).not.toContain('stopMessageStream')
  })
})
