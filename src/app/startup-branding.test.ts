import { describe, expect, it } from 'vitest'

import indexSource from '../../index.html?raw'
import icon128Url from '../../src-tauri/icons/128x128.png?url'
import icon256Url from '../../src-tauri/icons/128x128@2x.png?url'
import icon32Url from '../../src-tauri/icons/32x32.png?url'
import iconIcnsUrl from '../../src-tauri/icons/icon.icns?url'
import iconIcoUrl from '../../src-tauri/icons/icon.ico?url'
import iconSourceUrl from '../../src-tauri/icons/app-icon-source.png?url'
import mainSource from '../main.ts?raw'
import cargoManifestSource from '../../src-tauri/Cargo.toml?raw'
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
  it('ships an immediate theme-colored animated logo splash before the Svelte bundle mounts', () => {
    expect(indexSource).toContain('id="bitch-splash"')
    expect(cssRule(':root')).toContain('--bits-canvas: #000000;')
    expect(cssRule(':root')).toContain('--bits-primary: #8be9fd;')
    expect(cssRule(':root')).toContain('--bits-warning: #ff79c6;')
    expect(cssRule('body')).toContain('background: var(--bits-canvas);')
    expect(cssRule('#bitch-splash')).toContain('background: var(--bits-canvas);')
    expect(cssRule('.bitch-splash-logo-stack')).toContain('width: min(34vw, 10rem);')
    expect(splashMarkup).toContain('class="bitch-splash-logo-stack"')
    expect(splashMarkup).toContain('<span class="bitch-splash-logo-glitch bitch-splash-logo--primary"></span>')
    expect(splashMarkup).toContain('<span class="bitch-splash-logo-glitch bitch-splash-logo--warning"></span>')
    expect(splashMarkup).not.toContain('<span class="bitch-splash-logo"></span>')
    expect(splashMarkup).not.toContain('<img')
    expect(splashMarkup).not.toContain('src="/src/lib/assets/bitch-logo.png"')
    expect(styleSource).toContain("background-image: url('/src/lib/assets/bitch-logo.png');")
    expect(styleSource).toContain('background-position: center;')
    expect(styleSource).toContain('background-size: contain;')
    expect(cssRule('.bitch-splash-logo-glitch')).not.toContain('border')
    expect(cssRule('.bitch-splash-logo-glitch')).not.toContain('border-radius')
    expect(styleSource).toContain('background-blend-mode: multiply;')
    expect(styleSource).toContain('mix-blend-mode: screen;')
    expect(styleSource).toContain('animation: bitch-splash-glitch-primary 1.4s steps(1, end) infinite;')
    expect(styleSource).toContain('animation: bitch-splash-glitch-warning 1.4s steps(1, end) infinite;')
    expect(styleSource).toContain(
      '0%,\n        12%,\n        100% {\n          opacity: 1;\n          transform: translate(-2px, 0);'
    )
    expect(styleSource).toContain(
      '0%,\n        12%,\n        100% {\n          opacity: 0.42;\n          transform: translate(2px, 0);'
    )
    expect(styleSource).toContain('background-color: var(--bits-primary);')
    expect(styleSource).toContain('background-color: var(--bits-warning);')
    expect(styleSource).toContain('@keyframes bitch-splash-glitch-primary')
    expect(styleSource).toContain('@keyframes bitch-splash-glitch-warning')
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
    expect(styleSource).not.toContain('clip-path')
    expect(styleSource).not.toContain('bitch-splash-logo-reveal')
    expect(styleSource).not.toContain('hue-rotate')
    expect(styleSource).not.toContain('sepia(')
    expect(splashMarkup).not.toContain('bitch-splash-logo--cyan')
    expect(splashMarkup).not.toContain('bitch-splash-logo--magenta')
    expect(mainSource).toContain('SPLASH_MIN_DURATION_MS = 2600')
    expect(mainSource).toContain("document.getElementById('bitch-splash')")
    expect(mainSource).toContain("document.documentElement.classList.add('bitch-app-ready')")
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
