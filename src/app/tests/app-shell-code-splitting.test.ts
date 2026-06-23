import { describe, expect, it } from 'vitest'

import appShellSource from '../AppShell.svelte?raw'
import startupSplashSource from '../components/StartupSplash.svelte?raw'
import viteConfigSource from '../../../vite.config.ts?raw'

const routeImports = [
  "import AgentShell from './agent/AgentShell.svelte'",
  "import AssetsPage from './assets/AssetsPage.svelte'",
  "import CalendarPage from './calendar/CalendarPage.svelte'",
  "import CronPage from './cron/CronPage.svelte'",
  "import KanbanPage from './kanban/KanbanPage.svelte'",
  "import MainPage from './main/MainPage.svelte'"
]

describe('app shell code splitting', () => {
  it('keeps generated chunks below Vite warning size with Rolldown splitting', () => {
    expect(viteConfigSource).toContain('rolldownOptions')
    expect(viteConfigSource).toContain('codeSplitting')
    expect(viteConfigSource).toContain('groups: [')
    expect(viteConfigSource).toContain("name: 'three'")
    expect(viteConfigSource).toContain('maxSize: 480_000')
    expect(viteConfigSource).not.toContain('chunkSizeWarningLimit')
  })

  it('loads page routes through dynamic imports instead of bundling every page into the shell', () => {
    for (const routeImport of routeImports) {
      expect(appShellSource).not.toContain(routeImport)
    }

    for (const routeLoader of [
      "agent: () => import('./agent/AgentShell.svelte')",
      "assets: () => import('./assets/AssetsPage.svelte')",
      "calendar: () => import('./calendar/CalendarPage.svelte')",
      "cron: () => import('./cron/CronPage.svelte')",
      "kanban: () => import('./kanban/KanbanPage.svelte')",
      "main: () => import('./main/MainPage.svelte')"
    ]) {
      expect(appShellSource).toContain(routeLoader)
    }

    expect(appShellSource).toContain('loadPageComponent(appRouterState.page)')
    expect(appShellSource).toContain('{#await pageComponentPromise}')
  })

  it('keeps the Threlte splash glyph out of the initial shell chunk', () => {
    expect(startupSplashSource).not.toContain("import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'")
    expect(startupSplashSource).toContain("import('@/app/components/GlyphCanvas.svelte')")
    expect(startupSplashSource).toContain('{#await glyphCanvasComponentPromise}')
  })
})
