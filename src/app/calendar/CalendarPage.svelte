<script lang="ts">
  import { Calendar, Popover } from 'bits-ui'
  import { CalendarDate, type DateValue } from '@internationalized/date'
  import { onMount, tick } from 'svelte'

  import BracketTrigger from '@/app/components/ui/BracketTrigger.svelte'
  import Dialog from '@/app/components/ui/Dialog.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import { menuItemClass, popoverClass } from '@/app/components/ui/styles'
  import {
    calendarDateKey,
    calendarEventOverlapsDate,
    createCalendarViewModel,
    formatCalendarEventTime,
    listenCalendarSyncUpdates,
    sortCalendarEvents,
    type CalendarEvent,
    type CalendarLoadOptions,
    type CalendarVisibleRangeOptions
  } from '$lib/calendar'

  const viewModel = createCalendarViewModel()

  const calendarShellClass = 'flex min-h-0 flex-1 flex-col text-ink'
  const calendarHeaderClass = 'mb-3 flex items-center justify-between gap-3 border-b border-line pb-3'
  const calendarHeaderTitleClass = 'min-w-0 truncate text-left font-hud text-2xl font-bold tracking-[0.04em] text-ink-bright'
  const calendarHeaderControlsClass = 'flex shrink-0 items-center gap-1'
  const calendarPanelActionClass = [
    'flex h-5 items-center justify-center rounded-control bg-transparent px-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.05em]',
    'hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-40'
  ].join(' ')
  const calendarViewMenuContentClass = `${popoverClass} z-50 w-48 p-1.5 font-mono`
  const calendarViewMenuItemBaseClass = `${menuItemClass} flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] uppercase tracking-[0.08em]`
  const calendarGridClass = 'w-full table-fixed border-collapse text-left'
  const calendarWeekdayHeaderClass = 'sticky top-0 z-[1] grid grid-cols-7 border-b border-line bg-surface/95 backdrop-blur'
  const calendarWeekdayCellClass = 'px-2 py-2 text-right font-hud text-[0.58rem] tracking-[0.16em] text-ink-muted'
  const calendarCellClass = 'h-28 border border-line/70 align-top'
  const calendarDayBaseClass = [
    'group flex h-full min-h-28 w-full flex-col items-stretch gap-1 border p-2 text-left transition',
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2'
  ].join(' ')
  const calendarDesktopMediaQuery = '(min-width: 768px)'
  const agendaDayRowHeightPx = 360
  const agendaVirtualOverscanRows = 3
  const agendaVirtualWindowRows = 1200
  const initialEventMonthWindow = 6
  const eventLazyMonthStep = 24
  const maxProgrammaticScrollDurationMs = 360
  const minProgrammaticScrollDurationMs = 120
  const monthEventLoaderSlotHeightPx = 28
  const monthVirtualMonthWindow = 1200
  const monthVirtualOverscanRows = 6
  const monthWeekRowHeightPx = 112
  type CalendarView = 'day' | 'month'
  type CalendarScrollBehavior = 'auto' | 'instant' | 'smooth'
  type LinkedTextSegment = { kind: 'link'; href: string; text: string } | { kind: 'text'; text: string }

  interface VirtualAgendaGrid {
    rowCount: number
    startKey: string
  }

  interface VirtualAgendaRow {
    dateKeys: string[]
    index: number
    key: string
    label: string
  }

  interface VirtualAgendaWindow {
    bottomSpacerHeight: number
    rows: VirtualAgendaRow[]
    topSpacerHeight: number
  }

  interface MonthDayCell {
    date: CalendarDate
    dateKey: string
    month: CalendarDate
  }

  type MonthWeek = MonthDayCell[]

  interface VirtualMonthGrid {
    startKey: string
    weekCount: number
  }

  interface VirtualWeekRow {
    index: number
    monthKey: string
    startKey: string
    week: MonthWeek
  }

  interface VirtualWeekWindow {
    bottomSpacerHeight: number
    rows: VirtualWeekRow[]
    topSpacerHeight: number
  }

  interface VisibleMonthScore {
    count: number
  }

  const calendarViews: { id: CalendarView; label: string }[] = [
    { id: 'month', label: 'Month' },
    { id: 'day', label: 'Day' }
  ]

  const eventCardClass = [
    'block w-full !border !border-solid border-line bg-surface-raised p-3 text-left transition',
    'hover:border-line-strong hover:bg-canvas/75'
  ].join(' ')
  const eventPillClass = 'rounded-control border border-line bg-canvas px-1.5 py-0.5 text-[0.62rem] text-ink-muted'
  const eventLinkClass = 'break-all text-secondary underline-offset-2 hover:text-ink-bright hover:underline'

  let calendarView = $state<CalendarView>(initialCalendarView())
  let calendarDesktopViewport = $state(initialCalendarDesktopViewport())
  let agendaAnchorKey = $state(viewModel.selectedDateKey)
  let agendaScrollAnimationFrame: null | number = null
  let agendaScrollFrame: null | number = null
  let agendaScroller = $state<HTMLElement | null>(null)
  let agendaViewportHeight = $state(agendaDayRowHeightPx)
  let agendaVirtualScrollTop = $state(0)
  let currentMonthInViewKey = $state(viewModel.visibleAnchorKey)
  let eventLoadingAfter = $state(false)
  let eventLoadingBefore = $state(false)
  let eventMonthsAfter = $state(initialEventMonthWindow)
  let eventMonthsBefore = $state(initialEventMonthWindow)
  let eventRangeLoadToken = 0
  let initialCalendarLoading = $state(true)
  let calendarViewMenuOpen = $state(false)
  let eventDetailDialogOpen = $state(false)
  let monthScrollAnimationFrame: null | number = null
  let monthScrollFrame: null | number = null
  let monthScroller = $state<HTMLElement | null>(null)
  let monthVirtualScrollTop = $state(0)
  let monthViewportHeight = $state(monthWeekRowHeightPx * 6)
  let programmaticAgendaScrollEndTimer: null | number = null
  let programmaticAgendaScrollTargetKey = ''
  let programmaticMonthScrollEndTimer: null | number = null
  let programmaticMonthScrollTargetKey = ''
  let selectedMonthEventUid = $state('')
  let selectedAgendaEventUid = $state('')
  let selectedDate = $state<DateValue | undefined>(dateValueFromKey(viewModel.selectedDateKey))
  let visibleMonth = $state<DateValue>(dateValueFromKey(viewModel.selectedDateKey))

  const selectedDateLabel = $derived(formatDateLabel(viewModel.selectedDateKey))
  const eventRangeOptions = $derived.by<CalendarVisibleRangeOptions>(() => ({
    monthsAfter: eventMonthsAfter,
    monthsBefore: eventMonthsBefore
  }))
  const monthVirtualGrid = $derived.by<VirtualMonthGrid>(() => createVirtualMonthGrid(visibleMonth.toString(), monthVirtualMonthWindow, monthVirtualMonthWindow))
  const agendaVirtualGrid = $derived.by<VirtualAgendaGrid>(() => createVirtualAgendaGrid(agendaAnchorKey))
  const virtualAgendaWindow = $derived.by<VirtualAgendaWindow>(() => createVirtualAgendaWindow(agendaVirtualGrid, agendaVirtualScrollTop, agendaViewportHeight))
  const virtualWeekWindow = $derived.by<VirtualWeekWindow>(() => createVirtualWeekWindow(monthVirtualGrid, monthVirtualScrollTop, monthViewportHeight))
  const monthEventsByDate = $derived.by<Map<string, CalendarEvent[]>>(() => monthEventMap(viewModel.events))
  const selectedMonthEvent = $derived.by<CalendarEvent | null>(() => viewModel.events.find(event => event.uid === selectedMonthEventUid) ?? null)
  const selectedAgendaEvent = $derived.by<CalendarEvent | null>(() => viewModel.events.find(event => event.uid === selectedAgendaEventUid) ?? null)
  const monthLayoutClass = $derived(
    selectedMonthEvent ? 'grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] gap-3' : 'grid min-h-0 flex-1 gap-3'
  )
  const agendaLayoutClass = $derived(
    selectedAgendaEvent ? 'grid min-h-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]' : 'grid min-h-0 flex-1 gap-3'
  )
  const currentMonthInViewLabel = $derived(formatMonthHeading(currentMonthInViewKey || visibleMonth.toString()))
  const calendarViewOptions = $derived.by(() => calendarViews.filter(view => isCalendarViewEnabled(view.id)))
  const selectedCalendarViewLabel = $derived(calendarViews.find(view => view.id === calendarView)?.label.toLowerCase() ?? calendarView)
  const activeDateLabel = $derived(selectedDateLabel)
  const selectedAgendaEventDialogDescription = $derived(
    selectedAgendaEvent ? [selectedAgendaEvent.calendarName, formatCalendarEventTime(selectedAgendaEvent)].filter(Boolean).join(' · ') : ''
  )

  $effect(() => {
    if (!selectedAgendaEvent) eventDetailDialogOpen = false
  })

  $effect(() => {
    if (selectedAgendaEvent && !eventDetailDialogOpen && !calendarDesktopViewport) selectedAgendaEventUid = ''
  })



  onMount(() => {
    let disposed = false
    let unlisten: undefined | (() => void)
    const mediaQuery = window.matchMedia(calendarDesktopMediaQuery)
    const handleViewportChange = (event: MediaQueryListEvent) => syncCalendarDesktopViewport(event.matches)

    syncCalendarDesktopViewport(mediaQuery.matches, false)
    mediaQuery.addEventListener('change', handleViewportChange)

    void tick().then(() => {
      if (calendarView === 'month') {
        syncMonthViewportMetrics()
        void scrollMonthIntoView(visibleMonth.toString(), 'auto')
        return
      }

      syncAgendaViewportMetrics()
      void scrollAgendaIntoView(viewModel.selectedDateKey, 'auto')
    })
    void loadCalendarViewRange({ background: true }).finally(() => {
      initialCalendarLoading = false
    })
    void listenCalendarSyncUpdates(() => {
      void loadCalendarViewRange({ background: true })
    }).then(stopListening => {
      if (disposed) {
        stopListening()
      } else {
        unlisten = stopListening
      }
    })

    return () => {
      disposed = true
      if (agendaScrollFrame !== null) window.cancelAnimationFrame(agendaScrollFrame)
      if (agendaScrollAnimationFrame !== null) window.cancelAnimationFrame(agendaScrollAnimationFrame)
      if (monthScrollFrame !== null) window.cancelAnimationFrame(monthScrollFrame)
      if (monthScrollAnimationFrame !== null) window.cancelAnimationFrame(monthScrollAnimationFrame)
      if (programmaticAgendaScrollEndTimer !== null) window.clearTimeout(programmaticAgendaScrollEndTimer)
      if (programmaticMonthScrollEndTimer !== null) window.clearTimeout(programmaticMonthScrollEndTimer)
      agendaScrollFrame = null
      agendaScrollAnimationFrame = null
      monthScrollFrame = null
      monthScrollAnimationFrame = null
      programmaticAgendaScrollEndTimer = null
      programmaticAgendaScrollTargetKey = ''
      programmaticMonthScrollEndTimer = null
      programmaticMonthScrollTargetKey = ''
      mediaQuery.removeEventListener('change', handleViewportChange)
      unlisten?.()
    }
  })

  function initialCalendarDesktopViewport(): boolean {
    return typeof window === 'undefined' ? true : window.matchMedia(calendarDesktopMediaQuery).matches
  }

  function initialCalendarView(): CalendarView {
    return initialCalendarDesktopViewport() ? 'month' : 'day'
  }

  function syncCalendarDesktopViewport(matches: boolean, load = true): void {
    calendarDesktopViewport = matches
    if (matches) eventDetailDialogOpen = false
    if (!matches && selectedAgendaEventUid && calendarView !== 'month') eventDetailDialogOpen = true
    if (matches || calendarView !== 'month') return

    calendarViewMenuOpen = false
    calendarView = 'day'
    agendaAnchorKey = viewModel.selectedDateKey
    selectedMonthEventUid = ''
    selectedAgendaEventUid = ''
    eventDetailDialogOpen = false
    void scrollAgendaIntoView(viewModel.selectedDateKey, 'auto')
    if (load) void loadCalendarViewRange({ background: true })
  }

  function isCalendarViewEnabled(view: CalendarView): boolean {
    return calendarDesktopViewport || view !== 'month'
  }

  function dateValueFromKey(key: string): CalendarDate {
    const [year, month, day] = key.split('-').map(part => Number(part))
    return new CalendarDate(year || 1970, month || 1, day || 1)
  }

  function handleDateChange(value: DateValue | undefined): void {
    selectedDate = value
    if (value) viewModel.selectDate(value.toString())
  }

  function activeRangeOptions(): CalendarVisibleRangeOptions {
    return eventRangeOptions
  }

  function loadCalendarViewRange(loadOptions: CalendarLoadOptions = {}): Promise<boolean> {
    return viewModel.loadVisibleRange(activeRangeOptions(), loadOptions)
  }

  function loadCalendarRange(rangeOptions: CalendarVisibleRangeOptions, loadOptions: CalendarLoadOptions = {}): Promise<boolean> {
    return viewModel.loadVisibleRange(rangeOptions, loadOptions)
  }

  function monthRangeOptions(monthsBefore: number, monthsAfter: number): CalendarVisibleRangeOptions {
    return { monthsAfter, monthsBefore }
  }

  function handleVisibleMonthChange(value: DateValue): void {
    visibleMonth = value
    currentMonthInViewKey = monthStartKey(value.toString())
    viewModel.setVisibleAnchor(value.toString())
    void scrollMonthIntoView(value.toString(), 'auto')
  }

  async function scrollMonthIntoView(dateKey: string, behavior: CalendarScrollBehavior = 'smooth'): Promise<void> {
    const targetMonthKey = monthStartKey(dateKey)
    await tick()
    window.requestAnimationFrame(() => {
      const scroller = monthScroller
      if (!scroller) return

      syncMonthViewportMetrics(scroller)
      scrollMonthScroller(scroller, monthScrollTopForMonth(targetMonthKey), targetMonthKey, behavior)
      currentMonthInViewKey = targetMonthKey
      maybeLoadEventsForMonth(targetMonthKey)
    })
  }

  function scrollMonthScroller(scroller: HTMLElement, targetTop: number, targetMonthKey: string, behavior: CalendarScrollBehavior): void {
    if (monthScrollAnimationFrame !== null) window.cancelAnimationFrame(monthScrollAnimationFrame)
    monthScrollAnimationFrame = null
    beginProgrammaticMonthScroll(targetMonthKey, behavior)

    if (behavior !== 'smooth') {
      scroller.scrollTop = targetTop
      monthVirtualScrollTop = Math.max(0, targetTop - monthEventLoaderSlotHeightPx)
      return
    }

    const startTop = scroller.scrollTop
    const distance = targetTop - startTop
    if (Math.abs(distance) < 2) {
      scroller.scrollTop = targetTop
      monthVirtualScrollTop = Math.max(0, targetTop - monthEventLoaderSlotHeightPx)
      scheduleProgrammaticMonthScrollEnd(80)
      return
    }

    const duration = Math.min(maxProgrammaticScrollDurationMs, Math.max(minProgrammaticScrollDurationMs, Math.abs(distance) * 0.04))
    const startedAt = performance.now()

    function step(now: number): void {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextTop = startTop + distance * eased
      scroller.scrollTop = nextTop
      monthVirtualScrollTop = Math.max(0, nextTop - monthEventLoaderSlotHeightPx)

      if (progress < 1) {
        monthScrollAnimationFrame = window.requestAnimationFrame(step)
        return
      }

      scroller.scrollTop = targetTop
      monthVirtualScrollTop = Math.max(0, targetTop - monthEventLoaderSlotHeightPx)
      monthScrollAnimationFrame = null
      scheduleProgrammaticMonthScrollEnd(80)
    }

    monthScrollAnimationFrame = window.requestAnimationFrame(step)
  }

  function beginProgrammaticMonthScroll(targetMonthKey: string, behavior: CalendarScrollBehavior): void {
    if (programmaticMonthScrollEndTimer !== null) window.clearTimeout(programmaticMonthScrollEndTimer)
    programmaticMonthScrollEndTimer = null

    if (behavior !== 'smooth') {
      programmaticMonthScrollTargetKey = ''
      return
    }

    programmaticMonthScrollTargetKey = targetMonthKey
  }

  function scheduleProgrammaticMonthScrollEnd(delayMs = 180): void {
    if (!programmaticMonthScrollTargetKey) return
    if (programmaticMonthScrollEndTimer !== null) window.clearTimeout(programmaticMonthScrollEndTimer)

    programmaticMonthScrollEndTimer = window.setTimeout(() => {
      programmaticMonthScrollEndTimer = null
      programmaticMonthScrollTargetKey = ''
      updateHighlightedMonthFromScroll()
    }, delayMs)
  }

  function syncMonthViewportMetrics(scroller = monthScroller): void {
    if (!scroller) return

    monthVirtualScrollTop = monthGridScrollTop(scroller)
    monthViewportHeight = Math.max(monthWeekRowHeight(), scroller.clientHeight)
  }

  function handleMonthScroll(): void {
    if (monthScrollFrame !== null) return

    monthScrollFrame = window.requestAnimationFrame(() => {
      monthScrollFrame = null
      syncMonthViewportMetrics()
      updateHighlightedMonthFromScroll()
    })
  }

  function updateHighlightedMonthFromScroll(): void {
    const scroller = monthScroller
    if (!scroller) return

    if (programmaticMonthScrollTargetKey) {
      currentMonthInViewKey = programmaticMonthScrollTargetKey
      scheduleProgrammaticMonthScrollEnd()
      return
    }

    const bestKey = highlightedMonthKey(scroller) || currentMonthInViewKey

    if (bestKey && bestKey !== currentMonthInViewKey) currentMonthInViewKey = bestKey
    if (bestKey) maybeLoadEventsForMonth(bestKey)
  }

  function highlightedMonthKey(scroller: HTMLElement): string {
    const rowHeight = monthWeekRowHeight()
    const firstVisibleIndex = clamp(Math.floor(monthGridScrollTop(scroller) / rowHeight), 0, monthVirtualGrid.weekCount - 1)
    const visibleRowCount = Math.ceil(scroller.clientHeight / rowHeight) + 1
    const scores = new Map<string, VisibleMonthScore>()

    for (let index = firstVisibleIndex; index < Math.min(monthVirtualGrid.weekCount, firstVisibleIndex + visibleRowCount); index += 1) {
      for (const cell of monthWeekAtIndex(monthVirtualGrid, index)) {
        const month = monthStartKey(cell.dateKey)
        const score = scores.get(month) ?? { count: 0 }
        score.count += 1
        scores.set(month, score)
      }
    }

    const currentKey = monthStartKey(currentMonthInViewKey)
    return [...scores.entries()].sort((left, right) => {
      const countDelta = right[1].count - left[1].count
      if (countDelta !== 0) return countDelta

      if (left[0] === currentKey && right[0] !== currentKey) return -1
      if (right[0] === currentKey && left[0] !== currentKey) return 1

      return left[0].localeCompare(right[0])
    })[0]?.[0] ?? ''
  }

  function monthGridScrollTop(scroller: HTMLElement): number {
    return Math.max(0, scroller.scrollTop - monthEventLoaderSlotHeightPx)
  }

  function monthWeekRowHeight(): number {
    return monthWeekRowHeightPx
  }

  async function scrollAgendaIntoView(dateKey: string, behavior: CalendarScrollBehavior = 'smooth'): Promise<void> {
    if (calendarView === 'month') return

    const targetKey = agendaRowKeyForDate(dateKey)
    await tick()
    window.requestAnimationFrame(() => {
      const scroller = agendaScroller
      if (!scroller) return

      syncAgendaViewportMetrics(scroller)
      scrollAgendaScroller(scroller, agendaScrollTopForDate(dateKey), targetKey, behavior)
      selectAgendaDate(targetKey)
      maybeLoadEventsForMonth(targetKey)
    })
  }

  function scrollAgendaScroller(scroller: HTMLElement, targetTop: number, targetKey: string, behavior: CalendarScrollBehavior): void {
    if (agendaScrollAnimationFrame !== null) window.cancelAnimationFrame(agendaScrollAnimationFrame)
    agendaScrollAnimationFrame = null
    beginProgrammaticAgendaScroll(targetKey, behavior)

    if (behavior !== 'smooth') {
      scroller.scrollTop = targetTop
      agendaVirtualScrollTop = targetTop
      return
    }

    const startTop = scroller.scrollTop
    const distance = targetTop - startTop
    if (Math.abs(distance) < 2) {
      scroller.scrollTop = targetTop
      agendaVirtualScrollTop = targetTop
      scheduleProgrammaticAgendaScrollEnd(80)
      return
    }

    const duration = Math.min(maxProgrammaticScrollDurationMs, Math.max(minProgrammaticScrollDurationMs, Math.abs(distance) * 0.04))
    const startedAt = performance.now()

    function step(now: number): void {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const nextTop = startTop + distance * eased
      scroller.scrollTop = nextTop
      agendaVirtualScrollTop = nextTop

      if (progress < 1) {
        agendaScrollAnimationFrame = window.requestAnimationFrame(step)
        return
      }

      scroller.scrollTop = targetTop
      agendaVirtualScrollTop = targetTop
      agendaScrollAnimationFrame = null
      scheduleProgrammaticAgendaScrollEnd(80)
    }

    agendaScrollAnimationFrame = window.requestAnimationFrame(step)
  }

  function beginProgrammaticAgendaScroll(targetKey: string, behavior: CalendarScrollBehavior): void {
    if (programmaticAgendaScrollEndTimer !== null) window.clearTimeout(programmaticAgendaScrollEndTimer)
    programmaticAgendaScrollEndTimer = null

    if (behavior !== 'smooth') {
      programmaticAgendaScrollTargetKey = ''
      return
    }

    programmaticAgendaScrollTargetKey = targetKey
  }

  function scheduleProgrammaticAgendaScrollEnd(delayMs = 180): void {
    if (!programmaticAgendaScrollTargetKey) return
    if (programmaticAgendaScrollEndTimer !== null) window.clearTimeout(programmaticAgendaScrollEndTimer)

    programmaticAgendaScrollEndTimer = window.setTimeout(() => {
      programmaticAgendaScrollEndTimer = null
      programmaticAgendaScrollTargetKey = ''
      updateSelectedAgendaFromScroll()
    }, delayMs)
  }

  function syncAgendaViewportMetrics(scroller = agendaScroller): void {
    if (!scroller || calendarView === 'month') return

    agendaVirtualScrollTop = scroller.scrollTop
    agendaViewportHeight = Math.max(agendaRowHeight(), scroller.clientHeight)
  }

  function handleAgendaScroll(): void {
    if (agendaScrollFrame !== null) return

    agendaScrollFrame = window.requestAnimationFrame(() => {
      agendaScrollFrame = null
      syncAgendaViewportMetrics()
      updateSelectedAgendaFromScroll()
    })
  }

  function updateSelectedAgendaFromScroll(): void {
    const scroller = agendaScroller
    if (!scroller || calendarView === 'month') return

    if (programmaticAgendaScrollTargetKey) {
      selectAgendaDate(programmaticAgendaScrollTargetKey)
      maybeLoadEventsForMonth(programmaticAgendaScrollTargetKey)
      scheduleProgrammaticAgendaScrollEnd()
      return
    }

    const bestKey = highlightedAgendaKey(scroller) || viewModel.selectedDateKey
    if (bestKey && bestKey !== viewModel.selectedDateKey) selectAgendaDate(bestKey)
    if (bestKey) maybeLoadEventsForMonth(bestKey)
  }

  function highlightedAgendaKey(scroller: HTMLElement): string {
    const rowHeight = agendaRowHeight()
    const sampleTop = scroller.scrollTop + Math.min(scroller.clientHeight * 0.35, rowHeight * 0.8)
    const rowIndex = clamp(Math.floor(sampleTop / rowHeight), 0, agendaVirtualGrid.rowCount - 1)
    return agendaRowAtIndex(agendaVirtualGrid, rowIndex).key
  }

  function selectAgendaDate(dateKey: string): void {
    selectedDate = dateValueFromKey(dateKey)
    currentMonthInViewKey = monthStartKey(dateKey)
    viewModel.selectDate(dateKey)
  }

  function agendaRowHeight(): number {
    return agendaDayRowHeightPx
  }

  function agendaScrollTopForDate(dateKey: string): number {
    return agendaRowIndexForDate(dateKey, agendaVirtualGrid) * agendaRowHeight()
  }

  function agendaRowIndexForDate(dateKey: string, grid: VirtualAgendaGrid): number {
    const gridStart = localDateFromKey(grid.startKey)
    const target = localDateFromKey(dateKey)
    const rowOffset = daysBetween(gridStart, target)
    return clamp(rowOffset, 0, grid.rowCount - 1)
  }

  function agendaRowKeyForDate(dateKey: string): string {
    return dateKey
  }

  function selectMonthDate(dateKey: string): void {
    selectedDate = dateValueFromKey(dateKey)
    viewModel.selectDate(dateKey)
  }

  function selectMonthEvent(clickEvent: MouseEvent, calendarEvent: CalendarEvent, dateKey: string): void {
    clickEvent.stopPropagation()
    selectedAgendaEventUid = ''
    eventDetailDialogOpen = false
    selectedMonthEventUid = calendarEvent.uid
    selectMonthDate(dateKey)
  }

  function openAgendaEventDetail(calendarEvent: CalendarEvent): void {
    selectedMonthEventUid = ''
    selectedAgendaEventUid = calendarEvent.uid
    if (!calendarDesktopViewport) eventDetailDialogOpen = true
  }

  function closeMonthEventDetail(): void {
    selectedMonthEventUid = ''
  }

  function closeAgendaEventDetail(): void {
    selectedAgendaEventUid = ''
    eventDetailDialogOpen = false
  }

  function closeEventDetail(): void {
    closeMonthEventDetail()
    closeAgendaEventDetail()
  }

  function navigateVisibleMonth(offset: number): void {
    const targetMonthKey = monthStartKeyWithOffset(currentMonthInViewKey || visibleMonth.toString(), offset)
    currentMonthInViewKey = targetMonthKey
    void scrollMonthIntoView(targetMonthKey, 'smooth')
  }

  function selectToday(): void {
    const today = new CalendarDate(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())
    const todayKey = today.toString()
    selectedDate = today
    currentMonthInViewKey = monthStartKey(todayKey)
    viewModel.selectDate(todayKey)

    if (calendarView === 'month') {
      void scrollMonthIntoView(todayKey, 'smooth')
      return
    }

    agendaAnchorKey = todayKey
    visibleMonth = today
    viewModel.setVisibleAnchor(todayKey)
    void scrollAgendaIntoView(todayKey, 'smooth')
    void loadCalendarViewRange({ background: true })
  }

  function selectCalendarView(view: CalendarView): void {
    calendarViewMenuOpen = false
    if (!isCalendarViewEnabled(view)) return

    calendarView = view
    if (view !== 'month') {
      agendaAnchorKey = viewModel.selectedDateKey
      selectedMonthEventUid = ''
      void scrollAgendaIntoView(viewModel.selectedDateKey, 'auto')
      void loadCalendarViewRange({ background: true })
      return
    }

    selectedAgendaEventUid = ''
    eventDetailDialogOpen = false
    visibleMonth = dateValueFromKey(viewModel.selectedDateKey)
    viewModel.setVisibleAnchor(viewModel.selectedDateKey)
    void scrollMonthIntoView(visibleMonth.toString(), 'auto')
  }

  function dateKeyFromLocalDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  function calendarDateFromLocalDate(date: Date): CalendarDate {
    return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }

  function monthKey(dateKey: string): string {
    return dateKey.slice(0, 7)
  }

  function monthStartKey(dateKey: string): string {
    return `${monthKey(dateKey)}-01`
  }

  function monthStartKeyWithOffset(dateKey: string, offset: number): string {
    const date = localDateFromKey(dateKey)
    return dateKeyFromLocalDate(new Date(date.getFullYear(), date.getMonth() + offset, 1))
  }

  function monthIndex(dateKey: string): number {
    const date = localDateFromKey(dateKey)
    return date.getFullYear() * 12 + date.getMonth()
  }

  function monthOffsetFromVisibleAnchor(dateKey: string): number {
    return monthIndex(dateKey) - monthIndex(visibleMonth.toString())
  }

  function localDateFromKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(part => Number(part))
    return new Date(year || 1970, (month || 1) - 1, day || 1)
  }

  function localNoonMs(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime()
  }

  function daysBetween(start: Date, end: Date): number {
    return Math.max(0, Math.round((localNoonMs(end) - localNoonMs(start)) / 86_400_000))
  }

  function startOfWeek(date: Date): Date {
    const start = new Date(date)
    start.setDate(date.getDate() - date.getDay())
    return start
  }

  function endOfWeek(date: Date): Date {
    const end = new Date(date)
    end.setDate(date.getDate() + (6 - date.getDay()))
    return end
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
  }



  function eventsForDateKey(dateKey: string): CalendarEvent[] {
    return monthEventsByDate.get(dateKey) ?? []
  }

  function eventsForDateKeys(dateKeys: string[]): CalendarEvent[] {
    const eventsByUid = new Map<string, CalendarEvent>()
    for (const dateKey of dateKeys) {
      for (const event of eventsForDateKey(dateKey)) {
        eventsByUid.set(event.uid, event)
      }
    }

    return sortCalendarEvents([...eventsByUid.values()])
  }

  function monthEventMap(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
    const eventsByDate = new Map<string, CalendarEvent[]>()

    for (const event of events) {
      const startKey = calendarDateKey(event.startsAt)
      const endKey = calendarDateKey(event.endsAt) || startKey
      if (!startKey) continue

      const cursor = localDateFromKey(startKey)
      const end = localDateFromKey(endKey)
      if (end < cursor) end.setTime(cursor.getTime())

      for (let days = 0; cursor <= end && days < 3700; days += 1) {
        const dateKey = dateKeyFromLocalDate(cursor)
        if (calendarEventOverlapsDate(event, dateKey)) {
          const dateEvents = eventsByDate.get(dateKey) ?? []
          dateEvents.push(event)
          eventsByDate.set(dateKey, dateEvents)
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }

    for (const [dateKey, dateEvents] of eventsByDate.entries()) {
      if (dateEvents.length > 1) eventsByDate.set(dateKey, sortCalendarEvents(dateEvents))
    }

    return eventsByDate
  }

  function createVirtualMonthGrid(anchorKey: string, monthsBefore: number, monthsAfter: number): VirtualMonthGrid {
    const anchor = localDateFromKey(anchorKey)
    const firstOfStartMonth = new Date(anchor.getFullYear(), anchor.getMonth() - Math.max(0, Math.floor(monthsBefore)), 1)
    const lastOfEndMonth = new Date(anchor.getFullYear(), anchor.getMonth() + Math.max(0, Math.floor(monthsAfter)) + 1, 0)
    const start = startOfWeek(firstOfStartMonth)
    const end = endOfWeek(lastOfEndMonth)

    return {
      startKey: dateKeyFromLocalDate(start),
      weekCount: Math.max(1, Math.floor(daysBetween(start, end) / 7) + 1)
    }
  }

  function createVirtualAgendaGrid(anchorKey: string): VirtualAgendaGrid {
    const start = localDateFromKey(anchorKey)
    start.setDate(start.getDate() - agendaVirtualWindowRows)

    return {
      rowCount: agendaVirtualWindowRows * 2 + 1,
      startKey: dateKeyFromLocalDate(start)
    }
  }

  function createVirtualAgendaWindow(grid: VirtualAgendaGrid, scrollTop: number, viewportHeight: number): VirtualAgendaWindow {
    const rowHeight = agendaRowHeight()
    const firstVisibleIndex = clamp(Math.floor(scrollTop / rowHeight) - agendaVirtualOverscanRows, 0, Math.max(0, grid.rowCount - 1))
    const visibleRowCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight) + agendaVirtualOverscanRows * 2
    const endIndex = Math.min(grid.rowCount, firstVisibleIndex + visibleRowCount)
    const rows: VirtualAgendaRow[] = []

    for (let index = firstVisibleIndex; index < endIndex; index += 1) {
      rows.push(agendaRowAtIndex(grid, index))
    }

    return {
      bottomSpacerHeight: Math.max(0, (grid.rowCount - endIndex) * rowHeight),
      rows,
      topSpacerHeight: firstVisibleIndex * rowHeight
    }
  }

  function agendaRowAtIndex(grid: VirtualAgendaGrid, index: number): VirtualAgendaRow {
    const cursor = localDateFromKey(grid.startKey)
    cursor.setDate(cursor.getDate() + index)
    const key = dateKeyFromLocalDate(cursor)

    return {
      dateKeys: [key],
      index,
      key,
      label: formatDateLabel(key)
    }
  }

  function createVirtualWeekWindow(grid: VirtualMonthGrid, scrollTop: number, viewportHeight: number): VirtualWeekWindow {
    const rowHeight = monthWeekRowHeight()
    const firstVisibleIndex = clamp(Math.floor(scrollTop / rowHeight) - monthVirtualOverscanRows, 0, Math.max(0, grid.weekCount - 1))
    const visibleRowCount = Math.ceil(Math.max(viewportHeight, rowHeight) / rowHeight) + monthVirtualOverscanRows * 2
    const endIndex = Math.min(grid.weekCount, firstVisibleIndex + visibleRowCount)
    const rows: VirtualWeekRow[] = []

    for (let index = firstVisibleIndex; index < endIndex; index += 1) {
      const week = monthWeekAtIndex(grid, index)
      rows.push({
        index,
        monthKey: dominantMonthKey(week),
        startKey: week[0]?.dateKey ?? '',
        week
      })
    }

    return {
      bottomSpacerHeight: Math.max(0, (grid.weekCount - endIndex) * rowHeight),
      rows,
      topSpacerHeight: firstVisibleIndex * rowHeight
    }
  }

  function monthWeekAtIndex(grid: VirtualMonthGrid, index: number): MonthWeek {
    const cursor = localDateFromKey(grid.startKey)
    cursor.setDate(cursor.getDate() + index * 7)
    return monthWeekFromStartDate(cursor)
  }

  function monthWeekFromStartDate(startDate: Date): MonthWeek {
    const cursor = new Date(startDate)
    const week: MonthWeek = []

    for (let index = 0; index < 7; index += 1) {
      const date = new Date(cursor)
      const dateKey = dateKeyFromLocalDate(date)
      const calendarDate = calendarDateFromLocalDate(date)
      week.push({ date: calendarDate, dateKey, month: new CalendarDate(calendarDate.year, calendarDate.month, 1) })
      cursor.setDate(cursor.getDate() + 1)
    }

    return week
  }

  function dominantMonthKey(week: MonthWeek): string {
    const firstOfMonth = week.find(cell => cell.dateKey.endsWith('-01'))
    if (firstOfMonth) return monthStartKey(firstOfMonth.dateKey)

    const counts = new Map<string, number>()
    for (const cell of week) counts.set(monthStartKey(cell.dateKey), (counts.get(monthStartKey(cell.dateKey)) ?? 0) + 1)

    return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? viewModel.visibleAnchorKey
  }

  function isCurrentMonthCell(dateKey: string): boolean {
    return monthKey(dateKey) === monthKey(currentMonthInViewKey)
  }

  function isSelectedDateCell(dateKey: string): boolean {
    return dateKey === viewModel.selectedDateKey
  }

  function isTodayCell(dateKey: string): boolean {
    return dateKey === dateKeyFromLocalDate(new Date())
  }

  function monthScrollTopForMonth(monthKeyValue: string): number {
    return monthEventLoaderSlotHeightPx + monthWeekIndex(monthStartKey(monthKeyValue)) * monthWeekRowHeight()
  }

  function monthWeekIndex(monthKeyValue: string): number {
    const firstOfMonth = localDateFromKey(monthStartKey(monthKeyValue))
    const firstWeekStart = startOfWeek(firstOfMonth)
    const gridStart = localDateFromKey(monthVirtualGrid.startKey)

    return clamp(Math.round(daysBetween(gridStart, firstWeekStart) / 7), 0, monthVirtualGrid.weekCount - 1)
  }

  function maybeLoadEventsForMonth(monthInViewKey: string): void {
    const offset = monthOffsetFromVisibleAnchor(monthStartKey(monthInViewKey))
    if (offset <= -eventMonthsBefore + 1) {
      extendEventRange('before', Math.max(eventMonthsBefore + eventLazyMonthStep, Math.abs(offset) + initialEventMonthWindow))
    }
    if (offset >= eventMonthsAfter - 1) {
      extendEventRange('after', Math.max(eventMonthsAfter + eventLazyMonthStep, offset + initialEventMonthWindow))
    }
  }

  function extendEventRange(direction: 'after' | 'before', targetMonthCount: number): void {
    const nextMonthsBefore = direction === 'before' ? Math.max(eventMonthsBefore, targetMonthCount) : eventMonthsBefore
    const nextMonthsAfter = direction === 'after' ? Math.max(eventMonthsAfter, targetMonthCount) : eventMonthsAfter
    if (nextMonthsBefore === eventMonthsBefore && nextMonthsAfter === eventMonthsAfter) return

    eventMonthsBefore = nextMonthsBefore
    eventMonthsAfter = nextMonthsAfter
    if (direction === 'before') eventLoadingBefore = true
    if (direction === 'after') eventLoadingAfter = true

    const token = ++eventRangeLoadToken
    void loadCalendarRange(monthRangeOptions(nextMonthsBefore, nextMonthsAfter), { background: true }).finally(() => {
      if (token !== eventRangeLoadToken) return

      eventLoadingBefore = false
      eventLoadingAfter = false
    })
  }

  function calendarViewMenuItemClass(view: CalendarView): string {
    return calendarView === view ? `${calendarViewMenuItemBaseClass} border-primary/40 bg-primary/10 text-primary` : calendarViewMenuItemBaseClass
  }

  function monthDayClass(dateKey: string): string {
    const selected = isSelectedDateCell(dateKey) ? 'ring-1 ring-primary/70' : ''
    const background = isCurrentMonthCell(dateKey)
      ? 'border-primary/30 bg-primary/15 hover:bg-primary/20'
      : 'border-transparent bg-canvas/30 hover:bg-primary/10'

    return `${calendarDayBaseClass} ${background} text-ink ${selected}`
  }

  function monthDayLabelClass(dateKey: string): string {
    if (isTodayCell(dateKey)) return 'text-primary'

    return isCurrentMonthCell(dateKey) ? 'text-ink-bright' : 'text-ink-muted/35'
  }

  function monthEventButtonClass(eventUid: string): string {
    const selected = selectedMonthEventUid === eventUid ? 'bg-primary/15 text-ink-bright ring-1 ring-primary/40' : 'text-ink-muted hover:bg-surface-raised/80'
    return `w-full rounded-control px-1 py-0.5 text-left ${selected}`
  }

  function monthEventRowClass(): string {
    return 'grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-l-2 border-primary/80 pl-1 text-[0.66rem] leading-4'
  }

  function monthEventTitleClass(): string {
    return 'min-w-0 truncate text-ink-bright'
  }

  function monthEventTimeClass(): string {
    return 'text-ink-faint'
  }

  function monthEventMoreClass(): string {
    return 'mt-0.5 text-[0.62rem] text-primary'
  }

  function eventCardButtonClass(eventUid: string): string {
    return selectedAgendaEventUid === eventUid ? `${eventCardClass} border-primary/50 bg-primary/10 ring-1 ring-primary/35` : eventCardClass
  }

  function monthEventTimeLabel(event: CalendarEvent): string {
    if (event.allDay) return 'all day'

    const [start] = formatCalendarEventTime(event).split('–')
    return start || ''
  }

  function eventDescription(event: CalendarEvent): string {
    return event.description?.trim() || 'No description supplied by CalDAV.'
  }

  function linkedTextSegments(value: string): LinkedTextSegment[] {
    const urlPattern = /https?:\/\/[^\s<>"']+/g
    const segments: LinkedTextSegment[] = []
    let cursor = 0

    for (const match of value.matchAll(urlPattern)) {
      const rawUrl = match[0]
      const start = match.index ?? 0
      const url = rawUrl.replace(/[.,;:!?]+$/, '')
      const linkEnd = start + url.length
      const rawEnd = start + rawUrl.length

      if (start > cursor) segments.push({ kind: 'text', text: value.slice(cursor, start) })
      segments.push({ kind: 'link', href: url, text: url })
      if (linkEnd < rawEnd) segments.push({ kind: 'text', text: value.slice(linkEnd, rawEnd) })
      cursor = rawEnd
    }

    if (cursor < value.length) segments.push({ kind: 'text', text: value.slice(cursor) })

    return segments.length ? segments : [{ kind: 'text', text: value }]
  }

  function formatEventStamp(value: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value

    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: 'short'
    }).format(date)
  }

  function formatDateLabel(dateKey: string): string {
    const date = localDateFromKey(dateKey)
    if (Number.isNaN(date.getTime())) return dateKey

    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'long',
      weekday: 'long',
      year: 'numeric'
    }).format(date)
  }

  function formatMonthHeading(dateKey: string): string {
    const date = localDateFromKey(dateKey)
    if (Number.isNaN(date.getTime())) return dateKey

    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric'
    }).format(date)
  }


