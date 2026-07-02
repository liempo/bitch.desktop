// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'

import RemoteTranscriptTabs from '../../../components/conversation/RemoteTranscriptTabs.svelte'
import { buildRemoteToolTranscript, type RemoteToolTranscript } from '$lib/hermes/conversations/domain/tool-transcripts'

function transcript(
  id: string,
  command: string,
  stdout: string,
  options: { maxVisibleLines?: number } = {}
): RemoteToolTranscript {
  const built = buildRemoteToolTranscript(
    'session-1',
    {
      context: command,
      id,
      name: id.includes('code') ? 'execute_code' : 'terminal',
      status: 'complete',
      stdout,
      summary: stdout
    },
    options
  )

  if (!built) throw new Error('expected transcript')
  return built
}

describe('RemoteTranscriptTabs component', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('keeps the selected transcript tab stable when transcript data refreshes', async () => {
    const first = transcript('terminal-a', 'npm run test', 'alpha output')
    const second = transcript('code-b', 'python check.py', 'beta output')

    const { rerender } = render(RemoteTranscriptTabs, {
      props: { transcripts: [first, second] }
    })

    await fireEvent.click(screen.getByRole('tab', { name: /execute code.*python check\.py/i }))
    await rerender({
      transcripts: [first, transcript('code-b', 'python check.py', 'beta output refreshed')]
    })

    expect(screen.getByRole('tab', { name: /execute code.*python check\.py/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByRole('tabpanel', { name: /execute code.*python check\.py/i })).toHaveTextContent(
      'beta output refreshed'
    )
    expect(screen.getByRole('tabpanel', { name: /execute code.*python check\.py/i })).not.toHaveTextContent(
      'alpha output'
    )
  })

  it('reselects a transcript when a tool row requests the same tab again', async () => {
    const first = transcript('terminal-a', 'npm run test', 'alpha output')
    const second = transcript('code-b', 'python check.py', 'beta output')

    const { rerender } = render(RemoteTranscriptTabs, {
      props: { requestedTranscriptId: first.id, requestedTranscriptSequence: 1, transcripts: [first, second] }
    })

    await fireEvent.click(screen.getByRole('tab', { name: /execute code.*python check\.py/i }))
    expect(screen.getByRole('tab', { name: /execute code.*python check\.py/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    await rerender({ requestedTranscriptId: first.id, requestedTranscriptSequence: 2, transcripts: [first, second] })

    expect(screen.getByRole('tab', { name: /terminal.*npm run test/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: /terminal.*npm run test/i })).toHaveTextContent('alpha output')
  })

  it('renders clipped large scrollback while explaining that copy keeps the full transcript', () => {
    const longOutput = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')
    render(RemoteTranscriptTabs, {
      props: { transcripts: [transcript('terminal-a', 'npm run test', longOutput, { maxVisibleLines: 3 })] }
    })

    const panel = screen.getByRole('tabpanel', { name: /terminal.*npm run test/i })
    expect(panel).toHaveTextContent('Showing last 3 of 8 lines')
    expect(panel).toHaveTextContent('copy keeps the full scrollback')
    expect(panel).toHaveTextContent('line 6')
    expect(panel).toHaveTextContent('line 8')
    expect(panel).not.toHaveTextContent('line 1')
  })

  it('copies the full transcript text even when visible scrollback is clipped', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText }
    })

    const longOutput = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join('\n')
    const clipped = transcript('terminal-a', 'npm run test', longOutput, { maxVisibleLines: 3 })
    render(RemoteTranscriptTabs, { props: { transcripts: [clipped] } })

    await fireEvent.click(
      within(screen.getByRole('tabpanel', { name: /terminal.*npm run test/i })).getByRole('button', {
        name: 'Copy transcript'
      })
    )

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('line 1'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('line 8'))
  })
})
