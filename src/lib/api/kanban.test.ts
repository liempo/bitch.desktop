import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

import {
  addKanbanComment,
  getKanbanBoard,
  getKanbanTask,
  listKanbanBoards,
  updateKanbanTaskStatus
} from '$lib/api/kanban'

describe('Kanban dashboard API client', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
  })

  it('lists boards through the authenticated plugin route for the active profile', async () => {
    mockInvoke.mockResolvedValueOnce({ boards: [], current: 'homelab' })

    await expect(listKanbanBoards('remote/profile')).resolves.toEqual({ boards: [], current: 'homelab' })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'GET',
        path: '/api/plugins/kanban/boards',
        profile: 'remote/profile'
      }
    })
  })

  it('loads a board with board and tenant filters preserved in the query string', async () => {
    mockInvoke.mockResolvedValueOnce({ columns: [], tenants: ['bitch'], assignees: [], latest_event_id: 9, now: 10 })

    await getKanbanBoard({ board: 'homelab', tenant: 'bitch', profile: 'default' })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'GET',
        path: '/api/plugins/kanban/board?board=homelab&tenant=bitch',
        profile: 'default'
      }
    })
  })

  it('loads task detail without dropping board, tenant, or profile context', async () => {
    mockInvoke.mockResolvedValueOnce({
      task: { id: 't_1' },
      comments: [],
      events: [],
      links: { parents: [], children: [] },
      runs: [],
      attachments: []
    })

    await getKanbanTask('t_1', { board: 'homelab', profile: 'ops', tenant: 'bitch' })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: undefined,
        method: 'GET',
        path: '/api/plugins/kanban/tasks/t_1?board=homelab&tenant=bitch',
        profile: 'ops'
      }
    })
  })

  it('patches task status with optional block reason without dropping tenant context', async () => {
    mockInvoke.mockResolvedValueOnce({ task: { id: 't_1', status: 'blocked' } })

    await updateKanbanTaskStatus('t_1', 'blocked', {
      board: 'homelab',
      profile: 'ops',
      tenant: 'bitch',
      blockReason: 'review gate'
    })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: { block_reason: 'review gate', status: 'blocked' },
        method: 'PATCH',
        path: '/api/plugins/kanban/tasks/t_1?board=homelab&tenant=bitch',
        profile: 'ops'
      }
    })
  })

  it('adds comments without dropping board, tenant, or profile context', async () => {
    mockInvoke.mockResolvedValueOnce({ ok: true })

    await addKanbanComment('t_1', 'ship it', { board: 'homelab', profile: 'ops', tenant: 'bitch', author: 'desktop' })

    expect(mockInvoke).toHaveBeenCalledWith('dashboard_request', {
      request: {
        body: { author: 'desktop', body: 'ship it' },
        method: 'POST',
        path: '/api/plugins/kanban/tasks/t_1/comments?board=homelab&tenant=bitch',
        profile: 'ops'
      }
    })
  })
})
