// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import Conversation from '../../../components/conversation/Conversation.svelte'
import { messageState, type ConversationMessage } from '$lib/hermes/conversations'
import { promptsState } from '$lib/hermes/prompts'

const SESSION_ID = 'timeline-session'

function assistantTool(id: string) {
  return { id, name: 'terminal', status: 'complete' as const, summary: `tool ${id} complete` }
}

function seedConversation(messages: ConversationMessage[], needsInput = false): void {
  messageState.sessions[SESSION_ID] = {
    busy: false,
    currentAssistantId: null,
    error: null,
    hydrated: true,
    loading: false,
    messages,
    needsInput
  }
}

function timelineMessages(): ConversationMessage[] {
  const toolOne = assistantTool('tool-1')
  const toolTwo = assistantTool('tool-2')

  return [
    { id: 'u-1', role: 'user', text: 'Plan timeline rail', timestamp: 1, tools: [] },
    {
      id: 'a-1',
      parts: [
        { type: 'text', text: 'I will map the transcript.' },
        { type: 'tool', tool: toolOne },
        { type: 'tool', tool: toolTwo }
      ],
      role: 'assistant',
      text: 'I will map the transcript.',
      timestamp: 2,
      tools: [toolOne, toolTwo]
    },
    { id: 'a-2', role: 'assistant', text: '', timestamp: 3, tools: [], error: 'Gateway error: rate limit' },
    {
      attachments: [{ id: 'image-1', kind: 'image', label: 'screen.png', path: '/box/screen.png' }],
      id: 'u-2',
      role: 'user',
      text: 'Screenshot attached',
      timestamp: 4,
      tools: []
    }
  ]
}

describe('Conversation timeline rail', () => {
  beforeEach(() => {
    messageState.sessions = {}
    promptsState.approvalRequest = null
    promptsState.clarifyRequests = {}
    promptsState.error = null
    promptsState.submitting = null
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders transcript markers with accessible labels and stays collapsed on mobile', () => {
    seedConversation(timelineMessages(), true)
    promptsState.clarifyRequests[SESSION_ID] = {
      choices: ['A', 'B'],
      profile: null,
      question: 'Pick a path?',
      requestId: 'clarify-1',
      sessionId: SESSION_ID
    }

    render(Conversation, { props: { responsiveCompact: true, sessionId: SESSION_ID } })

    const rail = screen.getByRole('navigation', { name: 'Conversation timeline' })
    expect(rail).toHaveClass('hidden')
    expect(rail).toHaveClass('md:flex')
    expect(within(rail).getByRole('button', { name: /User prompt: Plan timeline rail/ })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: /Assistant reply: I will map the transcript/ })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: /Tool-heavy turn: 2 tools/ })).toBeInTheDocument()
    expect(
      within(rail).getByRole('button', { name: /Transcript error: Gateway error: rate limit/ })
    ).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: /Media reference: screen\.png/ })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: /Clarification needed/ })).toBeInTheDocument()
  })

  it('scrolls to message anchors and supports keyboard marker navigation', async () => {
    const user = userEvent.setup()
    const scrolledIds: string[] = []
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function scrollIntoView(this: HTMLElement) {
      scrolledIds.push(this.dataset.conversationMessageId ?? '')
    })

    seedConversation(timelineMessages(), true)
    promptsState.approvalRequest = {
      command: 'npm run test',
      description: 'Run validation',
      profile: null,
      sessionId: SESSION_ID
    }

    render(Conversation, { props: { responsiveCompact: true, sessionId: SESSION_ID } })

    const userMarker = screen.getByRole('button', { name: /User prompt: Plan timeline rail/ })
    const assistantMarker = screen.getByRole('button', { name: /Assistant reply: I will map the transcript/ })
    const promptMarker = screen.getByRole('button', { name: /Approval required/ })

    await user.click(userMarker)
    expect(scrolledIds.at(-1)).toBe('u-1')

    userMarker.focus()
    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(assistantMarker)

    await user.keyboard('{Enter}')
    expect(scrolledIds.at(-1)).toBe('a-1')

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(promptMarker)

    await user.keyboard('{Enter}')
    expect(scrolledIds.at(-1)).toBe('conversation-prompt')
  })
})