</script>

{#snippet calendarActions()}
  <div class="flex h-5 items-center gap-1" aria-label="Calendar actions">
    <Popover.Root bind:open={calendarViewMenuOpen}>
      <Popover.Trigger aria-label={`Choose calendar view. Current view: ${selectedCalendarViewLabel}`}>
        {#snippet child({ props })}
          <BracketTrigger {...props} label="VIEW" value={selectedCalendarViewLabel} />
        {/snippet}
      </Popover.Trigger>
      <Popover.Content class={calendarViewMenuContentClass} sideOffset={4} align="end">
        <div class="px-2 pb-1 pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-muted">calendar views</div>
        <div class="grid gap-1">
          {#each calendarViewOptions as view (view.id)}
            <button class={calendarViewMenuItemClass(view.id)} type="button" onclick={() => selectCalendarView(view.id)} aria-pressed={calendarView === view.id}>
              <span class="min-w-0 truncate">view:{view.label.toLowerCase()}</span>
              {#if calendarView === view.id}<span class="shrink-0 text-primary">active</span>{/if}
            </button>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>
    {#if calendarView !== 'month'}
      <span class="h-3 w-px bg-line/70" aria-hidden="true"></span>
      <Button variant="unstyled" class={`${calendarPanelActionClass} text-secondary`} onclick={selectToday}>Today</Button>
    {/if}
    <Button
      variant="unstyled"
      class="flex h-5 w-6 items-center justify-center p-0 text-primary hover:text-ink-bright"
      disabled={viewModel.loading}
      onclick={() => void viewModel.syncNow()}
      aria-label="Sync calendar"
      title="Sync calendar"
    >
      <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 11a8.1 8.1 0 0 0-14.1-4.9L4 8" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v4h4" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 13a8.1 8.1 0 0 0 14.1 4.9L20 16" />
        <path stroke-linecap="round" stroke-linejoin="round" d="M20 20v-4h-4" />
      </svg>
    </Button>
  </div>
{/snippet}

{#snippet eventDetailLeading()}
  <Button
    variant="unstyled"
    class="flex h-5 w-6 items-center justify-center p-0 text-xs text-ink-muted hover:text-ink-bright"
    onclick={closeEventDetail}
    aria-label="Close event detail"
    title="Close event detail"
  >
    x
  </Button>
{/snippet}

{#snippet linkedText(value: string)}
  {#each linkedTextSegments(value) as segment}
    {#if segment.kind === 'link'}
      <a class={eventLinkClass} href={segment.href} target="_blank" rel="noreferrer">{segment.text}</a>
    {:else}
      <span class="wrap-break-word">{segment.text}</span>
    {/if}
  {/each}
{/snippet}

{#snippet eventDetail(event: CalendarEvent)}
  <article class="flex min-h-0 flex-col gap-3 text-xs leading-5 text-ink-muted" aria-label={`Details for ${event.title}`}>
    <header class="border-b border-line pb-3">
      <h2 class="text-base font-semibold leading-6 text-ink-bright">{event.title}</h2>
      <div class="mt-2 flex flex-wrap gap-1.5">
        <span class="rounded-control border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 font-mono text-[0.62rem] text-secondary">{formatCalendarEventTime(event)}</span>
        {#if event.allDay}
          <span class="rounded-control border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[0.62rem] text-primary">all day</span>
        {/if}
        {#if event.calendarName}
          <span class={eventPillClass}>{event.calendarName}</span>
        {/if}
      </div>
    </header>

    <dl class="grid gap-2 border-b border-line/60 pb-3">
      <div>
        <dt class="font-hud text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">Starts</dt>
        <dd class="mt-0.5 font-mono text-ink-bright">{formatEventStamp(event.startsAt)}</dd>
      </div>
      <div>
        <dt class="font-hud text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">Ends</dt>
        <dd class="mt-0.5 font-mono text-ink-bright">{formatEventStamp(event.endsAt)}</dd>
      </div>
      {#if event.location}
        <div>
          <dt class="font-hud text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">Location</dt>
          <dd class="mt-0.5 wrap-break-word text-ink-muted">{@render linkedText(event.location)}</dd>
        </div>
      {/if}
    </dl>

    <section class="min-h-0 flex-1 overflow-auto pr-1" data-selectable="true">
      <h3 class="font-hud text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">Description</h3>
      <p class="mt-2 whitespace-pre-wrap wrap-break-word text-ink-muted">
        {@render linkedText(eventDescription(event))}
      </p>
    </section>

  </article>
{/snippet}

{#snippet eventCard(event: CalendarEvent)}
  <Button
    variant="unstyled"
    class={eventCardButtonClass(event.uid)}
    onclick={() => openAgendaEventDetail(event)}
    aria-label={`Show details for ${event.title}`}
    aria-pressed={selectedAgendaEventUid === event.uid}
  >
    <span class="grid grid-cols-[minmax(0,1fr)_minmax(6.5rem,9rem)] items-start gap-3">
      <span class="min-w-0">
        <span class="block min-w-0 text-sm font-semibold leading-5 text-ink-bright">{event.title}</span>
        {#if event.calendarName}
          <span class="mt-1 flex min-w-0 flex-wrap gap-1.5">
            <span class={eventPillClass}>{event.calendarName}</span>
          </span>
        {/if}
      </span>

      <span class="w-full justify-self-end rounded-control border border-line bg-canvas px-2 py-1 text-right font-mono text-xs tabular-nums text-secondary">
        {formatCalendarEventTime(event)}
      </span>
    </span>

    {#if event.location}
      <span class="mt-3 block border-l border-line/70 pl-2 text-xs leading-5 text-ink-muted">
        <span class="font-hud uppercase tracking-[0.12em] text-ink-dim">Location</span>
        <span class="text-ink-muted"> · </span>
        <span class="wrap-break-word">{event.location}</span>
      </span>
    {/if}
  </Button>
{/snippet}

{#snippet eventList(events: CalendarEvent[])}
  <div class="grid gap-3">
    {#each events as event (event.uid)}
      {@render eventCard(event)}
    {/each}
  </div>
{/snippet}

{#snippet agendaEmptyState(label: string)}
  <div class="flex min-h-24 items-center justify-center border border-line/60 bg-surface-raised/35 p-4 text-center text-sm text-ink-muted">{label}</div>
{/snippet}

{#snippet agendaRow(row: VirtualAgendaRow)}
  {@const rowEvents = eventsForDateKeys(row.dateKeys)}
  <section class="border-b border-line/70" style={`min-height: ${agendaRowHeight()}px`} data-calendar-agenda-row={row.key} aria-label={row.label}>
    <header class="flex w-full shrink-0 items-center justify-between gap-3 border-b border-line/60 py-2 text-left">
      <span class="min-w-0 truncate font-hud text-sm font-bold uppercase tracking-[0.12em] text-ink-bright">{row.label}</span>

    </header>
    <div class="py-3">
      {#if rowEvents.length}
        {@render eventList(rowEvents)}
      {:else}
        {@render agendaEmptyState('No events returned for this date.')}
      {/if}
    </div>
  </section>
{/snippet}

<section class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-chat-scroll/40 p-3 font-mono text-ink md:overflow-hidden md:p-4" aria-label="Calendar">
  {#if calendarView === 'month'}
    <div class={monthLayoutClass}>
      <Panel title="CALENDAR" class="border-line bg-surface" contentClass="flex min-h-0 flex-col overflow-hidden p-3" titleClass="text-primary" actions={calendarActions}>
        {#if initialCalendarLoading && viewModel.configStatus === null}
          <div class="flex flex-1 items-center justify-center rounded-panel border border-line bg-surface-raised p-4" aria-label="Loading calendar" role="status">
            <Loader size="xl" label="Loading calendar" />
          </div>
        {:else if viewModel.error}
          <div class="rounded-panel border border-danger/50 bg-danger/10 p-4 text-sm text-danger">{viewModel.error}</div>
        {:else if !viewModel.configured}
          <div class="rounded-panel border border-warning/50 bg-warning/10 p-4 text-sm leading-6 text-warning">
            Calendar config missing. {viewModel.configurationHint}
          </div>
        {:else}
          <Calendar.Root
            type="single"
            value={selectedDate}
            placeholder={visibleMonth}
            onValueChange={handleDateChange}
            onPlaceholderChange={handleVisibleMonthChange}
            weekdayFormat="short"
            fixedWeeks={true}
            numberOfMonths={1}
            calendarLabel="BITCH calendar"
            class={calendarShellClass}
          >
            {#snippet children({ weekdays })}
              <Calendar.Header class={calendarHeaderClass}>
                <div class={calendarHeaderTitleClass}>{currentMonthInViewLabel}</div>
                <div class={calendarHeaderControlsClass} aria-label="Month navigation">
                  <Button size="icon" aria-label="Previous month" onclick={() => navigateVisibleMonth(-1)}>‹</Button>
                  <Button size="sm" variant="secondary" onclick={selectToday}>Today</Button>
                  <Button size="icon" aria-label="Next month" onclick={() => navigateVisibleMonth(1)}>›</Button>
                </div>
              </Calendar.Header>

              <div bind:this={monthScroller} onscroll={handleMonthScroll} class="min-h-0 flex-1 overflow-y-auto pr-1" data-selectable="true" aria-label="Continuous month calendar">
                <div class={calendarWeekdayHeaderClass} data-calendar-weekday-header aria-hidden="true">
                  {#each weekdays as day (day)}
                    <div class={calendarWeekdayCellClass}>{day.toLowerCase()}</div>
                  {/each}
                </div>
                <div
                  class="flex justify-center border-b border-primary/20 bg-surface/90 py-1"
                  style={`height: ${monthEventLoaderSlotHeightPx}px`}
                  aria-hidden={eventLoadingBefore ? undefined : 'true'}
                  aria-label={eventLoadingBefore ? 'Loading previous calendar events' : undefined}
                  role={eventLoadingBefore ? 'status' : undefined}
                >
                  {#if eventLoadingBefore}
                    <Loader size="md" label="Loading previous calendar events" />
                  {/if}
                </div>
                <Calendar.Grid class={calendarGridClass}>
                  <Calendar.GridBody>
                    {#if virtualWeekWindow.topSpacerHeight > 0}
                      <tr aria-hidden="true">
                        <td colspan="7" class="border-0 p-0" style={`height: ${virtualWeekWindow.topSpacerHeight}px`}></td>
                      </tr>
                    {/if}
                    {#each virtualWeekWindow.rows as row (row.startKey)}
                      <Calendar.GridRow data-calendar-week-month={row.monthKey} data-calendar-week-start={row.startKey} style={`height: ${monthWeekRowHeightPx}px`}>
                        {#each row.week as cell (cell.dateKey)}
                          <Calendar.Cell date={cell.date} month={cell.month} class={calendarCellClass}>
                            {@const cellEvents = eventsForDateKey(cell.dateKey)}
                            <Calendar.Day class={monthDayClass(cell.dateKey)} data-calendar-day-month={monthStartKey(cell.dateKey)} aria-label={`${cell.dateKey}${cellEvents.length ? `, ${cellEvents.length} events` : ''}`} onclick={() => selectMonthDate(cell.dateKey)}>
                              {#snippet children({ day })}
                                <span class={`mb-1 self-end font-mono text-sm leading-none ${monthDayLabelClass(cell.dateKey)}`}>{day}</span>
                                {#each cellEvents.slice(0, 4) as event (event.uid)}
                                  <Button
                                    variant="unstyled"
                                    class={monthEventButtonClass(event.uid)}
                                    title={event.title}
                                    aria-label={`Show details for ${event.title}`}
                                    onclick={clickEvent => selectMonthEvent(clickEvent, event, cell.dateKey)}
                                  >
                                    <span class={monthEventRowClass()}>
                                      <span class={monthEventTitleClass()}>{event.title}</span>
                                      <span class={monthEventTimeClass()}>{monthEventTimeLabel(event)}</span>
                                    </span>
                                  </Button>
                                {/each}
                                {#if cellEvents.length > 4}
                                  <span class={monthEventMoreClass()}>+{cellEvents.length - 4} more</span>
                                {/if}
                              {/snippet}
                            </Calendar.Day>
                          </Calendar.Cell>
                        {/each}
                      </Calendar.GridRow>
                    {/each}
                    {#if virtualWeekWindow.bottomSpacerHeight > 0}
                      <tr aria-hidden="true">
                        <td colspan="7" class="border-0 p-0" style={`height: ${virtualWeekWindow.bottomSpacerHeight}px`}></td>
                      </tr>
                    {/if}
                  </Calendar.GridBody>
                </Calendar.Grid>
                <div
                  class="flex justify-center border-t border-primary/20 bg-surface/90 py-1"
                  style={`height: ${monthEventLoaderSlotHeightPx}px`}
                  aria-hidden={eventLoadingAfter ? undefined : 'true'}
                  aria-label={eventLoadingAfter ? 'Loading next calendar events' : undefined}
                  role={eventLoadingAfter ? 'status' : undefined}
                >
                  {#if eventLoadingAfter}
                    <Loader size="md" label="Loading next calendar events" />
                  {/if}
                </div>
              </div>
            {/snippet}
          </Calendar.Root>
        {/if}
      </Panel>

      {#if selectedMonthEvent}
        <Panel
          title="EVENT DETAIL"
          class="min-h-0"
          contentClass="flex min-h-0 flex-col overflow-hidden p-3"
          titleClass="text-secondary"
          leading={eventDetailLeading}
        >
          {@render eventDetail(selectedMonthEvent)}
        </Panel>
      {/if}
    </div>
  {:else}
    <div class={agendaLayoutClass}>
      <Panel title="CALENDAR" class="border-line bg-surface" contentClass="flex min-h-0 flex-col overflow-hidden p-3" titleClass="text-primary" actions={calendarActions}>
        <div class="mb-3 min-w-0 truncate border-b border-line pb-3 text-right font-hud text-[0.68rem] uppercase tracking-[0.16em] text-secondary">{activeDateLabel}</div>

        {#if initialCalendarLoading && viewModel.configStatus === null}
          <div class="flex flex-1 items-center justify-center rounded-panel border border-line bg-surface-raised p-4" aria-label="Loading calendar" role="status">
            <Loader size="xl" label="Loading calendar" />
          </div>
        {:else if viewModel.error}
          <div class="rounded-panel border border-danger/50 bg-danger/10 p-4 text-sm text-danger">{viewModel.error}</div>
        {:else if !viewModel.configured}
          <div class="rounded-panel border border-warning/50 bg-warning/10 p-4 text-sm leading-6 text-warning">
            Calendar config missing. {viewModel.configurationHint}
          </div>
        {:else}
          <div
            bind:this={agendaScroller}
            onscroll={handleAgendaScroll}
            class="min-h-0 flex-1 overflow-y-auto pr-1"
            data-selectable="true"
            aria-label="Continuous day calendar events"
          >
            {#if virtualAgendaWindow.topSpacerHeight > 0}
              <div aria-hidden="true" style={`height: ${virtualAgendaWindow.topSpacerHeight}px`}></div>
            {/if}
            <div class="grid gap-3" data-calendar-agenda-list>
              {#each virtualAgendaWindow.rows as row (row.key)}
                {@render agendaRow(row)}
              {/each}
            </div>
            {#if virtualAgendaWindow.bottomSpacerHeight > 0}
              <div aria-hidden="true" style={`height: ${virtualAgendaWindow.bottomSpacerHeight}px`}></div>
            {/if}
          </div>
        {/if}
      </Panel>

      {#if selectedAgendaEvent}
        <Panel
          title="EVENT DETAIL"
          class="hidden min-h-0 md:flex"
          contentClass="flex min-h-0 flex-col overflow-hidden p-3"
          titleClass="text-secondary"
          leading={eventDetailLeading}
        >
          {@render eventDetail(selectedAgendaEvent)}
        </Panel>
      {/if}
    </div>
  {/if}
</section>

{#if selectedAgendaEvent}
  <Dialog
    bind:open={eventDetailDialogOpen}
    title="EVENT DETAIL"
    description={selectedAgendaEventDialogDescription || selectedAgendaEvent.title}
    class="w-[min(38rem,calc(100vw-2rem))] md:hidden"
    contentClass="flex max-h-[min(38rem,calc(100vh-7rem))] flex-col overflow-hidden"
  >
    <div class="min-h-0 flex-1 overflow-hidden p-3">
      {@render eventDetail(selectedAgendaEvent)}
    </div>
  </Dialog>
{/if}
