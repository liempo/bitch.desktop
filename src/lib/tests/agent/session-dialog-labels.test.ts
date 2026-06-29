import { describe, expect, it } from 'vitest'
import type { SessionInfo } from '$lib/types/hermes'
import {
  compactSessionText,
  formatSessionDialogPreview,
  formatSessionDialogTitle,
  shortSessionId
} from '@/app/agent/sessions/session-labels'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    archived: false,
    ended_at: null,
    id: 'session-abcdef123456',
    input_tokens: 0,
    is_active: false,
    is_default_profile: true,
    last_active: 0,
    message_count: 0,
    model: null,
    output_tokens: 0,
    preview: null,
    profile: 'default',
    source: null,
    started_at: 0,
    title: null,
    tool_call_count: 0,
    ...overrides
  }
}

describe('agent mobile session dialog labels', () => {
  it('prefers the explicit title when one exists', () => {
    expect(formatSessionDialogTitle(session({ title: '  Build logs  ', preview: 'ignored' }))).toBe('Build logs')
  })

  it('uses the session preview instead of copying the sidebar Untitled fallback', () => {
    expect(formatSessionDialogTitle(session({ title: '   ', preview: ' first prompt\nsecond line ' }))).toBe(
      'first prompt second line'
    )
  })

  it('falls back to a stable session id label instead of Untitled session', () => {
    expect(formatSessionDialogTitle(session({ id: 'stored-session-123456789', title: '', preview: '' }))).toBe(
      'Session stored-s'
    )
  })

  it('omits duplicate preview copy when the preview already became the title', () => {
    const blankTitleSession = session({ title: '', preview: 'same copy' })

    expect(formatSessionDialogTitle(blankTitleSession)).toBe('same copy')
    expect(formatSessionDialogPreview(blankTitleSession)).toBe('same copy')
    expect(formatSessionDialogPreview(session({ title: 'same copy', preview: 'same copy' }))).toBe('')
  })

  it('compacts whitespace for dialog-safe labels', () => {
    expect(compactSessionText(' alpha\n\t beta  ')).toBe('alpha beta')
    expect(shortSessionId(' 1234567890 ')).toBe('12345678')
  })
})
