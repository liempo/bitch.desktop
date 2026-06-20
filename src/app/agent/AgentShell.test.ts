import { describe, expect, it } from 'vitest'

import agentShellSource from './AgentShell.svelte?raw'
import previewSidebarSource from './preview/AgentPreviewSidebar.svelte?raw'
import sidebarSource from './session-sidebar/AgentSessionSidebar.svelte?raw'

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1
}

describe('AgentShell resizable panel source contract', () => {
  it('keeps resize behavior without rendering visible divider lines', () => {
    expect(agentShellSource).toContain('aria-label="Resize session sidebar"')
    expect(agentShellSource).toContain('aria-label="Resize preview sidebar"')
    expect(agentShellSource).toContain('role="separator"')
    expect(agentShellSource).toContain('onpointerdown')
    expect(agentShellSource).toContain('onkeydown')
    expect(agentShellSource).not.toContain('w-px bg-line')
    expect(agentShellSource).not.toContain('group-hover:bg-primary')
  })

  it('uses one smaller standardized gap class for both invisible resize hitboxes', () => {
    expect(agentShellSource).toContain('PANEL_RESIZE_GAP_CLASS')
    expect(agentShellSource).toContain('hidden w-1 shrink-0 cursor-col-resize')
    expect(countOccurrences(agentShellSource, 'class={PANEL_RESIZE_GAP_CLASS}')).toBe(2)
    expect(agentShellSource).not.toContain('w-2 shrink-0 cursor-col-resize')
  })

  it('removes extra preview-left padding so inter-panel gaps match', () => {
    expect(previewSidebarSource).toContain('bg-canvas/70 py-3 pr-3')
    expect(previewSidebarSource).not.toContain('bg-canvas/70 p-3')
  })

  it('passes persisted widths into the left session sidebar and right preview sidebar', () => {
    expect(agentShellSource).toContain('sidebarPanelWidth')
    expect(agentShellSource).toContain('previewPanelWidth')
    expect(agentShellSource).toContain('<AgentSessionSidebar width={sidebarPanelWidth}')
    expect(agentShellSource).toContain('<AgentPreviewSidebar preview={activePreview} width={previewPanelWidth}')
  })

  it('keeps mobile panels full-width while applying desktop CSS variable widths', () => {
    expect(sidebarSource).toContain('--agent-sidebar-width')
    expect(sidebarSource).toContain('md:w-(--agent-sidebar-width)')
    expect(previewSidebarSource).toContain('--agent-preview-width')
    expect(previewSidebarSource).toContain('md:w-(--agent-preview-width)')
  })
})
