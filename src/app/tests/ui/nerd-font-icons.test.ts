import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import agentPreviewSource from '../../agent/preview/AgentPreviewSidebar.svelte?raw'
import agentSessionSidebarSource from '../../agent/sessions/AgentSessionSidebar.svelte?raw'
import appNavbarSource from '../../navigation/AppNavbar.svelte?raw'
import assetsPageSource from '../../assets/AssetsPage.svelte?raw'
import composerSource from '../../components/composer/Composer.svelte?raw'
import modelPickerSource from '../../components/composer/ModelPicker.svelte?raw'
import approvalSource from '../../components/prompts/Approval.svelte?raw'
import markdownSource from '../../components/conversation/Markdown.svelte?raw'
import messageAttachmentsSource from '../../components/conversation/MessageAttachments.svelte?raw'
import reasoningSource from '../../components/conversation/Reasoning.svelte?raw'
import systemSource from '../../components/conversation/System.svelte?raw'
import toolSource from '../../components/conversation/Tool.svelte?raw'
import mainPageSource from '../../main/MainPage.svelte?raw'
import mainAgentPanelSource from '../../main/panels/MainAgentPanel.svelte?raw'
import mainContainersPanelSource from '../../main/panels/MainContainersPanel.svelte?raw'
import mainCronPanelSource from '../../main/panels/MainCronPanel.svelte?raw'
import mainKanbanPanelSource from '../../main/panels/MainKanbanPanel.svelte?raw'
import fileTypesSource from '$lib/hermes/files/domain/types.ts?raw'
import filePreviewSource from '$lib/hermes/files/domain/preview.ts?raw'

function readOptionalSource(path: string): string {
  const fullPath = join(process.cwd(), path)
  return existsSync(fullPath) ? readFileSync(fullPath, 'utf8') : ''
}

const appCssSource = readOptionalSource('src/app.css')
const iconComponentSource = readOptionalSource('src/app/components/ui/Icon.svelte')
const iconTokensSource = readOptionalSource('src/lib/theme/icons.ts')

const iconSurfaceSources = [
  appNavbarSource,
  agentPreviewSource,
  agentSessionSidebarSource,
  assetsPageSource,
  composerSource,
  modelPickerSource,
  approvalSource,
  markdownSource,
  messageAttachmentsSource,
  reasoningSource,
  systemSource,
  toolSource,
  mainPageSource,
  mainAgentPanelSource,
  mainContainersPanelSource,
  mainCronPanelSource,
  mainKanbanPanelSource
]

const oldRawGlyphPattern = /[▣▾▸⇩×→↓↑]/

function sourceName(index: number): string {
  return [
    'AppNavbar',
    'AgentPreviewSidebar',
    'AgentSessionSidebar',
    'AssetsPage',
    'Composer',
    'ModelPicker',
    'Approval',
    'Markdown',
    'MessageAttachments',
    'Reasoning',
    'System',
    'Tool',
    'MainPage',
    'MainAgentPanel',
    'MainContainersPanel',
    'MainCronPanel',
    'MainKanbanPanel'
  ][index]
}

describe('Nerd Font typography and icon source contract', () => {
  it('sets all app typography tokens to a Nerd Font stack with sane fallbacks', () => {
    expect(appCssSource).toContain('--font-nerd:')
    expect(appCssSource).toContain('JetBrainsMono Nerd Font')
    expect(appCssSource).toContain('Symbols Nerd Font')
    expect(appCssSource).toContain('--font-sans: var(--font-nerd);')
    expect(appCssSource).toContain('--font-mono: var(--font-nerd);')
    expect(appCssSource).toContain('--font-hud: var(--font-nerd);')
    expect(appCssSource).toContain('font-family: var(--font-mono);')
  })

  it('centralizes Nerd Font glyph tokens and accessibility behavior in the shared Icon component', () => {
    expect(iconTokensSource).toContain('export const nerdIconGlyphs')
    expect(iconTokensSource).toContain('export type NerdIconName')
    expect(iconTokensSource).toContain('export function nerdIcon')
    expect(iconTokensSource).toContain('fileImage')
    expect(iconTokensSource).toContain('shieldCheck')
    expect(iconTokensSource).toContain('kanban')
    expect(iconComponentSource).toContain("import { nerdIcon, type NerdIconName } from '$lib/theme'")
    expect(iconComponentSource).toContain('font-nerd')
    expect(iconComponentSource).toContain("aria-hidden={decorativeIcon ? 'true' : undefined}")
    expect(iconComponentSource).toContain('aria-label={decorativeIcon ? undefined : label}')
    expect(iconComponentSource).toContain("role={decorativeIcon ? undefined : 'img'}")
  })

  it('renders app icon surfaces through the shared Icon component instead of inline SVG or raw glyphs', () => {
    for (const [index, source] of iconSurfaceSources.entries()) {
      expect(source, sourceName(index)).toContain("import Icon from '@/app/components/ui/Icon.svelte'")
      expect(source, sourceName(index)).toContain('<Icon')
      expect(source, sourceName(index)).not.toContain('<svg')
      expect(source, sourceName(index)).not.toMatch(oldRawGlyphPattern)
    }
  })

  it('uses file icon tokens instead of the old remote-file glyph acronym mechanism', () => {
    expect(fileTypesSource).toContain("import type { NerdIconName } from '$lib/theme'")
    expect(fileTypesSource).toContain('icon: NerdIconName')
    expect(fileTypesSource).not.toContain('glyph: string')
    expect(filePreviewSource).toContain("icon: 'fileImage'")
    expect(filePreviewSource).toContain('icon: iconFor')
    expect(filePreviewSource).not.toContain('glyphFor')
    expect(assetsPageSource).not.toContain('.glyph')
  })
})
