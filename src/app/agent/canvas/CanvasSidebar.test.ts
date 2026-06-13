import { describe, expect, it } from 'vitest'
import agentShellSource from '../AgentShell.svelte?raw'
import canvasSidebarSource from './CanvasSidebar.svelte?raw'

describe('CanvasSidebar source contract', () => {
  it('renders canvas HTML in a sandboxed iframe with direct-open chrome', () => {
    expect(canvasSidebarSource).toContain('<iframe')
    expect(canvasSidebarSource).toContain('src={canvas.url}')
    expect(canvasSidebarSource).toContain('sandbox="allow-scripts allow-forms allow-popups allow-downloads"')
    expect(canvasSidebarSource).toContain('href={canvas.url}')
    expect(canvasSidebarSource).toContain('Open canvas')
  })

  it('does not hardcode the production BOX origin in the renderer', () => {
    expect(canvasSidebarSource).not.toContain('box.airplane-skilift.ts.net')
  })

  it('is wired as a conditional right sidebar from the agent shell', () => {
    expect(agentShellSource).toContain('CanvasSidebar')
    expect(agentShellSource).toContain('{#if activeCanvas}')
    expect(agentShellSource).toContain('canvas={activeCanvas}')
  })
})
