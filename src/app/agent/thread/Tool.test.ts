import { describe, expect, it } from 'vitest'

import toolSource from './Tool.svelte?raw'

describe('delegate tool nested progress source contract', () => {
  it('renders compact nested subagent rows only when delegate subtasks exist', () => {
    expect(toolSource).toContain('delegateSubtasks')
    expect(toolSource).toContain('{#if delegateSubtasks.length > 0}')
    expect(toolSource).toContain('Subtasks')
    expect(toolSource).toContain('subagentStatusLabel')
    expect(toolSource).toContain('Queued')
    expect(toolSource).toContain('subagentOutputTail')
  })
})
