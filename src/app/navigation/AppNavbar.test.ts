import { describe, expect, it } from 'vitest'
import appNavbarSource from './AppNavbar.svelte?raw'

import logoUrl from '$lib/assets/bitch-logo.png'

describe('AppNavbar branding', () => {
  it('uses the black-background BITCH logo alongside the text brand', () => {
    expect(logoUrl).toContain('bitch-logo.png')
    expect(appNavbarSource).toContain("import bitchLogoUrl from '$lib/assets/bitch-logo.png'")
    expect(appNavbarSource).toContain('src={bitchLogoUrl}')
    expect(appNavbarSource).toContain('<span>BITCH</span>')
  })
})
