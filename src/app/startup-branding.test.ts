import { describe, expect, it } from 'vitest'

import indexSource from '../../index.html?raw'
import icon128Url from '../../src-tauri/icons/128x128.png?url'
import icon256Url from '../../src-tauri/icons/128x128@2x.png?url'
import icon32Url from '../../src-tauri/icons/32x32.png?url'
import iconIcnsUrl from '../../src-tauri/icons/icon.icns?url'
import iconIcoUrl from '../../src-tauri/icons/icon.ico?url'
import iconSourceUrl from '../../src-tauri/icons/app-icon-source.png?url'
import mainSource from '../main.ts?raw'
import tauriConfigSource from '../../src-tauri/tauri.conf.json?raw'

const styleSource = indexSource.slice(indexSource.indexOf('<style>'), indexSource.indexOf('</style>'))
const splashMarkup = indexSource.slice(
  indexSource.indexOf('<div id="bitch-splash"'),
  indexSource.indexOf('<div id="app">')
)

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styleSource.match(new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\n      \\}`))

  return match?.[1] ?? ''
}

describe('startup branding shell', () => {
  it('ships a plain logo-only startup splash before the Svelte bundle mounts', () => {
    expect(indexSource).toContain('id="bitch-splash"')
    expect(cssRule('body')).toContain('background: #000;')
    expect(cssRule('#bitch-splash')).toContain('background: #000;')
    expect(splashMarkup).toContain('class="bitch-splash-logo-stack"')
    expect(splashMarkup).toContain('bitch-splash-logo--cyan')
    expect(splashMarkup).toContain('bitch-splash-logo--magenta')
    expect(splashMarkup).toContain('src="/src/lib/assets/bitch-logo.png"')
    expect(styleSource).toContain('@keyframes bitch-splash-glitch-cyan')
    expect(styleSource).toContain('@keyframes bitch-splash-glitch-magenta')
    expect(styleSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(splashMarkup).not.toContain('bitch-splash-title')
    expect(splashMarkup).not.toContain('bitch-splash-status')
    expect(splashMarkup).not.toContain('Remote chrome boot sequence')
    expect(styleSource).not.toContain('#bitch-splash::before')
    expect(styleSource).not.toContain('#bitch-splash::after')
    expect(styleSource).not.toContain('@keyframes bitch-splash-grid')
    expect(styleSource).not.toContain('@keyframes bitch-splash-scan')
    expect(styleSource).not.toContain('repeating-linear-gradient')
    expect(styleSource).not.toContain('drop-shadow')
    expect(styleSource).not.toContain('glow')
    expect(mainSource).toContain('SPLASH_MIN_DURATION_MS = 2600')
    expect(mainSource).toContain("document.getElementById('bitch-splash')")
    expect(mainSource).toContain("document.documentElement.classList.add('bitch-app-ready')")
  })
})

describe('macOS app icon contract', () => {
  it('configures generated Tauri bundle icons including the macOS icns file', () => {
    const tauriConfig = JSON.parse(tauriConfigSource) as { bundle?: { icon?: string[] } }

    expect(tauriConfig.bundle?.icon).toEqual([
      'icons/32x32.png',
      'icons/128x128.png',
      'icons/128x128@2x.png',
      'icons/icon.icns',
      'icons/icon.ico'
    ])
  })

  it('keeps generated icon assets available for platform packaging', () => {
    expect(iconSourceUrl).toContain('app-icon-source.png')
    expect(icon32Url).toContain('32x32.png')
    expect(icon128Url).toContain('128x128.png')
    expect(icon256Url).toContain('128x128@2x.png')
    expect(iconIcnsUrl).toContain('icon.icns')
    expect(iconIcoUrl).toContain('icon.ico')
  })
})
