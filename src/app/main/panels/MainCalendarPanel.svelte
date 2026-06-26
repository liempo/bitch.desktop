<script lang="ts">
  import { onMount } from 'svelte'

  import Button from '@/app/components/ui/Button.svelte'
  import Icon from '@/app/components/ui/Icon.svelte'
  import Loader from '@/app/components/ui/Loader.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import {
    calendarDateKey,
    createCalendarViewModel,
    formatCalendarEventTime,
    listenCalendarSyncUpdates,
    sortCalendarEvents,
    type CalendarEvent,
    type CalendarLoadOptions,
    type CalendarVisibleRangeOptions
  } from '$lib/calendar'
  import { calendarRoute } from '../../router.svelte'

  interface Props {
    class?: string
    titleClass?: string
  }

  let { class: className = '', titleClass = '' }: Props = $props()

  const viewModel = createCalendarViewModel()
  const calendarRangeOptions = { monthsAfter: 1, monthsBefore: 0 } satisfies CalendarVisibleRangeOptions
  const calendarHref = $derived(`#${calendarRoute()}`)
  const datePrefixPattern = /^(\d{4})-(\d{2})-(\d{2})/
  const dayMs = 86_400_000

  let calendarLoaded = $state(false)
  let calendarNow = $state(new Date())

  const calendarTodayKey = $derived(calendarDateKey(calendarNow))
  const calendarCurrentDateLabel = $derived(formatCurrentDate(calendarNow))
  const calendarCurrentTimeLabel = $derived(formatCurrentTime(calendarNow))
  const calendarLoading = $derived(viewModel.loading || viewModel.configStatus?.syncing === true)
  const calendarError = $derived(viewModel.error || viewModel.configStatus?.lastSyncError || '')
  const calendarUpcomingEvents = $derived.by(() => collectUpcomingCalendarEvents())
  const calendarPanelMeta = $derived(
    calendarLoading
      ? 'syncing'
      : calendarError
        ? 'degraded'
        : calendarLoaded && !viewModel.configured
          ? 'config missing'
          : calendarUpcomingEvents[0]
            ? `next ${formatCalendarRelativeLabel(calendarUpcomingEvents[0])}`
            : calendarLoaded
              ? ''
              : 'not synced'
  )
  const calendarFooterStatus = $derived(
    calendarLoading
      ? 'calendar=syncing'
      : calendarError
        ? 'calendar=degraded'
        : calendarLoaded && !viewModel.configured
          ? 'config=missing'
          : calendarLoaded
            ? 'calendar=ready'
            : 'calendar=idle'
  )

  onMount(() => {
    let disposed = false
    let unlisten: undefined | (() => void)
    const calendarTimer = window.setInterval(() => {
      calendarNow = new Date()
    }, 1000)

    void refreshCalendarEvents()
    void listenCalendarSyncUpdates(() => {
      void refreshCalendarEvents({ background: true })
    }).then(stopListening => {
      if (disposed) {
        stopListening()
      } else {
        unlisten = stopListening
      }
    })

    return () => {
      disposed = true
      window.clearInterval(calendarTimer)
      unlisten?.()
    }
  })

  async function refreshCalendarEvents(loadOptions: CalendarLoadOptions = {}): Promise<void> {
    const loaded = await viewModel.loadVisibleRange(calendarRangeOptions, loadOptions)
    calendarLoaded = calendarLoaded || loaded
  }

  async function syncMainCalendar(): Promise<void> {
    await viewModel.syncNow()
    calendarLoaded = true
  }

  function collectUpcomingCalendarEvents(): CalendarEvent[] {
    const nowMs = calendarNow.getTime()
    const todayStart = calendarDateStartMs(calendarTodayKey)
    const todayEnd = todayStart + dayMs

    return sortCalendarEvents(
      viewModel.events.filter(event => {
        const start = calendarEventStartMs(event)
        const end = calendarEventEndMs(event)
        return Number.isFinite(start) && Number.isFinite(end) && end > nowMs && start < todayEnd && end > todayStart
      })
    )
  }


  function calendarDateStartMs(dateKey: string): number {
    const match = datePrefixPattern.exec(dateKey)
    if (!match) return Number.NaN

    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  }

  function calendarEventStartMs(event: CalendarEvent): number {
    return event.allDay ? calendarDateStartMs(calendarEventStartDateKey(event)) : Date.parse(event.startsAt)
  }

  function calendarEventEndMs(event: CalendarEvent): number {
    const start = calendarEventStartMs(event)
    if (!Number.isFinite(start)) return Number.NaN

    if (event.allDay) {
      const end = calendarDateStartMs(calendarEventEndDateKey(event))
      return Number.isFinite(end) && end > start ? end : start + dayMs
    }

    const end = Date.parse(event.endsAt)
    return Number.isFinite(end) && end > start ? end : start + 1
  }

  function calendarEventStartDateKey(event: CalendarEvent): string {
    return event.allDay ? calendarPlainDateKey(event.startsAt) || calendarDateKey(event.startsAt) : calendarDateKey(event.startsAt)
  }

  function calendarEventEndDateKey(event: CalendarEvent): string {
    return event.allDay ? calendarPlainDateKey(event.endsAt) || calendarDateKey(event.endsAt) : calendarDateKey(event.endsAt)
  }

  function calendarEventDateBadge(event: CalendarEvent): string {
    const offset = calendarEventDayOffset(event)
    if (offset === 0) return 'today'
    if (offset === 1) return 'tomorrow'
    if (offset > 1 && offset < 7) return `+${offset}d`
    return formatCalendarDateKey(calendarEventStartDateKey(event))
  }

  function calendarEventDayOffset(event: CalendarEvent): number {
    return Math.round((calendarDateStartMs(calendarEventStartDateKey(event)) - calendarDateStartMs(calendarTodayKey)) / dayMs)
  }

  function calendarEventMeta(event: CalendarEvent): string {
    return [calendarEventDateLabel(event), compactText(event.location), compactText(event.calendarName)].filter(Boolean).join(' · ')
  }

  function calendarEventDateLabel(event: CalendarEvent): string {
    const badge = calendarEventDateBadge(event)
    if (badge === 'today') return 'Today'
    if (badge === 'tomorrow') return 'Tomorrow'
    if (badge.startsWith('+')) return formatCalendarDateKey(calendarEventStartDateKey(event))
    return badge
  }

  function calendarEventPillClass(event: CalendarEvent): string {
    const base = 'rounded-none border px-1.5 py-0.5 text-[0.58rem] uppercase'
    const offset = calendarEventDayOffset(event)

    if (offset === 0) return `${base} border-primary/40 bg-primary/10 text-primary`
    if (event.allDay) return `${base} border-secondary/40 bg-secondary/10 text-secondary`
    return `${base} border-line bg-canvas text-ink-muted`
  }

  function calendarPlainDateKey(value: string): string {
    const match = datePrefixPattern.exec(value)
    return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
  }

  function formatCalendarDateKey(dateKey: string): string {
    const timestamp = calendarDateStartMs(dateKey)
    if (!Number.isFinite(timestamp)) return '--'

    return new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short' }).format(new Date(timestamp))
  }

  function formatCalendarRelativeLabel(event: CalendarEvent): string {
    const offset = calendarEventDayOffset(event)
    if (offset === 0) {
      if (event.allDay) return 'today'

      const start = calendarEventStartMs(event)
      const end = calendarEventEndMs(event)
      if (start <= calendarNow.getTime() && end > calendarNow.getTime()) return 'now'
      return formatRelativeTime(start)
    }

    if (offset === 1) return 'tomorrow'
    if (offset > 1 && offset < 7) return `in ${offset}d`
    return formatCalendarDateKey(calendarEventStartDateKey(event)).toLowerCase()
  }

  function formatRelativeTime(timestamp: number): string {
    const deltaSeconds = Math.round((timestamp - calendarNow.getTime()) / 1000)
    const absSeconds = Math.abs(deltaSeconds)
    const suffix = deltaSeconds < 0 ? 'ago' : ''
    const prefix = deltaSeconds < 0 ? '' : 'in '

    if (absSeconds < 60) return deltaSeconds < 0 ? 'now' : 'in <1m'
    if (absSeconds < 3600) return `${prefix}${Math.round(absSeconds / 60)}m${suffix ? ` ${suffix}` : ''}`
    if (absSeconds < 86400) return `${prefix}${Math.round(absSeconds / 3600)}h${suffix ? ` ${suffix}` : ''}`
    return `${prefix}${Math.round(absSeconds / 86400)}d${suffix ? ` ${suffix}` : ''}`
  }

  function formatCurrentDate(value: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      weekday: 'short',
      year: 'numeric'
    }).format(value)
  }

  function formatCurrentTime(value: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(value)
  }

  function compactText(value: null | string | undefined): string {
    return value?.replace(/\s+/g, ' ').trim() ?? ''
  }
