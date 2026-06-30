import { describe, expect, it } from 'vitest'

import indexSource from '../../../index.html?raw'
import appSource from '../../App.svelte?raw'
import appShellSource from '../AppShell.svelte?raw'
import glyphCanvasSource from '../components/GlyphCanvas.svelte?raw'
import startupSplashSource from '../components/StartupSplash.svelte?raw'
import icon128Url from '../../../src-tauri/icons/128x128.png?url'
import icon256Url from '../../../src-tauri/icons/128x128@2x.png?url'
import icon32Url from '../../../src-tauri/icons/32x32.png?url'
import iconIcnsUrl from '../../../src-tauri/icons/icon.icns?url'
import iconIcoUrl from '../../../src-tauri/icons/icon.ico?url'
import iconSourceUrl from '../../../src-tauri/icons/app-icon-source.png?url'
import mainSource from '../../main.ts?raw'
import cargoManifestSource from '../../../src-tauri/Cargo.toml?raw'
import tauriConfigSource from '../../../src-tauri/tauri.conf.json?raw'
import {
  SPLASH_MIN_DURATION_MS,
  SPLASH_REMOVE_AFTER_MS,
  STARTUP_SPLASH_COMPLETE_EVENT
} from '$lib/layout/startup-splash'

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
  it('keeps the HTML splash as a minimal pre-bundle fallback and uses the real Threlte glyph once Svelte mounts', () => {
    expect(indexSource).toContain('id="bitch-splash"')
    expect(cssRule(':root')).toContain('--bits-canvas: #000000;')
    expect(cssRule('body')).toContain('background: var(--bits-canvas);')
    expect(cssRule('#bitch-splash')).toContain('background: var(--bits-canvas);')
    expect(splashMarkup).toContain('<div id="bitch-splash" role="status" aria-label="Loading BITCH"></div>')
    expect(splashMarkup).not.toContain('<img')
    expect(splashMarkup).not.toContain('<span')
    expect(indexSource).not.toContain('glyph.png')
    expect(styleSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(appShellSource).toContain("import StartupSplash from './components/StartupSplash.svelte'")
    expect(appShellSource).toContain('<StartupSplash />')
    expect(startupSplashSource).toContain("import('@/app/components/GlyphCanvas.svelte')")
    expect(SPLASH_MIN_DURATION_MS).toBe(2600)
    expect(SPLASH_REMOVE_AFTER_MS).toBe(3200)
    expect(startupSplashSource).toContain('STARTUP_SPLASH_COMPLETE_EVENT')
    expect(startupSplashSource).toContain('window.dispatchEvent(new Event(STARTUP_SPLASH_COMPLETE_EVENT))')
    expect(appSource).toContain('STARTUP_SPLASH_COMPLETE_EVENT')
    expect(appSource).toContain('installCustomScrollbars')
    expect(appSource).toContain('SPLASH_REMOVE_AFTER_MS + 100')
    expect(STARTUP_SPLASH_COMPLETE_EVENT).toBe('bitch:startup-splash-complete')
    expect(startupSplashSource).toContain('<GlyphCanvas')
    expect(startupSplashSource).not.toContain('<img')
    expect(glyphCanvasSource).toContain("import { Canvas } from '@threlte/core'")
    expect(glyphCanvasSource).toContain("import Glyph from './Glyph.svelte'")
    expect(glyphCanvasSource).toContain("import { themeState } from '$lib/theme'")
    expect(glyphCanvasSource).toContain("themeState.selectedTheme.cssVariables['--bits-ink-bright']")
    expect(glyphCanvasSource).toContain("themeState.selectedTheme.cssVariables['--bits-ink-muted']")
    expect(glyphCanvasSource).toContain("themeState.selectedTheme.cssVariables['--bits-line-strong']")
    expect(glyphCanvasSource).not.toContain('getComputedStyle')
    expect(glyphCanvasSource).toContain('<Canvas')
    expect(glyphCanvasSource).toContain('<Glyph')
    expect(startupSplashSource).toContain('bg-transparent')
    expect(startupSplashSource).not.toContain('bg-black')
    expect(mainSource).toContain("document.getElementById('bitch-splash')")
    expect(mainSource).toContain('prebundleSplash?.remove()')
    expect(mainSource).not.toContain('SPLASH_MIN_DURATION_MS')
    expect(mainSource).not.toContain("document.documentElement.classList.add('bitch-app-ready')")
    expect(splashMarkup).not.toContain('bitch-splash-logo-stack')
    expect(splashMarkup).not.toContain('bitch-splash-logo-glitch')
    expect(styleSource).not.toContain('background-image:')
    expect(styleSource).not.toContain('background-blend-mode')
    expect(styleSource).not.toContain('mix-blend-mode')
    expect(styleSource).not.toContain('animation: bitch-splash-glitch')
    expect(styleSource).not.toContain('@keyframes bitch-splash-glitch')
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
    expect(styleSource).not.toContain('clip-path')
    expect(styleSource).not.toContain('bitch-splash-logo-reveal')
    expect(styleSource).not.toContain('hue-rotate')
    expect(styleSource).not.toContain('sepia(')
    expect(splashMarkup).not.toContain('bitch-splash-logo--cyan')
    expect(splashMarkup).not.toContain('bitch-splash-logo--magenta')
  })
})

describe('desktop app naming contract', () => {
  it('keeps the desktop app and dev binary names uppercase', () => {
    const tauriConfig = JSON.parse(tauriConfigSource) as { mainBinaryName?: string; productName?: string }

    expect(tauriConfig.productName).toBe('BITCH')
    expect(tauriConfig.mainBinaryName).toBe('BITCH')
    expect(cargoManifestSource).toContain('default-run = "BITCH"')
    expect(cargoManifestSource).toContain('[[bin]]\nname = "BITCH"\npath = "src/main.rs"')
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
