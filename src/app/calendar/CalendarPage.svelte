<script lang="ts">
  import { onMount } from 'svelte'
  import { ScheduleXCalendar } from '@schedule-x/svelte'
  import {
    createCalendar,
    createViewDay,
    createViewList,
    createViewMonthAgenda,
    createViewMonthGrid,
    createViewWeek,
    viewMonthGrid,
    type CalendarConfig,
    type CalendarEvent
  } from '@schedule-x/calendar'
  import '@schedule-x/theme-default/dist/index.css'
  import 'temporal-polyfill/global'

  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import { fetchCalDavCalendarEvents } from '$lib/calendar/caldav'
  import { toScheduleXEvents, type CalendarResource } from '$lib/calendar/events'
  import { profileState } from '$lib/stores/profile.svelte'

  type CalendarApp = ReturnType<typeof createCalendar>
  type FetchRange = { end: Temporal.PlainDate | string; start: Temporal.PlainDate | string }

  let calendarApp = $state<CalendarApp | null>(null)
  let calendars = $state<CalendarResource[]>([])
  let lastError = $state('')
  let lastLoadedRange = $state('')
  let loading = $state(false)
  let eventCount = $state(0)

  const activeProfile = $derived(profileState.activeGatewayProfile || 'default')
  const timezone = $derived(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const calendarLegend = $derived(calendars.map(calendar => ({ ...calendar, color: calendar.color || '#00ffaa' })))

  onMount(() => {
    calendarApp = createCalendar(calendarConfig())
  })

  function calendarConfig(): CalendarConfig {
    return {
      callbacks: {
        fetchEvents: loadEventsForRange
      },
      calendars: {},
      defaultView: viewMonthGrid.name,
      events: [],
      firstDayOfWeek: 1,
      isDark: true,
      isResponsive: true,
      locale: 'en-US',
      monthGridOptions: {
        nEventsPerDay: 4
      },
      timezone,
      views: [createViewDay(), createViewWeek(), createViewMonthGrid(), createViewMonthAgenda(), createViewList()],
      weekOptions: {
        eventOverlap: false,
        gridHeight: 1200,
        gridStep: 30
      }
    }
  }

  async function loadEventsForRange(range: FetchRange): Promise<CalendarEvent[]> {
    loading = true
    lastError = ''
    const start = range.start.toString()
    const end = range.end.toString()
    lastLoadedRange = `${start} → ${end}`

    try {
      const result = await fetchCalDavCalendarEvents({
        end,
        profile: activeProfile,
        start,
        timezone
      })
      calendars = result.calendars
      eventCount = result.events.length
      return toScheduleXEvents(result.events)
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
      eventCount = 0
      return []
    } finally {
      loading = false
    }
  }

  function reloadCalendar(): void {
    calendarApp?.events.set([])
    calendarApp = createCalendar(calendarConfig())
  }
</script>

<section class="grid h-full min-h-0 grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] gap-3 bg-chat-scroll/40 p-4" aria-label="Calendar">
  <Panel title="CALENDAR" badge="readonly" padded={false} contentClass="flex min-h-0 flex-col gap-4 p-4" class="min-w-0">
    <div>
      <p class="font-hud text-[0.65rem] font-bold uppercase tracking-[0.18em] text-primary">Read-only CalDAV</p>
      <p class="mt-2 text-xs leading-5 text-ink-muted">
        Events are loaded through the native Tauri CalDAV bridge using the configured homestation calendar source.
        Create, edit, and remove controls stay disabled until sync behavior is proven.
      </p>
    </div>

    <div class="space-y-2 rounded-control border border-line bg-surface-muted/50 p-3 text-xs text-ink-muted">
      <div class="flex items-center justify-between gap-3">
        <span>Profile</span>
        <span class="truncate font-mono text-ink-bright">{activeProfile}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span>Timezone</span>
        <span class="truncate font-mono text-ink-bright">{timezone}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span>Loaded range</span>
        <span class="truncate font-mono text-ink-bright">{lastLoadedRange || '—'}</span>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span>Events</span>
        <span class="font-mono text-ink-bright">{eventCount}</span>
      </div>
    </div>

    {#if lastError}
      <div class="rounded-control border border-danger/45 bg-danger/10 p-3 text-xs leading-5 text-danger" role="alert">
        {lastError}
      </div>
    {/if}

    <Button type="button" variant="secondary" onclick={reloadCalendar}>{loading ? 'Loading…' : 'Reload CalDAV'}</Button>

    <div class="min-h-0 flex-1 overflow-auto rounded-control border border-line bg-surface-muted/35 p-3">
      <p class="mb-2 font-hud text-[0.65rem] font-bold uppercase tracking-[0.18em] text-ink-muted">Calendars</p>
      {#if calendarLegend.length}
        <div class="space-y-2">
          {#each calendarLegend as calendar (calendar.id)}
            <div class="flex items-center gap-2 text-xs text-ink-muted">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" style={`background: ${calendar.color}`}></span>
              <span class="min-w-0 truncate" title={calendar.displayName}>{calendar.displayName}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="rounded-control border border-dashed border-line p-4 text-center text-xs leading-5 text-ink-muted">
          No calendars loaded yet. The first visible range triggers discovery.
        </div>
      {/if}
    </div>
  </Panel>

  <Panel title="DAY · WEEK · MONTH · AGENDA" padded={false} contentClass="min-h-0 p-3" class="min-w-0">
    <div class="sx-svelte-calendar-wrapper h-full min-h-[32rem] overflow-hidden rounded-control border border-line bg-canvas text-ink-bright">
      {#if calendarApp}
        <ScheduleXCalendar {calendarApp} />
      {:else}
        <div class="flex h-full items-center justify-center text-sm text-ink-muted">Preparing calendar surface…</div>
      {/if}
    </div>
  </Panel>
</section>