</script>

<Panel
  fullHeight={false}
  title="CALENDAR"
  padded={false}
  class={className}
  contentClass="flex h-full min-h-0 flex-col gap-3 p-3 pt-4"
  titleClass={titleClass}
>
  {#snippet actions()}
    <Button
      size="sm"
      chrome="ghost"
      variant="secondary"
      class="rounded-none!"
      onclick={() => void syncMainCalendar()}
      disabled={calendarLoading}
      title="Sync calendar"
      aria-label="Sync calendar"
    >
      <Icon name="sync" class="text-[0.85rem]" />
    </Button>
  {/snippet}

  <section class="border border-line bg-surface-raised/70 p-3 text-center uppercase tracking-[0.12em]" aria-label="Current date and time">
    <div class="font-hud text-[1.35rem] font-bold leading-none tracking-[0.04em] text-primary">{calendarCurrentTimeLabel}</div>
    <div class="mt-2 truncate text-[0.72rem] font-bold text-ink-bright" title={calendarCurrentDateLabel}>{calendarCurrentDateLabel}</div>
  </section>

  <section class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2" aria-label="Calendar upcoming events">
    <div class="flex items-center justify-between gap-3 text-[0.62rem] uppercase tracking-[0.14em]">
      <span class="text-ink-muted">Upcoming events</span>
      {#if calendarPanelMeta}
        <span class={calendarError ? 'text-warning' : 'text-ink-faint'}>{calendarPanelMeta}</span>
      {/if}
    </div>

    {#if calendarLoaded && !viewModel.configured}
      <div class="flex items-center gap-2 rounded-none border border-warning/40 bg-warning/10 p-3 text-[0.68rem] leading-4 text-warning">
        <Icon name="calendar" label="Calendar configuration" decorative={false} />
        <span>{viewModel.configurationHint}</span>
      </div>
    {:else if calendarError && calendarUpcomingEvents.length === 0}
      <div class="flex items-center gap-2 rounded-none border border-danger/40 bg-danger/10 p-3 text-[0.68rem] leading-4 text-danger">
        <Icon name="error" label="Calendar error" decorative={false} />
        <span>Calendar unavailable: {calendarError}</span>
      </div>
    {:else if calendarLoading && calendarUpcomingEvents.length === 0}
      <div class="flex items-center gap-2 rounded-none border border-line bg-surface-raised/60 p-3 text-primary">
        <Loader size="sm" label="Loading calendar cache" />
      </div>
    {:else if calendarUpcomingEvents.length === 0}
      <div class="flex items-center gap-2 rounded-none border border-dashed border-line p-3 text-[0.68rem] leading-4 text-ink-muted">
        <Icon name="calendar" class="text-ink-muted" />
        <span>{viewModel.events.length ? 'Calendar is clear for today.' : 'No cached calendar events visible.'}</span>
      </div>
    {:else}
      <div class="min-h-0 overflow-auto overscroll-contain p-px" style="--custom-scrollbar-offset-x: 4px">
        <div class="grid min-w-0 gap-1.5">
          {#each calendarUpcomingEvents as event (event.uid)}
            <a
              class="min-w-0 rounded-none border border-line bg-surface-raised/70 p-2 text-inherit transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2"
              href={calendarHref}
              aria-label={`Open calendar event ${event.title}`}
            >
              <div class="flex items-start justify-between gap-2">
                <span class="min-w-0 truncate text-[0.7rem] font-bold uppercase tracking-[0.08em] text-ink-bright" title={event.title}>{event.title}</span>
                <span class={calendarEventPillClass(event)}>{calendarEventDateBadge(event)}</span>
              </div>
              <div class="mt-1 truncate text-[0.62rem] leading-4 text-ink-muted" title={calendarEventMeta(event)}>
                {calendarEventMeta(event)}
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-secondary">{formatCalendarEventTime(event)}</span>
                {#if event.allDay}
                  <span class="rounded-none border border-secondary/40 bg-secondary/10 px-1.5 py-0.5 text-[0.58rem] uppercase text-secondary">all-day</span>
                {/if}
                {#if compactText(event.location)}
                  <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">{compactText(event.location)}</span>
                {/if}
                {#if compactText(event.calendarName)}
                  <span class="rounded-none border border-line bg-canvas px-1.5 py-0.5 text-[0.58rem] text-ink-muted">{compactText(event.calendarName)}</span>
                {/if}
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </section>

  {#if calendarError && calendarUpcomingEvents.length > 0}
    <div class="rounded-none border border-warning/40 bg-warning/10 p-2 text-[0.62rem] leading-4 text-warning">
      Last sync failed: {calendarError}
    </div>
  {/if}

  <div class="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-2 text-[0.62rem] uppercase tracking-[0.12em]">
    <span class="min-w-0 truncate text-ink-faint" title={calendarFooterStatus}>{calendarFooterStatus}</span>
    <Button size="sm" chrome="ghost" variant="primary" class="rounded-none!" href={calendarHref} aria-label="Open Calendar">
      <span>Open Calendar</span>
    </Button>
  </div>
</Panel>
