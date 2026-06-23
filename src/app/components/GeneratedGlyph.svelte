<script lang="ts">
  import { T, useTask } from '@threlte/core'
  import {
    Box3,
    BoxGeometry,
    BufferGeometry,
    Color,
    EdgesGeometry,
    Group,
    IcosahedronGeometry,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    Object3D,
    OctahedronGeometry,
    RingGeometry,
    SphereGeometry,
    TetrahedronGeometry,
    TorusGeometry,
    Vector3,
    type Material
  } from 'three'

  import type { GlyphSceneObjectSpec, GlyphSceneSpec, GlyphTelemetrySignal, GlyphVector3 } from '$lib/hermes/glyph'

  interface Props {
    animated?: boolean
    cpuUsagePercent?: number
    foregroundColor?: string
    lineColor?: string
    memoryUsagePercent?: number
    mutedColor?: string
    primaryColor?: string
    scene: GlyphSceneSpec
  }

  type GlyphObject = LineSegments | Mesh
  type ThemeColors = {
    foreground: string
    line: string
    muted: string
    primary: string
  }

  let {
    animated = true,
    cpuUsagePercent = 0,
    foregroundColor = 'white',
    lineColor = 'white',
    memoryUsagePercent = 0,
    mutedColor = 'gray',
    primaryColor = lineColor,
    scene
  }: Props = $props()

  let root = $state<Group | undefined>()
  let sceneGroup = $state(new Group())
  let renderKey = $state(0)
  let currentGroup: Group | null = null
  let renderKeyCounter = 0

  const cpuLoad = $derived(Math.max(0, Math.min(1, cpuUsagePercent / 100)))
  const memoryLoad = $derived(Math.max(0, Math.min(1, memoryUsagePercent / 100)))
  const cameraFov = $derived(scene.camera?.fov ?? 46)
  const cameraZ = $derived(scene.camera?.z ?? 5.25)
  const animationRotation = $derived(scene.animation?.rotation ?? ([0.06, 0.26, 0.04] satisfies GlyphVector3))
  const animationSpeed = $derived(scene.animation?.speed ?? 1)

  function colorFor(value: string | undefined, colors: ThemeColors): string {
    if (value === 'muted') return colors.muted
    if (value === 'line') return colors.line
    if (value === 'primary') return colors.primary
    if (value === 'foreground') return colors.foreground
    if (value && /^#[\da-f]{3}(?:[\da-f]{3})?(?:[\da-f]{2})?$/i.test(value)) return value
    return colors.foreground
  }

  function geometryFor(object: GlyphSceneObjectSpec): BufferGeometry {
    const radius = object.radius ?? 1
    const segments = object.segments ?? 32

    switch (object.type) {
      case 'box': {
        const width = object.width ?? radius * 2
        const height = object.height ?? width
        const depth = object.depth ?? width
        return new BoxGeometry(width, height, depth)
      }
      case 'sphere':
        return new SphereGeometry(radius, segments, Math.max(8, Math.round(segments / 2)))
      case 'octahedron':
        return new OctahedronGeometry(radius, object.detail ?? 0)
      case 'tetrahedron':
        return new TetrahedronGeometry(radius, object.detail ?? 0)
      case 'torus':
        return new TorusGeometry(radius, object.tube ?? 0.05, 12, segments)
      case 'ring':
        return new RingGeometry(object.innerRadius ?? radius * 0.68, object.outerRadius ?? radius, segments)
      case 'icosahedron':
      default:
        return new IcosahedronGeometry(radius, object.detail ?? 0)
    }
  }

  function materialOpacity(object: GlyphSceneObjectSpec): number {
    if (typeof object.opacity === 'number') return object.opacity
    return object.mode === 'solid' ? 0.72 : 0.9
  }

  function createGlyphObject(object: GlyphSceneObjectSpec, colors: ThemeColors): GlyphObject {
    const geometry = geometryFor(object)
    const color = new Color(colorFor(object.color, colors))
    const opacity = materialOpacity(object)
    const mode = object.mode ?? 'edges'
    let rendered: GlyphObject

    if (mode === 'solid' || mode === 'wireframe') {
      rendered = new Mesh(
        geometry,
        new MeshBasicMaterial({ color, opacity, transparent: opacity < 1, wireframe: mode === 'wireframe' })
      )
    } else {
      const edges = new EdgesGeometry(geometry)
      geometry.dispose()
      rendered = new LineSegments(edges, new LineBasicMaterial({ color, opacity, transparent: opacity < 1 }))
    }

    const [x, y, z] = object.position ?? [0, 0, 0]
    const [rx, ry, rz] = object.rotation ?? [0, 0, 0]
    rendered.position.set(x, y, z)
    rendered.rotation.set(rx, ry, rz)

    if (Array.isArray(object.scale)) {
      rendered.scale.set(object.scale[0], object.scale[1], object.scale[2])
    } else if (typeof object.scale === 'number') {
      rendered.scale.setScalar(object.scale)
    }

    rendered.userData.baseScale = rendered.scale.clone()
    rendered.userData.baseOpacity = opacity
    rendered.userData.telemetryOpacity = object.telemetry?.opacity
    rendered.userData.telemetryScale = object.telemetry?.scale

    return rendered
  }

  function normalizeGroupBounds(group: Group, sceneBox: number): void {
    group.updateMatrixWorld(true)
    const bounds = new Box3().setFromObject(group)
    const size = bounds.getSize(new Vector3())
    const maxDimension = Math.max(size.x, size.y, size.z)

    if (!Number.isFinite(maxDimension) || maxDimension <= 0) return

    const center = bounds.getCenter(new Vector3())
    for (const child of group.children) {
      child.position.sub(center)
    }

    group.scale.setScalar(sceneBox / maxDimension)
  }

  function buildSceneGroup(glyphScene: GlyphSceneSpec, colors: ThemeColors): Group {
    const group = new Group()

    for (const object of glyphScene.objects) {
      group.add(createGlyphObject(object, colors))
    }

    normalizeGroupBounds(group, glyphScene.sceneBox ?? 3.2)
    return group
  }

  function objectMaterials(object: Object3D): Material[] {
    const material = (object as { material?: Material | Material[] }).material
    if (!material) return []
    return Array.isArray(material) ? material : [material]
  }

  function loadFor(signal: GlyphTelemetrySignal | undefined): number {
    if (signal === 'cpu') return cpuLoad
    if (signal === 'memory') return memoryLoad
    return 0
  }

  function applyTelemetry(group: Group): void {
    group.traverse(object => {
      const baseScale = object.userData.baseScale as Vector3 | undefined
      const telemetryScale = object.userData.telemetryScale as GlyphTelemetrySignal | undefined
      const telemetryOpacity = object.userData.telemetryOpacity as GlyphTelemetrySignal | undefined
      const baseOpacity = object.userData.baseOpacity as number | undefined

      if (baseScale) {
        const load = loadFor(telemetryScale)
        object.scale.copy(baseScale).multiplyScalar(1 + load * 0.18)
      }

      if (baseOpacity != null) {
        const load = loadFor(telemetryOpacity)
        for (const material of objectMaterials(object)) {
          material.opacity = Math.min(1, Math.max(0, baseOpacity * (telemetryOpacity ? 0.72 + load * 0.42 : 1)))
          material.transparent = material.opacity < 1
        }
      }
    })
  }

  function disposeObject(object: Object3D): void {
    const geometry = (object as { geometry?: BufferGeometry }).geometry
    geometry?.dispose()

    for (const material of objectMaterials(object)) {
      material.dispose()
    }
  }

  function disposeGroup(group: Group | null): void {
    group?.traverse(disposeObject)
  }

  $effect(() => {
    const previous = currentGroup
    const next = buildSceneGroup(scene, {
      foreground: foregroundColor,
      line: lineColor,
      muted: mutedColor,
      primary: primaryColor
    })

    currentGroup = next
    sceneGroup = next
    renderKey = ++renderKeyCounter
    disposeGroup(previous)
  })

  $effect(() => {
    applyTelemetry(sceneGroup)
  })

  useTask(delta => {
    if (!animated || !root) return

    const boostLoad = scene.animation?.telemetryBoost === 'memory' ? memoryLoad : scene.animation?.telemetryBoost === 'cpu' ? cpuLoad : 0
    const speed = animationSpeed * (1 + boostLoad * 0.75)
    root.rotation.x += delta * animationRotation[0] * speed
    root.rotation.y += delta * animationRotation[1] * speed
    root.rotation.z += delta * animationRotation[2] * speed
  })

  $effect(() => () => disposeGroup(currentGroup))
</script>

<T.PerspectiveCamera makeDefault position={[0, 0, cameraZ]} fov={cameraFov} />
<T.AmbientLight intensity={0.85} />
<T.Group bind:ref={root} rotation.x={-0.28} rotation.z={0.22}>
  {#key renderKey}
    <T is={sceneGroup} />
  {/key}
</T.Group>
