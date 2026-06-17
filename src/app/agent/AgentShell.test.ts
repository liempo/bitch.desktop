import { describe, expect, it } from 'vitest'

import agentShellSource from './AgentShell.svelte?raw'
import previewSidebarSource from './preview/PreviewSidebar.svelte?raw'
import sidebarSource from './sidebar/Sidebar.svelte?raw'

describe('AgentShell resizable panel source contract', () => {
  it('renders pointer-accessible resize handles for both side panels', () => {
    expect(agentShellSource).toContain('aria-label="Resize session sidebar"')
    expect(agentShellSource).toContain('aria-label="Resize preview sidebar"')
    expect(agentShellSource).toContain('role="separator"')
    expect(agentShellSource).toContain('onpointerdown')
    expect(agentShellSource).toContain('onkeydown')
  })

  it('passes persisted widths into the left session sidebar and right preview sidebar', () => {
    expect(agentShellSource).toContain('sidebarPanelWidth')
    expect(agentShellSource).toContain('previewPanelWidth')
    expect(agentShellSource).toContain('<Sidebar width={sidebarPanelWidth}')
    expect(agentShellSource).toContain('<PreviewSidebar preview={activePreview} width={previewPanelWidth}')
  })

  it('keeps mobile panels full-width while applying desktop CSS variable widths', () => {
    expect(sidebarSource).toContain('--agent-sidebar-width')
    expect(sidebarSource).toContain('md:w-[var(--agent-sidebar-width)]')
    expect(previewSidebarSource).toContain('--agent-preview-width')
    expect(previewSidebarSource).toContain('md:w-[var(--agent-preview-width)]')
  })
})
