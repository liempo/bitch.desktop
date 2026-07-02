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
  __BITCH_TEST_SCENARIO__?: string
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
    type MockScenario = 'cron-error' | 'cron-loading' | 'default'
    type RequestShape = { body?: unknown; method?: string; path?: string; profile?: string }
    type MockWindow = Window &
      typeof globalThis & {
        __BITCH_TEST_SCENARIO__?: string
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
    const eventListeners = new Map<string, number[]>()
    let nextCallbackId = 1

    function scenario(): MockScenario {
      const value = mockWindow.__BITCH_TEST_SCENARIO__
      return value === 'cron-error' || value === 'cron-loading' ? value : 'default'
    }

    function requestFromArgs(args?: Record<string, unknown>): RequestShape {
      const request = args?.request
      return request && typeof request === 'object' ? (request as RequestShape) : {}
    }

    function sleep(ms: number): Promise<void> {
      return new Promise(resolve => window.setTimeout(resolve, ms))
    }

    function runCallback(id: number, data: unknown): void {
      const record = callbacks.get(id)
      if (!record) return
      record.callback(data)
      if (record.once) callbacks.delete(id)
    }

    function listenToEvent(args?: Record<string, unknown>): number {
      const event = typeof args?.event === 'string' ? args.event : ''
      const handler = typeof args?.handler === 'number' ? args.handler : 0
      if (!event || !handler) return handler
      eventListeners.set(event, [...(eventListeners.get(event) ?? []), handler])
      return handler
    }

    function unlistenFromEvent(args?: Record<string, unknown>): void {
      const event = typeof args?.event === 'string' ? args.event : ''
      const id = typeof args?.id === 'number' ? args.id : 0
      if (!event || !id) return
      eventListeners.set(
        event,
        (eventListeners.get(event) ?? []).filter(handler => handler !== id)
      )
    }

    function emitTauriEvent(event: string, payload: unknown): void {
      for (const handler of eventListeners.get(event) ?? []) {
        runCallback(handler, { event, id: handler, payload })
      }
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
            preview: 'Mocked remote session for route interaction tests',
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

    function sessionMessages(sessionId = 'mock-session') {
      return {
        messages: [
          {
            content: 'Mocked stored conversation rendered from the dashboard session API.',
            role: 'user',
            timestamp: 1_782_965_000
          },
          {
            content: 'Mock assistant response for route-level interaction coverage.',
            role: 'assistant',
            timestamp: 1_782_965_010
          }
        ],
        session_id: sessionId
      }
    }

    function calendarEvent() {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0)
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0)

      return {
        allDay: false,
        calendarName: 'Mock Remote Calendar',
        description: 'Mocked remote event loaded through the Tauri CalDAV lane. https://calendar.example/e2e',
        endsAt: end.toISOString(),
        location: 'Mock Board Room',
        sourceUrl: 'https://calendar.example/e2e',
        startsAt: start.toISOString(),
        title: 'Calendar E2E Standup',
        uid: 'calendar-e2e-standup'
      }
    }

    function cronJobs() {
      return [
        {
          deliver: 'local',
          enabled: true,
          id: 'mock-nightly-route-test',
          last_error: 'mock cron explosion',
          last_status: 'failed',
          name: 'Mock nightly route test',
          next_run_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          no_agent: false,
          profile: 'default',
          prompt: 'Exercise mocked route UI coverage.',
          schedule: { display: 'nightly at 02:00', expr: '0 2 * * *', kind: 'cron' },
          schedule_display: 'nightly at 02:00',
          state: 'scheduled'
        }
      ]
    }

    function kanbanReadyTask() {
      return {
        age: { created_age_seconds: 120 },
        assignee: 'default',
        body: 'Mocked route-level Kanban detail body.',
        comment_count: 1,
        created_at: 1_782_965_000,
        id: 't_route_ready',
        priority: 960,
        profile: 'default',
        status: 'ready',
        tenant: 'bitch',
        title: 'Route UI ready card',
        workspace_kind: 'dir',
        workspace_path: '/box/.hermes/workspace/bitch'
      }
    }

    function kanbanReviewTask() {
      return {
        age: { created_age_seconds: 240 },
        assignee: 'reviewer',
        body: 'Mocked review-lane card for UI coverage.',
        id: 't_route_review',
        priority: 500,
        profile: 'reviewer',
        status: 'review',
        tenant: 'bitch',
        title: 'Route UI review card'
      }
    }

    function remoteFileListing(path: string) {
      const rootEntries = [
        { isDirectory: true, name: 'opt', path: '/opt' },
        { isDirectory: true, name: 'box', path: '/box' },
        { isDirectory: false, name: 'report.md', path: '/opt/data/projects/report.md', size: 128 },
        { isDirectory: false, name: 'render.html', path: '/box/.hermes/cache/canvases/demo/render.html', size: 256 }
      ]

      const nestedListings: Record<string, unknown[]> = {
        '/box': [{ isDirectory: true, name: '.hermes', path: '/box/.hermes' }],
        '/box/.hermes': [{ isDirectory: true, name: 'cache', path: '/box/.hermes/cache' }],
        '/box/.hermes/cache': [{ isDirectory: true, name: 'canvases', path: '/box/.hermes/cache/canvases' }],
        '/box/.hermes/cache/canvases': [{ isDirectory: true, name: 'demo', path: '/box/.hermes/cache/canvases/demo' }],
        '/box/.hermes/cache/canvases/demo': [
          { isDirectory: false, name: 'render.html', path: '/box/.hermes/cache/canvases/demo/render.html', size: 256 }
        ],
        '/opt': [{ isDirectory: true, name: 'data', path: '/opt/data' }],
        '/opt/data': [{ isDirectory: true, name: 'projects', path: '/opt/data/projects' }],
        '/opt/data/projects': [
          { isDirectory: false, name: 'report.md', path: '/opt/data/projects/report.md', size: 128 }
        ]
      }

      return { entries: path === '/' ? rootEntries : (nestedListings[path] ?? []), path }
    }

    function dataUrlForRemotePath(path: string): string {
      if (path.endsWith('/render.html')) {
        return `data:text/html;base64,${btoa('<!doctype html><html><body><h1>Mock canvas preview</h1></body></html>')}`
      }

      return `data:text/plain;base64,${btoa(`mock data for ${path}`)}`
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
            },
            {
              has_env: true,
              is_default: false,
              model: 'mock/reviewer',
              name: 'reviewer',
              path: '/box/.hermes/profiles/reviewer',
              provider: 'mock',
              skill_count: 1
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
      if (url.pathname.endsWith('/messages'))
        return sessionMessages(decodeURIComponent(url.pathname.split('/').at(-2) ?? 'mock-session'))
      if (url.pathname === '/api/sessions/search') return { results: [] }
      if (url.pathname === '/api/cron/jobs') return cronJobs()
      if (url.pathname.match(/^\/api\/cron\/jobs\/[^/]+\/runs$/)) {
        return {
          limit: 5,
          runs: [
            {
              ended_at: 1_782_965_060,
              id: 'mock-cron-run-session',
              input_tokens: 12,
              is_active: false,
              last_active: 1_782_965_060,
              message_count: 2,
              model: 'mock/model',
              output_tokens: 24,
              preview: 'Mock route UI run output.',
              profile: 'default',
              source: 'cron',
              started_at: 1_782_965_000,
              title: 'Mock cron run',
              tool_call_count: 0
            }
          ]
        }
      }
      if (url.pathname === '/api/cron/delivery-targets') {
        return { targets: [{ home_target_set: true, id: 'local', name: 'Local only' }] }
      }
      if (url.pathname === '/api/plugins/kanban/boards') {
        return {
          boards: [{ counts: { ready: 1, review: 1 }, is_current: true, name: 'Homelab', slug: 'homelab', total: 2 }],
          current: 'homelab'
        }
      }
      if (url.pathname === '/api/plugins/kanban/board') {
        return {
          assignees: ['default', 'reviewer'],
          columns: [
            { name: 'ready', tasks: [kanbanReadyTask()] },
            { name: 'review', tasks: [kanbanReviewTask()] }
          ],
          latest_event_id: 42,
          now: 1_782_965_500,
          tenants: ['bitch']
        }
      }
      if (url.pathname.startsWith('/api/plugins/kanban/tasks/')) {
        const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? 't_route_ready')
        const task = id === 't_route_review' ? kanbanReviewTask() : kanbanReadyTask()
        return {
          attachments: [],
          comments: [
            { author: 'desktop', body: 'Mock comment for UI coverage.', created_at: 1_782_965_100, id: 1, task_id: id }
          ],
          events: [{ created_at: 1_782_965_000, id: 1, kind: 'created', payload: { source: 'ui-test' }, task_id: id }],
          links: { children: [], parents: ['t_parent'] },
          runs: [],
          task: { ...task, id }
        }
      }
      if (url.pathname === '/api/fs/list') return remoteFileListing(url.searchParams.get('path') ?? '/')
      if (url.pathname === '/api/fs/read-text') {
        const remotePath = url.searchParams.get('path') ?? '/'
        return {
          binary: false,
          content: `mock remote file preview for ${remotePath}`,
          path: remotePath,
          text: `mock remote file preview for ${remotePath}`,
          truncated: false
        }
      }
      if (url.pathname === '/api/fs/read-data-url' || url.pathname === '/api/files/read') {
        const remotePath = url.searchParams.get('path') ?? '/'
        return {
          data_url: dataUrlForRemotePath(remotePath),
          dataUrl: dataUrlForRemotePath(remotePath),
          mime_type: remotePath.endsWith('.html') ? 'text/html' : 'text/plain',
          path: remotePath
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

    function gatewayResponse(method: string, params: Record<string, unknown>): unknown {
      if (method === 'session.info') {
        return {
          model: 'mock/model',
          provider: 'mock',
          running: false,
          usage: { calls: 1, input: 1, output: 1, total: 2 }
        }
      }
      if (method === 'session.resume') {
        return {
          info: { model: 'mock/model', provider: 'mock', running: false },
          message_count: 2,
          messages: sessionMessages(String(params.session_id ?? 'mock-session')).messages,
          resumed: String(params.session_id ?? 'mock-session'),
          session_id: 'mock-runtime-session'
        }
      }
      if (method === 'session.create') {
        return {
          info: { model: 'mock/model', provider: 'mock', running: false },
          message_count: 0,
          messages: [],
          session_id: 'mock-runtime-new-session',
          stored_session_id: 'mock-new-session'
        }
      }
      if (method === 'commands.catalog') return { commands: [] }
      if (method === 'profile.switch' || method === 'profile.activate' || method === 'session.close')
        return { ok: true }
      return { ok: true }
    }

    function handleGatewayFrame(args?: Record<string, unknown>): void {
      const connectionId = typeof args?.connectionId === 'string' ? args.connectionId : ''
      const rawMessage = typeof args?.message === 'string' ? args.message : '{}'

      try {
        const frame = JSON.parse(rawMessage) as {
          id?: number | string
          method?: string
          params?: Record<string, unknown>
        }
        const response = {
          id: frame.id,
          jsonrpc: '2.0',
          result: gatewayResponse(frame.method ?? '', frame.params ?? {})
        }
        window.setTimeout(() => emitTauriEvent('ws-message', { connectionId, message: JSON.stringify(response) }), 0)
      } catch {
        window.setTimeout(
          () => emitTauriEvent('ws-error', { connectionId, message: 'Mock gateway received malformed JSON' }),
          0
        )
      }
    }

    mockWindow.__BITCH_TEST_TAURI_CALLS__ = []
    mockWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event: string, eventId: number) => unlistenFromEvent({ event, id: eventId })
    }
    mockWindow.__TAURI_INTERNALS__ = {
      convertFileSrc: (filePath: string, protocol = 'asset') =>
        `${protocol}://localhost/${filePath.replace(/^\/+/, '')}`,
      invoke: async (command: string, args?: Record<string, unknown>) => {
        mockWindow.__BITCH_TEST_TAURI_CALLS__.push({ args, command })

        if (command === 'plugin:event|listen') return listenToEvent(args)
        if (command === 'plugin:event|unlisten') return unlistenFromEvent(args)
        if (command === 'connect_ws') {
          const connectionId = typeof args?.connectionId === 'string' ? args.connectionId : ''
          window.setTimeout(() => emitTauriEvent('ws-open', { connectionId }), 0)
          return undefined
        }
        if (command === 'send_ws_message') return handleGatewayFrame(args)
        if (command === 'close_ws') return undefined
        if (command === 'resolve_connection')
          return { authMode: 'token', baseUrl: 'http://127.0.0.1:9119', profile: args?.profile ?? 'default' }
        if (command === 'dashboard_request') {
          const request = requestFromArgs(args)
          if (scenario() === 'cron-error' && request.path?.startsWith('/api/cron/jobs')) {
            throw new Error('Mock cron backend offline')
          }
          if (scenario() === 'cron-loading' && request.path?.startsWith('/api/cron/jobs')) {
            await sleep(3000)
          }
          return dashboardResponse(request)
        }
        if (command === 'monitoring_request') return monitoringResponse()
        if (command === 'get_caldav_config_status') {
          return {
            cachedSources: 1,
            calendarUrl: 'https://calendar.example/dav',
            configured: true,
            lastSyncError: null,
            lastSyncedAt: new Date().toISOString(),
            syncIntervalSeconds: 900,
            syncing: false,
            username: 'tester'
          }
        }
        if (command === 'list_calendar_events') return [calendarEvent()]
        if (command === 'sync_calendar_events') {
          return {
            cachedSources: 1,
            lastError: null,
            lastSyncedAt: new Date().toISOString(),
            syncIntervalSeconds: 900,
            syncing: false
          }
        }
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
