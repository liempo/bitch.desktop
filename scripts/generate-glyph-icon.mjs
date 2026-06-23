import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EdgesGeometry, Euler, IcosahedronGeometry, Matrix4, PerspectiveCamera, Vector3 } from 'three'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const assetsDir = resolve(rootDir, 'src/lib/assets')
const iconsDir = resolve(rootDir, 'src-tauri/icons')

const canvasSize = 1024
const staticCpuUsagePercent = 48
const staticMemoryUsagePercent = 64
const macOsIconGlyphScale = 0.64
const macOsIconPlate = {
  inset: 96,
  radius: 184,
  size: 832
}

const theme = {
  background: '#000000',
  foreground: '#ffffff',
  muted: '#6272a4',
  frame: '#273049',
  frameMuted: '#111827'
}

const tauriIconFiles = ['32x32.png', '64x64.png', '128x128.png', '128x128@2x.png', 'icon.icns', 'icon.ico', 'icon.png']

const camera = new PerspectiveCamera(46, 1, 0.1, 100)
camera.position.set(0, 0, 5.25)
camera.lookAt(0, 0, 0)
camera.updateMatrixWorld()
camera.updateProjectionMatrix()

function loadFromPercent(percent) {
  return Math.max(0, Math.min(1, percent / 100))
}

function glyphWorldMatrix({ rotation = [0, 0, 0], scale }) {
  const groupMatrix = new Matrix4().makeRotationFromEuler(new Euler(-0.28, 0, 0.22))
  const rotationMatrix = new Matrix4().makeRotationFromEuler(new Euler(rotation[0], rotation[1], rotation[2]))
  const scaleMatrix = new Matrix4().makeScale(scale, scale, scale)
  const objectMatrix = new Matrix4().multiplyMatrices(rotationMatrix, scaleMatrix)

  return new Matrix4().multiplyMatrices(groupMatrix, objectMatrix)
}

function projectedSegments({ radius, rotation, scale }) {
  const geometry = new EdgesGeometry(new IcosahedronGeometry(radius, 1))
  const position = geometry.attributes.position
  const matrix = glyphWorldMatrix({ rotation, scale })
  const start = new Vector3()
  const end = new Vector3()
  const segments = []

  for (let index = 0; index < position.count; index += 2) {
    start.fromBufferAttribute(position, index).applyMatrix4(matrix).project(camera)
    end
      .fromBufferAttribute(position, index + 1)
      .applyMatrix4(matrix)
      .project(camera)

    segments.push({
      x1: ((start.x + 1) / 2) * canvasSize,
      y1: ((1 - start.y) / 2) * canvasSize,
      x2: ((end.x + 1) / 2) * canvasSize,
      y2: ((1 - end.y) / 2) * canvasSize
    })
  }

  return segments
}

function pathData(segment) {
  return `M${segment.x1.toFixed(2)} ${segment.y1.toFixed(2)}L${segment.x2.toFixed(2)} ${segment.y2.toFixed(2)}`
}

function segmentMarkup(segments, { opacity, stroke, strokeWidth }) {
  return segments
    .map(
      segment =>
        `<path d="${pathData(segment)}" stroke="${stroke}" stroke-opacity="${opacity.toFixed(3)}" stroke-width="${strokeWidth}" />`
    )
    .join('\n      ')
}

function renderGlyphSvg({ framed }) {
  const cpuLoad = loadFromPercent(staticCpuUsagePercent)
  const memoryLoad = loadFromPercent(staticMemoryUsagePercent)
  const cpuSegments = projectedSegments({ radius: 1.65, rotation: [0, 0, 0], scale: 0.94 + cpuLoad * 0.2 })
  const memorySegments = projectedSegments({ radius: 1.18, rotation: [0.55, 0.3, 0], scale: 0.76 + memoryLoad * 0.36 })
  const background = framed
    ? `<rect x="${macOsIconPlate.inset}" y="116" width="${macOsIconPlate.size}" height="${macOsIconPlate.size}" rx="${macOsIconPlate.radius}" fill="#000000" opacity="0.34" />\n    <rect x="${macOsIconPlate.inset}" y="${macOsIconPlate.inset}" width="${macOsIconPlate.size}" height="${macOsIconPlate.size}" rx="${macOsIconPlate.radius}" fill="${theme.background}" />\n    <rect x="120" y="120" width="784" height="784" rx="166" fill="none" stroke="${theme.frame}" stroke-opacity="0.82" stroke-width="4" />\n    <rect x="144" y="144" width="736" height="736" rx="144" fill="none" stroke="${theme.frameMuted}" stroke-opacity="0.88" stroke-width="2" />`
    : `<rect width="1024" height="1024" fill="${theme.background}" />`
  const glyphTransform = framed
    ? ` transform="translate(512 512) scale(${macOsIconGlyphScale}) translate(-512 -512)"`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="BITCH glyph">
  ${background}
  <g${glyphTransform} fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g opacity="0.46">
      ${segmentMarkup(memorySegments, { stroke: theme.muted, opacity: 0.3 + memoryLoad * 0.45, strokeWidth: 15 })}
    </g>
    <g opacity="0.92">
      ${segmentMarkup(cpuSegments, { stroke: theme.foreground, opacity: 0.72 + cpuLoad * 0.28, strokeWidth: 18 })}
    </g>
  </g>
</svg>
`
}

function rasterizeSvg(svg, outputPath, temporaryDir, name) {
  const svgPath = join(temporaryDir, `${name}.svg`)
  writeFileSync(svgPath, svg)
  execFileSync('sips', ['-s', 'format', 'png', svgPath, '--out', outputPath], { stdio: 'inherit' })
}

function regenerateTauriIcons(sourcePath, temporaryDir) {
  const generatedDir = join(temporaryDir, 'tauri-icons')
  execFileSync('npm', ['run', 'tauri', '--', 'icon', sourcePath, '-o', generatedDir], {
    cwd: rootDir,
    stdio: 'inherit'
  })

  for (const file of tauriIconFiles) {
    copyFileSync(join(generatedDir, file), join(iconsDir, file))
  }
}

mkdirSync(assetsDir, { recursive: true })
mkdirSync(iconsDir, { recursive: true })

const temporaryDir = mkdtempSync(join(tmpdir(), 'bitch-glyph-icon-'))

try {
  const glyphAssetPath = resolve(assetsDir, 'glyph.png')
  const iconSourcePath = resolve(iconsDir, 'app-icon-source.png')

  rasterizeSvg(renderGlyphSvg({ framed: false }), glyphAssetPath, temporaryDir, 'glyph')
  rasterizeSvg(renderGlyphSvg({ framed: true }), iconSourcePath, temporaryDir, 'app-icon-source')
  regenerateTauriIcons(iconSourcePath, temporaryDir)

  console.log(`Generated ${glyphAssetPath}`)
  console.log(`Generated ${iconSourcePath}`)
  console.log(`Regenerated ${tauriIconFiles.map(file => `src-tauri/icons/${file}`).join(', ')}`)
} finally {
  rmSync(temporaryDir, { force: true, recursive: true })
}
