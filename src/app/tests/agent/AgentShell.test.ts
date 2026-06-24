import { describe, expect, it } from 'vitest'

import agentShellSource from '../../agent/AgentShell.svelte?raw'
import previewSidebarSource from '../../agent/preview/AgentPreviewSidebar.svelte?raw'
import composerSource from '../../components/composer/Composer.svelte?raw'
import conversationSource from '../../components/conversation/Conversation.svelte?raw'
import sidebarSource from '../../agent/sessions/AgentSessionSidebar.svelte?raw'

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

  it('hides session and preview sidebars on mobile while preserving desktop widths', () => {
    expect(sidebarSource).toContain('hidden h-64 w-full')
    expect(sidebarSource).toContain('md:flex md:h-full md:w-(--agent-sidebar-width)')
    expect(previewSidebarSource).toContain('hidden min-h-0 w-full')
    expect(previewSidebarSource).toContain('md:block md:w-(--agent-preview-width)')
  })

  it('uses a mobile session picker dialog and responsive compact conversation/composer chrome', () => {
    expect(agentShellSource).toContain('md:hidden')
    expect(agentShellSource).toContain('openSessionSelector')
    expect(agentShellSource).toContain('title="Select AGENT Session"')
    expect(agentShellSource).toContain('selectSession')
    expect(agentShellSource).toContain('<Conversation responsiveCompact')
    expect(agentShellSource).toContain('<Composer')
    expect(agentShellSource).toContain('responsiveCompact')
    expect(composerSource).toContain('responsiveCompact?: boolean')
    expect(composerSource).toContain('md:bg-transparent md:py-3 md:pr-3 md:pl-1')
    expect(composerSource).toContain("responsiveCompact ? 'w-full 2xl:mx-auto 2xl:max-w-5xl'")
    expect(composerSource).not.toContain('md:max-w-5xl')
    expect(composerSource).toContain('hidden h-5 w-5 items-center')
    expect(conversationSource).toContain('responsiveCompact?: boolean')
    expect(conversationSource).toContain('md:bg-chat-scroll/40')
  })
})
