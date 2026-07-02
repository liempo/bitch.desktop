// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AgentSessionRow from '../../../agent/sessions/components/AgentSessionRow.svelte'
import type { SessionInfo, SessionSearchResult } from '$lib/types/hermes'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  document.body.removeAttribute('style')
})

function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    ended_at: null,
    id: 'session-alpha',
    input_tokens: 120,
    is_active: false,
    last_active: Date.now(),
    message_count: 4,
    model: 'gpt-5.5',
    output_tokens: 64,
    preview: 'Investigate sidebar labels',
    source: 'cli',
    started_at: Date.now(),
    title: null,
    tool_call_count: 1,
    ...overrides
  }
}

function searchResult(overrides: Partial<SessionSearchResult> = {}): SessionSearchResult {
  return {
    model: 'gpt-5.5',
    preview: 'matched session preview',
    profile: 'astra',
    role: 'assistant',
    session_id: 'search-hit',
    session_started: Date.now(),
    snippet: 'matching snippet',
    source: 'cli',
    title: null,
    ...overrides
  }
}

describe('AgentSessionRow UI', () => {
  it('uses stable fallback labels and state badges for sidebar sessions', () => {
    const handleSelect = vi.fn()

    render(AgentSessionRow, {
      active: true,
      needsInput: true,
      onSelect: handleSelect,
      pinned: true,
      session: session({ preview: '  Label from preview\nwith whitespace  ' }),
      working: true
    })

    const rowButton = screen.getByRole('button', { name: /Label from preview with whitespace/i })
    expect(rowButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('PIN')).toBeInTheDocument()
    expect(screen.getByText('INPUT')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Session thinking' })).toBeInTheDocument()
  })

  it('renders search results with matched previews, profile tags, and selectable buttons', async () => {
    const user = userEvent.setup()
    const handleSelect = vi.fn()

    render(AgentSessionRow, {
      onSelect: handleSelect,
      searchResult: searchResult({ preview: ' matching\nquery text ', title: 'Search hit title' })
    })

    const rowButton = screen.getByRole('button', { name: /Search hit title/i })
    expect(screen.getByText('matching query text')).toBeInTheDocument()
    expect(screen.getByText('ASTRA')).toBeInTheDocument()

    await user.click(rowButton)

    expect(handleSelect).toHaveBeenCalledWith('search-hit')
  })
})
