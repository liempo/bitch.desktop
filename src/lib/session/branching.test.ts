import { describe, expect, it } from 'vitest'

import {
  branchChildrenForSession,
  isBranchSession,
  nextBranchTitle,
  parentSessionForSession,
  relatedBranchTitle
} from './branching'
import type { SessionInfo } from '$lib/types/hermes'

function session(overrides: Partial<SessionInfo>): SessionInfo {
  return {
    archived: false,
    cwd: null,
    ended_at: null,
    id: 'session-id',
    input_tokens: 0,
    is_active: false,
    last_active: 100,
    message_count: 1,
    model: null,
    output_tokens: 0,
    preview: null,
    source: 'tui',
    started_at: 100,
    title: 'Session title',
    tool_call_count: 0,
    ...overrides
  }
}

describe('session branching helpers', () => {
  it('identifies visible branch sessions by their parent_session_id', () => {
    expect(isBranchSession(session({ id: 'branch', parent_session_id: 'parent' }))).toBe(true)
    expect(isBranchSession(session({ id: 'root', parent_session_id: null }))).toBe(false)
    expect(isBranchSession(session({ id: 'root' }))).toBe(false)
  })

  it('resolves parent and child branch rows from the loaded session index', () => {
    const parent = session({ id: 'parent', last_active: 100, title: 'Original job' })
    const olderChild = session({
      id: 'branch-old',
      last_active: 120,
      parent_session_id: 'parent',
      title: 'Original job #2'
    })
    const newerChild = session({
      id: 'branch-new',
      last_active: 180,
      parent_session_id: 'parent',
      title: 'Original job #3'
    })
    const unrelated = session({ id: 'other', last_active: 999, parent_session_id: 'different', title: 'Other branch' })
    const sessions = [unrelated, olderChild, parent, newerChild]

    expect(parentSessionForSession(newerChild, sessions)).toBe(parent)
    expect(branchChildrenForSession(parent, sessions)).toEqual([newerChild, olderChild])
  })

  it('uses stable titles for branch controls and the next fork label', () => {
    const parent = session({ id: 'parent', title: '  Named branch  ' })
    const firstChild = session({ id: 'branch-1', parent_session_id: 'parent', title: 'Named branch #2' })

    expect(relatedBranchTitle(parent)).toBe('Named branch')
    expect(relatedBranchTitle(session({ id: 'branch-2', title: null }))).toBe('branch-2')
    expect(nextBranchTitle(parent, [parent, firstChild])).toBe('Named branch #3')
  })
})
