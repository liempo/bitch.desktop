import { describe, expect, it } from 'vitest'

import {
  extractConversationTimelineMarkers,
  type ConversationTimelineMessage
} from '../../../../hermes/conversations/domain/timeline'

function message(
  input: Partial<ConversationTimelineMessage> & Pick<ConversationTimelineMessage, 'id' | 'role'>
): ConversationTimelineMessage {
  return {
    id: input.id,
    role: input.role,
    text: input.text ?? '',
    tools: input.tools ?? [],
    attachments: input.attachments,
    canvas: input.canvas,
    error: input.error,
    parts: input.parts,
    pending: input.pending,
    reasoning: input.reasoning,
    timestamp: input.timestamp
  }
}

describe('conversation timeline marker extraction', () => {
  it('extracts prompt, assistant, tool-heavy, error, prompt-waiting, and media markers in transcript order', () => {
    const markers = extractConversationTimelineMarkers(
      [
        message({ id: 'u-1', role: 'user', text: 'Please inspect @file:/box/report.pdf' }),
        message({
          id: 'a-1',
          role: 'assistant',
          text: 'I will inspect it.',
          tools: [
            { id: 'tool-1', name: 'read_file', status: 'complete', summary: 'read report' },
            { id: 'tool-2', name: 'search_files', status: 'complete', summary: 'searched repo' },
            { id: 'tool-3', name: 'terminal', status: 'running', summary: 'running tests' }
          ]
        }),
        message({ id: 'a-2', role: 'assistant', error: 'Gateway error: rate limit', text: '' }),
        message({
          attachments: [{ id: 'media-1', kind: 'image', label: 'screen.png', path: '/box/screen.png' }],
          id: 'u-2',
          role: 'user',
          text: 'Use this screenshot'
        })
      ],
      { pendingPrompt: 'clarify' }
    )

    expect(markers.map(marker => `${marker.kind}:${marker.messageId}`)).toEqual([
      'user:u-1',
      'media:u-1',
      'assistant:a-1',
      'tool-heavy:a-1',
      'error:a-2',
      'user:u-2',
      'media:u-2',
      'clarify:conversation-prompt'
    ])
    expect(markers.find(marker => marker.kind === 'tool-heavy')).toMatchObject({
      description: '3 tools',
      label: 'Tool-heavy turn'
    })
    expect(markers.find(marker => marker.kind === 'clarify')).toMatchObject({
      label: 'Clarification needed'
    })
  })

  it('uses a configurable threshold for tool-heavy turns and ignores decorative system messages', () => {
    const markers = extractConversationTimelineMarkers(
      [
        message({ id: 'system-1', role: 'system', text: 'session started' }),
        message({
          id: 'a-1',
          role: 'assistant',
          text: 'one tool is not heavy',
          tools: [{ id: 'tool-1', name: 'read_file', status: 'complete', summary: 'read one file' }]
        }),
        message({
          id: 'a-2',
          role: 'assistant',
          text: 'two tools is heavy for this caller',
          tools: [
            { id: 'tool-2', name: 'read_file', status: 'complete', summary: 'read file' },
            { id: 'tool-3', name: 'terminal', status: 'complete', summary: 'ran tests' }
          ]
        })
      ],
      { toolHeavyThreshold: 2 }
    )

    expect(markers.map(marker => `${marker.kind}:${marker.messageId}`)).toEqual([
      'assistant:a-1',
      'assistant:a-2',
      'tool-heavy:a-2'
    ])
  })
})
