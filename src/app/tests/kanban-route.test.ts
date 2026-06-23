import { describe, expect, it } from 'vitest'
import appShellSource from '../AppShell.svelte?raw'
import appNavbarSource from '../navigation/AppNavbar.svelte?raw'
import kanbanPageSource from '../kanban/KanbanPage.svelte?raw'
import { kanbanRoute } from '../router.svelte'

describe('Kanban top-level route', () => {
  it('exposes a first-class /kanban route helper', () => {
    expect((kanbanRoute as () => string)()).toBe('/kanban')
  })

  it('mounts the Kanban page from the app shell', () => {
    expect(appShellSource).toContain("import KanbanPage from './kanban/KanbanPage.svelte'")
    expect(appShellSource).toContain("appRouterState.page === 'kanban'")
    expect(appShellSource).toContain('<KanbanPage />')
  })

  it('adds KANBAN to the primary nav without losing CMD session routing', () => {
    expect(appNavbarSource).toContain("label: 'KANBAN'")
    expect(appNavbarSource).toContain('kanbanRoute()')
    expect(appNavbarSource).toContain('agentRoute(sessionState.storedSessionId)')
  })

  it('renders board controls, draggable cards, vertical status groups, and a detail pane contract', () => {
    expect(kanbanPageSource).toContain('loadKanbanBoards')
    expect(kanbanPageSource).toContain('loadKanbanBoard')
    expect(kanbanPageSource).toContain('overflow-y-auto bg-chat-scroll/40 p-3 md:overflow-hidden md:p-4')
    expect(kanbanPageSource).toContain('grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]')
    expect(kanbanPageSource).toContain('title="Grouped cards"')
    expect(kanbanPageSource).toContain('h-full min-h-0 space-y-3 overflow-auto pr-1')
    expect(kanbanPageSource).toContain('aria-label={`${statusLabel(column.name)} grouped cards`}')
    expect(kanbanPageSource).toContain('md:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)]')
    expect(kanbanPageSource).not.toContain('overflow-x-auto')
    expect(kanbanPageSource).not.toContain('w-72 shrink-0')
    expect(kanbanPageSource).toContain('draggable="true"')
    expect(kanbanPageSource).toContain('ondrop=')
    expect(kanbanPageSource).toContain('data-kanban-column')
    expect(kanbanPageSource).toContain('Card detail')
    expect(kanbanPageSource).toContain('Linked session')
    expect(kanbanPageSource).toContain('Activity')
  })

  it('collapses Review into Blocked instead of exposing a separate review lane', () => {
    expect(kanbanPageSource).toContain('kanbanDisplayStatus')
    expect(kanbanPageSource).not.toContain("review: 'Review'")
    expect(kanbanPageSource).not.toContain("'review', 'done'")
    expect(kanbanPageSource).not.toContain("marker === 'review'")
  })

  it('preserves board, tenant, and profile context for detail and mutations', () => {
    expect(kanbanPageSource).toContain(
      'getKanbanTask(selectedTaskId, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })'
    )
    expect(kanbanPageSource).toContain(
      'updateKanbanTaskStatus(taskId, status as KanbanStatus, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })'
    )
    expect(kanbanPageSource).toContain(
      "addKanbanComment(selectedTaskId, body, { author: 'desktop', board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })"
    )
  })
})
