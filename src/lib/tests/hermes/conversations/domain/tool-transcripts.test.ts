import { describe, expect, it } from 'vitest'

import {
  buildRemoteToolTranscript,
  extractRemoteToolTranscriptsFromMessages,
  remoteToolTranscriptFieldsFromPayload
} from '$lib/hermes/conversations/domain/tool-transcripts'
import type { ConversationMessage } from '$lib/hermes/conversations'

describe('remote tool transcript extraction', () => {
  it('builds a read-only transcript preserving command, streams, exit status, and timestamps', () => {
    const transcript = buildRemoteToolTranscript('session-1', {
      completedAt: 1_782_975_000,
      context: 'npm run test',
      exitStatus: 0,
      id: 'tool-1',
      name: 'terminal',
      startedAt: 1_782_974_900,
      status: 'complete',
      stderr: 'warn: mocked stderr\n',
      summary: 'ran tests',
      stdout: 'pass: mocked stdout\n'
    })

    expect(transcript).toMatchObject({
      command: 'npm run test',
      completedAt: 1_782_975_000,
      exitStatus: 0,
      id: 'session-1:tool-1',
      startedAt: 1_782_974_900,
      status: 'complete',
      toolId: 'tool-1',
      toolName: 'terminal'
    })
    expect(transcript?.chunks).toEqual([
      { stream: 'stdout', text: 'pass: mocked stdout\n' },
      { stream: 'stderr', text: 'warn: mocked stderr\n' }
    ])
    expect(transcript?.copyText).toContain('$ npm run test')
    expect(transcript?.copyText).toContain('[stdout]\npass: mocked stdout')
    expect(transcript?.copyText).toContain('[stderr]\nwarn: mocked stderr')
    expect(transcript?.copyText).toContain('[exit] 0')
  })

  it('extracts stable per-session transcripts from conversation tool rows', () => {
    const messages: ConversationMessage[] = [
      {
        id: 'message-1',
        parts: [],
        role: 'assistant',
        text: '',
        tools: [
          {
            completedAt: 1_782_975_010,
            context: 'bash scripts/check.sh',
            exitStatus: 2,
            id: 'tool-a',
            name: 'terminal',
            output: 'legacy stdout fallback',
            status: 'complete',
            summary: 'ran check'
          }
        ]
      }
    ]

    const transcripts = extractRemoteToolTranscriptsFromMessages('stored-session', messages)

    expect(transcripts).toHaveLength(1)
    expect(transcripts[0]).toMatchObject({
      command: 'bash scripts/check.sh',
      exitStatus: 2,
      id: 'stored-session:tool-a',
      toolId: 'tool-a'
    })
    expect(transcripts[0]?.copyText).toContain('legacy stdout fallback')
  })

  it('clips visible scrollback to the newest lines while keeping full copy text', () => {
    const stdout = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')

    const transcript = buildRemoteToolTranscript(
      'session-1',
      {
        id: 'tool-1',
        name: 'terminal',
        status: 'complete',
        stdout,
        summary: 'long output'
      },
      { maxVisibleLines: 3 }
    )

    expect(transcript?.clippedLineCount).toBe(5)
    expect(transcript?.visibleText).toContain('line 6')
    expect(transcript?.visibleText).toContain('line 8')
    expect(transcript?.visibleText).not.toContain('line 1')
    expect(transcript?.copyText).toContain('line 1')
    expect(transcript?.copyText).toContain('line 8')
  })

  it('normalizes stdout, stderr, exit status, and timestamp fields from gateway payloads', () => {
    expect(
      remoteToolTranscriptFieldsFromPayload({
        exit_code: 17,
        stderr: 'permission denied',
        stdout: 'starting',
        timestamp: 1_782_975_123
      })
    ).toEqual({
      exitStatus: 17,
      stderr: 'permission denied',
      stdout: 'starting',
      timestamp: 1_782_975_123
    })
  })
})
