import { describe, expect, it } from 'vitest'

import {
  commandNotFoundMessage,
  commandPairs,
  isReloadMcpCommand,
  parseCommandDispatch,
  parseSlashCommand,
  renderSlashOutput,
  shouldDispatchSlashImmediately,
  slashExecCommand
} from '$lib/composer/slash-commands'

describe('composer slash command helpers', () => {
  it('flattens catalog categories before top-level pairs and removes duplicate commands', () => {
    expect(
      commandPairs({
        categories: [
          {
            name: 'session',
            pairs: [
              ['/compact', 'compact context'],
              ['/reset', 'reset session']
            ]
          },
          {
            name: 'tools',
            pairs: [
              ['/mcp', 'show MCP'],
              ['/compact', 'duplicate compact']
            ]
          }
        ],
        pairs: [
          ['/new', 'new session'],
          ['/mcp', 'duplicate mcp'],
          ['', 'skip empty command']
        ]
      })
    ).toEqual([
      { category: 'session', command: '/compact', description: 'compact context' },
      { category: 'session', command: '/reset', description: 'reset session' },
      { category: 'tools', command: '/mcp', description: 'show MCP' },
      { command: '/new', description: 'new session' }
    ])
  })

  it('normalizes slash command names and preserves trimmed arguments', () => {
    expect(parseSlashCommand('///profile   crypto   ')).toEqual({ name: 'profile', arg: 'crypto' })
    expect(parseSlashCommand('/compact')).toEqual({ name: 'compact', arg: '' })
    expect(slashExecCommand('///reload-mcp now')).toBe('reload-mcp now')
  })

  it('recognizes reload-mcp spelling variants', () => {
    expect(isReloadMcpCommand('/reload-mcp')).toBe(true)
    expect(isReloadMcpCommand('reload_mcp --profile default')).toBe(true)
    expect(isReloadMcpCommand('/reload')).toBe(false)
  })

  it('parses command dispatch responses defensively', () => {
    expect(parseCommandDispatch({ type: 'exec', output: 'ok' })).toEqual({ type: 'exec', output: 'ok' })
    expect(parseCommandDispatch({ type: 'plugin', output: 42 })).toEqual({ type: 'plugin', output: undefined })
    expect(parseCommandDispatch({ type: 'alias', target: '/model gpt' })).toEqual({
      type: 'alias',
      target: '/model gpt'
    })
    expect(parseCommandDispatch({ type: 'alias', target: '' })).toBeNull()
    expect(parseCommandDispatch({ type: 'skill', name: 'github', notice: 'loaded' })).toEqual({
      type: 'skill',
      name: 'github',
      notice: 'loaded',
      message: undefined
    })
    expect(parseCommandDispatch({ type: 'send', message: 'posted' })).toEqual({
      type: 'send',
      message: 'posted',
      notice: undefined
    })
    expect(parseCommandDispatch(null)).toBeNull()
  })

  it('formats slash output and command dispatch policy without store state', () => {
    expect(renderSlashOutput('/compact', { warning: 'slow', output: 'done' })).toBe(
      'slash:/compact\nwarning: slow\ndone'
    )
    expect(renderSlashOutput('/noop', { output: '   ' })).toBe('slash:/noop\n(no output)')
    expect(commandNotFoundMessage('wat')).toBe('Command not found: /wat')
    expect(shouldDispatchSlashImmediately('  /goal status', true)).toBe(true)
    expect(shouldDispatchSlashImmediately('plain prompt', true)).toBe(false)
  })
})
