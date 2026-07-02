import type { Page } from '@playwright/test'

interface TauriInvocationRecord {
  args?: Record<string, unknown>
  command: string
}

interface DashboardRequest {
  body?: unknown
  method?: string
  path?: string
  profile?: string
}

interface TauriMockWindow extends Window {
  __BITCH_TEST_TAURI_CALLS__: TauriInvocationRecord[]
  __TAURI_EVENT_PLUGIN_INTERNALS__: {
    unregisterListener: (event: string, eventId: number) => void
  }
  __TAURI_INTERNALS__: {
    convertFileSrc: (filePath: string, protocol?: string) => string
    invoke: (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>
    transformCallback: (callback: (...args: unknown[]) => unknown, once?: boolean) => number
    unregisterCallback: (id: number) => void
  }
}

export async function installTauriDashboardMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type CallbackRecord = { callback: (...args: unknown[]) => unknown; once: boolean }
    type InvocationRecord = { args?: Record<string, unknown>; command: string }
    type RequestShape = { body?: unknown; method?: string; path?: string; profile?: string }
    type MockWindow = Window &
      typeof globalThis & {
        __BITCH_TEST_TAURI_CALLS__: InvocationRecord[]
        __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: (event: string, eventId: number) => void }
        __TAURI_INTERNALS__: {
          convertFileSrc: (filePath: string, protocol?: string) => string
          invoke: (command: string, args?: Record<string, unknown>, options?: unknown) => Promise<unknown>
          transformCallback: (callback: (...args: unknown[]) => unknown, once?: boolean) => number
          unregisterCallback: (id: number) => void
        }
      }

    const mockWindow = window as MockWindow
    const callbacks = new Map<number, CallbackRecord>()
    let nextCallbackId = 1
    let nextEventId = 1

    function requestFromArgs(args?: Record<string, unknown>): RequestShape {
      const request = args?.request
      return request && typeof request === 'object' ? (request as RequestShape) : {}
    }

    function sessionsPage() {
      return {
        limit: 40,
        offset: 0,
        profile_totals: { default: 1 },
        sessions: [
          {
            ended_at: null,
            id: 'mock-session',
            input_tokens: 0,
            is_active: false,
            is_default_profile: true,
            last_active: 1_782_965_000,
            message_count: 1,
            model: 'mock/model',
            output_tokens: 0,
            preview: 'Mocked remote session for route smoke tests',
            profile: 'default',
            source: 'test',
            started_at: 1_782_965_000,
            title: 'Route smoke session',
            tool_call_count: 0
          }
        ],
        total: 1
      }
    }

    function remoteFileListing(path: string) {
      const rootEntries = [
        { isDirectory: true, name: 'opt', path: '/opt' },
        { isDirectory: true, name: 'box', path: '/box' },
        { isDirectory: false, name: 'report.md', path: '/opt/data/projects/report.md', size: 128 },
        { isDirectory: false, name: 'render.html', path: '/box/.hermes/cache/canvases/demo/render.html', size: 256 }
      ]

      return { entries: path === '/' ? rootEntries : [], path }
    }

    function dashboardResponse(request: RequestShape): unknown {
      const path = request.path ?? ''
      const url = new URL(path, 'http://bitch.test')

      if (url.pathname === '/api/profiles') {
        return {
          profiles: [
            {
              has_env: true,
              is_default: true,
              model: 'mock/model',
              name: 'default',
              path: '/box/.hermes',
              provider: 'mock',
              skill_count: 0
            }
          ]
        }
      }
      if (url.pathname === '/api/profiles/active') return { active: 'default', current: 'default' }
      if (url.pathname === '/api/model/info') return { model: 'mock/model', provider: 'mock' }
      if (url.pathname === '/api/model/options') {
        return {
          model: 'mock/model',
          provider: 'mock',
          providers: [{ models: ['mock/model'], name: 'Mock', slug: 'mock', total_models: 1 }]
        }
      }
      if (url.pathname === '/api/sessions' || url.pathname === '/api/profiles/sessions') return sessionsPage()
      if (url.pathname.endsWith('/messages')) return { messages: [], session_id: 'mock-session' }
      if (url.pathname === '/api/sessions/search') return { results: [] }
      if (url.pathname === '/api/cron/jobs') return []
      if (url.pathname === '/api/cron/delivery-targets') return { targets: [] }
      if (url.pathname === '/api/plugins/kanban/boards') {
        return {
          boards: [{ counts: { ready: 1, review: 1 }, name: 'Homelab', slug: 'homelab', total: 2 }],
          current: 'homelab'
        }
      }
      if (url.pathname === '/api/plugins/kanban/board') {
        return {
          assignees: ['default'],
          columns: [
            {
              name: 'ready',
              tasks: [
                {
                  assignee: 'default',
                  id: 't_route_ready',
                  status: 'ready',
                  tenant: 'bitch',
                  title: 'Route smoke ready card'
                }
              ]
            },
            {
              name: 'review',
              tasks: [
                {
                  assignee: 'default',
                  id: 't_route_review',
                  status: 'review',
                  tenant: 'bitch',
                  title: 'Route smoke review card'
                }
              ]
            }
          ],
          latest_event_id: 1,
          now: 1_782_965_000,
          tenants: ['bitch']
        }
      }
      if (url.pathname.startsWith('/api/plugins/kanban/tasks/')) {
        const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? 't_route_ready')
        return {
          attachments: [],
          comments: [],
          events: [],
          links: { children: [], parents: [] },
          runs: [],
          task: { assignee: 'default', id, status: 'ready', tenant: 'bitch', title: 'Route smoke ready card' }
        }
      }
      if (url.pathname === '/api/fs/list') return remoteFileListing(url.searchParams.get('path') ?? '/')
      if (url.pathname === '/api/fs/read-text')
        return { content: 'mock remote file preview', path: url.searchParams.get('path') ?? '/', truncated: false }
      if (url.pathname === '/api/fs/read-data-url' || url.pathname === '/api/files/read') {
        return {
          data_url: 'data:text/plain;base64,bW9jaw==',
          mime_type: 'text/plain',
          path: url.searchParams.get('path') ?? '/'
        }
      }
      if (url.pathname === '/api/fs/default-cwd') return { cwd: '/opt/data' }

      return {}
    }

    function monitoringResponse() {
      return {
        items: [
          {
            id: 'mock-system',
            info: { cpu: 6, m: 'Mock host', os: 'linux' },
            name: 'mock-system',
            status: 'up'
          }
        ]
      }
    }

    mockWindow.__BITCH_TEST_TAURI_CALLS__ = []
    mockWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => undefined
    }
    mockWindow.__TAURI_INTERNALS__ = {
      convertFileSrc: (filePath: string, protocol = 'asset') =>
        `${protocol}://localhost/${filePath.replace(/^\/+/, '')}`,
      invoke: async (command: string, args?: Record<string, unknown>) => {
        mockWindow.__BITCH_TEST_TAURI_CALLS__.push({ args, command })

        if (command === 'plugin:event|listen') return nextEventId++
        if (command === 'plugin:event|unlisten') return undefined
        if (command === 'connect_ws' || command === 'send_ws_message' || command === 'close_ws') return undefined
        if (command === 'dashboard_request') return dashboardResponse(requestFromArgs(args))
        if (command === 'monitoring_request') return monitoringResponse()
        if (command === 'get_caldav_config_status')
          return { configured: false, configurationHint: 'Mock CalDAV config missing.' }
        if (command === 'list_calendar_events') return []
        if (command === 'sync_calendar_events') return { ok: true, synced: 0 }
        if (command === 'open_external_url') return undefined
        if (command === 'plugin:notification|is_permission_granted') return true
        if (command === 'plugin:notification|request_permission') return 'granted'
        if (command === 'plugin:notification|notify') return undefined

        return {}
      },
      transformCallback: (callback: (...args: unknown[]) => unknown, once = false) => {
        const id = nextCallbackId++
        callbacks.set(id, { callback, once })
        return id
      },
      unregisterCallback: (id: number) => {
        callbacks.delete(id)
      }
    }
  })
}

export type { DashboardRequest, TauriInvocationRecord, TauriMockWindow }
