import { describe, expect, it } from 'vitest'
import appNavbarSource from '../../navigation/AppNavbar.svelte?raw'

describe('AppNavbar branding', () => {
  it('uses text-only BITCH branding in the navbar', () => {
    expect(appNavbarSource).not.toContain("import GlyphCanvas from '@/app/components/GlyphCanvas.svelte'")
    expect(appNavbarSource).not.toContain('<GlyphCanvas')
    expect(appNavbarSource).not.toContain("'$lib/assets/glyph.png'")
    expect(appNavbarSource).not.toContain('<img')
    expect(appNavbarSource).not.toContain("import Icon from '@/app/components/ui/Icon.svelte'")
    expect(appNavbarSource).not.toContain('<Icon')
    expect(appNavbarSource).not.toContain('icon:')
    expect(appNavbarSource).toContain('<span>BITCH</span>')
  })
})
