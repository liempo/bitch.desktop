import { describe, expect, it } from 'vitest'
import appShellSource from '../AppShell.svelte?raw'
import appNavbarSource from '../navigation/AppNavbar.svelte?raw'
import kanbanCardDetailsPanelSource from '../kanban/KanbanCardDetailsPanel.svelte?raw'
import kanbanPageSource from '../kanban/KanbanPage.svelte?raw'
import { kanbanRoute } from '../router.svelte'

describe('Kanban top-level route', () => {
  it('exposes a first-class /kanban route helper', () => {
    expect((kanbanRoute as () => string)()).toBe('/kanban')
  })

  it('mounts the Kanban page from the app shell', () => {
    expect(appShellSource).toContain("kanban: () => import('./kanban/KanbanPage.svelte')")
    expect(appShellSource).toContain('loadPageComponent(appRouterState.page)')
    expect(appShellSource).toContain('<PageComponent />')
  })

  it('adds KANBAN to the primary nav without losing CMD session routing', () => {
    expect(appNavbarSource).toContain("label: 'KANBAN'")
    expect(appNavbarSource).toContain('kanbanRoute()')
    expect(appNavbarSource).toContain('agentRoute(sessionState.storedSessionId)')
  })

  it('renders header filters, panel-wrapped draggable cards, accordion status groups, and a detail pane contract', () => {
    expect(kanbanPageSource).toContain('loadKanbanBoards')
    expect(kanbanPageSource).toContain('loadKanbanBoard')
    expect(kanbanPageSource).toContain('overflow-y-auto bg-chat-scroll/40 p-3 md:overflow-hidden md:p-4')
    expect(kanbanPageSource).toContain('md:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]')
    expect(kanbanPageSource).toContain('title="Cards"')
    expect(kanbanPageSource).toContain('{#snippet actions()}')
    expect(kanbanPageSource).toContain('contentClass="flex min-h-0 flex-col overflow-hidden p-1"')
    expect(kanbanPageSource).toContain('aria-label={`${statusLabel(column.name)} grouped cards`}')
    expect(kanbanPageSource).toContain('aria-expanded={columnOpen}')
    expect(kanbanPageSource).toContain('visibleColumns')
    expect(kanbanPageSource).toContain('taskCardClass(task)')
    expect(kanbanPageSource).not.toContain('title="Kanban Board"')
    expect(kanbanPageSource).not.toContain('overflow-x-auto')
    expect(kanbanPageSource).not.toContain('w-72 shrink-0')
    expect(kanbanPageSource).toContain('draggable="true"')
    expect(kanbanPageSource).toContain('ondrop=')
    expect(kanbanPageSource).toContain('data-kanban-column')
    expect(kanbanPageSource).toContain('aria-label="Kanban card details panel"')
    expect(kanbanPageSource).toContain('bind:open={detailDialogOpen}')
    expect(kanbanPageSource).toContain('class="w-[min(38rem,calc(100vw-2rem))] md:hidden"')
    expect(kanbanCardDetailsPanelSource).toContain("title = 'DETAIL'")
    expect(kanbanCardDetailsPanelSource).toContain('leading={onClose ? closeAction : undefined}')
    expect(kanbanCardDetailsPanelSource).toContain('Linked session')
    expect(kanbanCardDetailsPanelSource).toContain('Activity')
  })

  it('exposes Review as a first-class lane between Running and Blocked without redundant card status tags', () => {
    expect(kanbanPageSource).toContain("review: 'Review'")
    expect(kanbanPageSource).toContain("'ready', 'review', 'blocked'")
    expect(kanbanPageSource).toContain("displayStatus === 'blocked'")
    expect(kanbanPageSource).toContain("displayStatus === 'running'")
    expect(kanbanPageSource).toContain('bg-danger/10')
    expect(kanbanPageSource).toContain('bg-primary/5')
    expect(kanbanPageSource).not.toContain("return 'blocked'")
    expect(kanbanPageSource).not.toContain("return 'review'")
    expect(kanbanPageSource).not.toContain("return 'in progress'")
  })

  it('uses compact popover menu filters instead of native selects for page dropdowns', () => {
    expect(kanbanPageSource).toContain("import { Popover } from 'bits-ui'")
    expect(kanbanPageSource).toContain('Current profile: ${selectedProfileLabel}')
    expect(kanbanPageSource).toContain('Current board: ${selectedBoardLabel}')
    expect(kanbanPageSource).toContain('Current tenant: ${selectedTenantLabel}')
    expect(kanbanPageSource).toContain("import BracketTrigger from '@/app/components/ui/BracketTrigger.svelte'")
    expect(kanbanPageSource).toContain('<BracketTrigger {...props} label="PROFILE" value={selectedProfileLabel} />')
    expect(kanbanPageSource).toContain('<BracketTrigger {...props} label="BOARD" value={selectedBoardLabel}')
    expect(kanbanPageSource).toContain('<BracketTrigger {...props} label="TENANT" value={selectedTenantLabel} />')
    expect(kanbanPageSource).not.toContain('profile:{selectedProfileLabel}')
    expect(kanbanPageSource).not.toContain('board:{selectedBoardLabel}')
    expect(kanbanPageSource).not.toContain('tenant:{selectedTenantLabel}')
    expect(kanbanPageSource).not.toContain('<select')
  })

  it('defaults to all profiles and filters loaded cards locally by profile', () => {
    expect(kanbanPageSource).toContain("let selectedProfile = $state('all')")
    expect(kanbanPageSource).toContain("selectedProfile = 'all'")
    expect(kanbanPageSource).toContain("const names = new Set<string>(['all', selectedProfile || 'all'])")
    expect(kanbanPageSource).toContain('taskProfile(task)')
    expect(kanbanPageSource).toContain('taskMatchesProfileFilter(task)')
    expect(kanbanPageSource).toContain(
      "return selectedProfile === 'all' || taskProfile(task) === normalizeProfileKey(selectedProfile)"
    )
    expect(kanbanPageSource).toContain(
      'columns.map(column => ({ ...column, tasks: column.tasks.filter(task => taskMatchesProfileFilter(task)) }))'
    )
    expect(kanbanPageSource).toContain('requestProfile')
  })

  it('preserves board, tenant, and active gateway profile context for detail and mutations', () => {
    expect(kanbanPageSource).toContain(
      'getKanbanTask(taskId, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })'
    )
    expect(kanbanPageSource).toContain(
      'updateKanbanTaskStatus(taskId, status as KanbanStatus, { board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })'
    )
    expect(kanbanPageSource).toContain(
      "addKanbanComment(selectedTaskId, body, { author: 'desktop', board: selectedBoard, profile: profileContext(), tenant: tenantFilter || null })"
    )
  })
})
