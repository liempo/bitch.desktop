<script lang="ts">
  import { T, useTask } from '@threlte/core'
  import { Color, EdgesGeometry, Group, IcosahedronGeometry, LineBasicMaterial, LineSegments } from 'three'

  interface Props {
    cpuUsagePercent?: number
    memoryUsagePercent?: number
    foregroundColor?: string
    mutedColor?: string
    lineColor?: string
  }

  let {
    cpuUsagePercent = 0,
    memoryUsagePercent = 0,
    foregroundColor = 'white',
    mutedColor = 'gray',
    lineColor = 'white'
  }: Props = $props()

  let group = $state<Group | undefined>()

  const cpuShape = new EdgesGeometry(new IcosahedronGeometry(1.65, 1))
  const memoryShape = new EdgesGeometry(new IcosahedronGeometry(1.18, 1))
  const cpuMaterial = new LineBasicMaterial({ color: new Color('white'), transparent: true, opacity: 0.95 })
  const memoryMaterial = new LineBasicMaterial({ color: new Color('gray'), transparent: true, opacity: 0.45 })
  const cpuLines = new LineSegments(cpuShape, cpuMaterial)
  const memoryLines = new LineSegments(memoryShape, memoryMaterial)

  const cpuLoad = $derived(Math.max(0, Math.min(1, cpuUsagePercent / 100)))
  const memoryLoad = $derived(Math.max(0, Math.min(1, memoryUsagePercent / 100)))

  $effect(() => {
    cpuMaterial.color.set(cpuUsagePercent > 82 ? lineColor : foregroundColor)
    cpuMaterial.opacity = 0.72 + cpuLoad * 0.28
    memoryMaterial.color.set(mutedColor)
    memoryMaterial.opacity = 0.3 + memoryLoad * 0.45
    cpuLines.scale.setScalar(0.94 + cpuLoad * 0.2)
    memoryLines.scale.setScalar(0.76 + memoryLoad * 0.36)
  })

  useTask(delta => {
    if (!group) return
    group.rotation.y += delta * (0.22 + cpuLoad * 0.95)
    group.rotation.x += delta * (0.06 + memoryLoad * 0.24)
  })
</script>

<T.PerspectiveCamera makeDefault position={[0, 0, 5.25]} fov={46} />
<T.AmbientLight intensity={0.8} />
<T.Group bind:ref={group} rotation.x={-0.28} rotation.z={0.22}>
  <T is={cpuLines} />
  <T is={memoryLines} rotation.x={0.55} rotation.y={0.3} />
</T.Group>
