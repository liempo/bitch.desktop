const DEFAULT_MIN_THUMB_HEIGHT = 24
const DEFAULT_SCROLLBAR_WIDTH = 2
const AUTO_HIDE_DELAY_MS = 900

interface ScrollbarState {
  element: HTMLElement
  handleScroll: () => void
  hideTimer: number
  active: boolean
  dragging: boolean
  thumb: HTMLButtonElement
  thumbHeight: number
  thumbTop: number
  track: HTMLDivElement
}

export function installCustomScrollbars(): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => undefined

  const states = new Map<HTMLElement, ScrollbarState>()
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleUpdate)
  const mutationObserver = new MutationObserver(scheduleScan)
  let updateFrame = 0
  let scanFrame = 0

  function scheduleUpdate(): void {
    if (updateFrame) return

    updateFrame = window.requestAnimationFrame(() => {
      updateFrame = 0
      updateAll()
    })
  }

  function scheduleScan(): void {
    if (scanFrame) return

    scanFrame = window.requestAnimationFrame(() => {
      scanFrame = 0
      scan()
    })
  }

  function scrollableCandidate(element: HTMLElement): boolean {
    if (element.dataset.customScrollbar === 'true') return false
    if (element === document.body || element === document.documentElement) return false

    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false

    return ['auto', 'scroll', 'overlay'].includes(style.overflowY)
  }

  function setup(element: HTMLElement): void {
    if (states.has(element)) return

    const track = document.createElement('div')
    track.className = 'custom-scrollbar-track'
    track.dataset.customScrollbar = 'true'
    track.dataset.visible = 'false'
    track.setAttribute('aria-hidden', 'true')

    const thumb = document.createElement('button')
    thumb.className = 'custom-scrollbar-thumb'
    thumb.dataset.customScrollbar = 'true'
    thumb.type = 'button'
    thumb.tabIndex = -1
    thumb.setAttribute('aria-label', 'Scroll')

    track.append(thumb)
    themeHost(element).append(track)

    const state: ScrollbarState = {
      active: false,
      dragging: false,
      element,
      handleScroll: () => handleScroll(state),
      hideTimer: 0,
      thumb,
      thumbHeight: 0,
      thumbTop: 0,
      track
    }

    thumb.addEventListener('pointerdown', event => handlePointerDown(event, state))
    element.addEventListener('scroll', state.handleScroll, { passive: true })
    resizeObserver?.observe(element)
    states.set(element, state)
  }

  function cleanup(element: HTMLElement, state: ScrollbarState): void {
    if (state.hideTimer) window.clearTimeout(state.hideTimer)
    element.removeEventListener('scroll', state.handleScroll)
    resizeObserver?.unobserve(element)
    state.track.remove()
    states.delete(element)
  }

  function scan(): void {
    const candidates = new Set<HTMLElement>()

    for (const element of document.querySelectorAll<HTMLElement>('*')) {
      if (!scrollableCandidate(element)) continue

      candidates.add(element)
      setup(element)
    }

    for (const [element, state] of states) {
      if (!element.isConnected || !candidates.has(element)) cleanup(element, state)
      else if (state.track.parentElement !== themeHost(element)) themeHost(element).append(state.track)
    }

    scheduleUpdate()
  }

  function updateAll(): void {
    for (const state of states.values()) update(state)
  }

  function update(state: ScrollbarState): void {
    const { element, thumb, track } = state
    const rect = element.getBoundingClientRect()
    const maxScroll = element.scrollHeight - element.clientHeight
    const visible = element.isConnected && rect.width > 0 && rect.height > 0 && maxScroll > 1

    if (!visible) {
      track.hidden = true
      state.active = false
      track.dataset.visible = 'false'
      return
    }

    const elementStyle = window.getComputedStyle(element)
    const trackWidth = pixelValue(window.getComputedStyle(track).width, DEFAULT_SCROLLBAR_WIDTH)
    const trackOffsetX = pixelValue(elementStyle.getPropertyValue('--custom-scrollbar-offset-x'), 0)
    const minThumbHeight = pixelValue(window.getComputedStyle(thumb).minHeight, DEFAULT_MIN_THUMB_HEIGHT)
    const thumbHeight = Math.max(
      minThumbHeight,
      Math.floor((element.clientHeight / element.scrollHeight) * rect.height)
    )
    const maxThumbTop = Math.max(0, rect.height - thumbHeight)
    const thumbTop = maxScroll > 0 ? Math.floor((element.scrollTop / maxScroll) * maxThumbTop) : 0

    state.thumbHeight = thumbHeight
    state.thumbTop = thumbTop
    track.hidden = false
    track.dataset.visible = state.active ? 'true' : 'false'
    track.style.left = `${Math.floor(rect.right - trackWidth + trackOffsetX)}px`
    track.style.top = `${Math.floor(rect.top)}px`
    track.style.height = `${Math.floor(rect.height)}px`
    thumb.style.height = `${thumbHeight}px`
    thumb.style.transform = `translateY(${thumbTop}px)`
  }

  function handlePointerDown(event: PointerEvent, state: ScrollbarState): void {
    event.preventDefault()

    const { element, track } = state
    state.dragging = true
    reveal(state)

    const startY = event.clientY
    const startTop = state.thumbTop
    const maxThumbTop = Math.max(0, track.getBoundingClientRect().height - state.thumbHeight)
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)

    function handlePointerMove(moveEvent: PointerEvent): void {
      const nextTop = Math.min(maxThumbTop, Math.max(0, startTop + moveEvent.clientY - startY))
      element.scrollTop = maxThumbTop > 0 ? (nextTop / maxThumbTop) * maxScroll : 0
      update(state)
    }

    function handlePointerUp(): void {
      state.dragging = false
      scheduleHide(state)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  function handleScroll(state: ScrollbarState): void {
    reveal(state)
    scheduleUpdate()
  }

  function reveal(state: ScrollbarState): void {
    state.active = true
    if (state.hideTimer) window.clearTimeout(state.hideTimer)
    state.hideTimer = 0
    scheduleHide(state)
  }

  function scheduleHide(state: ScrollbarState): void {
    if (state.dragging) return
    if (state.hideTimer) window.clearTimeout(state.hideTimer)
    state.hideTimer = window.setTimeout(() => {
      state.hideTimer = 0
      state.active = false
      update(state)
    }, AUTO_HIDE_DELAY_MS)
  }

  function pixelValue(value: string, fallback: number): number {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  function themeHost(element: HTMLElement): HTMLElement {
    return element.closest<HTMLElement>('[data-theme]') ?? document.body
  }

  mutationObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style'],
    characterData: true,
    childList: true,
    subtree: true
  })
  window.addEventListener('resize', scheduleScan)
  window.addEventListener('scroll', scheduleUpdate, true)
  scan()

  return () => {
    if (updateFrame) window.cancelAnimationFrame(updateFrame)
    if (scanFrame) window.cancelAnimationFrame(scanFrame)
    mutationObserver.disconnect()
    resizeObserver?.disconnect()
    window.removeEventListener('resize', scheduleScan)
    window.removeEventListener('scroll', scheduleUpdate, true)

    for (const [element, state] of states) cleanup(element, state)
  }
}
