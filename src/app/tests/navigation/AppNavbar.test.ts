import { describe, expect, it } from 'vitest'
import appNavbarSource from '../../navigation/AppNavbar.svelte?raw'

describe('AppNavbar branding', () => {
  it('uses text-only BITCH branding in the navbar', () => {
    expect(appNavbarSource).not.toContain("import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'")
    expect(appNavbarSource).not.toContain('<GlyphCanvas')
    expect(appNavbarSource).not.toContain("'$lib/assets/glyph.png'")
    expect(appNavbarSource).not.toContain('<img')
    expect(appNavbarSource).toContain('<span>BITCH</span>')
  })

  it('keeps desktop nav links while collapsing mobile navigation into a right-side hamburger popover', () => {
    expect(appNavbarSource).toContain("import { Popover } from 'bits-ui'")
    expect(appNavbarSource).toContain("import Icon from '@/app/components/ui/Icon.svelte'")
    expect(appNavbarSource).toContain('settingsRoute')
    expect(appNavbarSource).toContain("label: 'SETTINGS'")
    expect(appNavbarSource).toContain('class="hidden items-center gap-6 md:flex"')
    expect(appNavbarSource).toContain('<Popover.Root bind:open={mobileMenuOpen}>')
    expect(appNavbarSource).toContain('aria-label="Open navigation menu"')
    expect(appNavbarSource).toContain('aria-expanded={mobileMenuOpen}')
    expect(appNavbarSource).toContain('<Icon name="menu"')
    expect(appNavbarSource).toContain('<Popover.Content class={mobileMenuContentClass} sideOffset={6} align="end">')
    expect(appNavbarSource).toContain('onclick={closeMobileMenu}')
  })

  it('keeps Settings as the right-most navbar control with a gear icon', () => {
    expect(appNavbarSource).toContain('const settingsControlClass')
    expect(appNavbarSource).toContain('aria-label="Open settings"')
    expect(appNavbarSource).toContain('href={`#${settingsRoute()}`}')
    expect(appNavbarSource).toContain('<Icon name="settings"')
    expect(appNavbarSource.indexOf('<Popover.Root bind:open={mobileMenuOpen}>')).toBeLessThan(
      appNavbarSource.indexOf('aria-label="Open settings"')
    )
  })
})
