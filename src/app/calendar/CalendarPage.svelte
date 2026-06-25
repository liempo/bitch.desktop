<script lang="ts">
  import { Calendar } from 'bits-ui'
  import { CalendarDate, type DateValue } from '@internationalized/date'
  import { onMount } from 'svelte'

  import Panel from '@/app/components/ui/Panel.svelte'
  import Button from '@/app/components/ui/Button.svelte'
  import {
    calendarEventCountForDate,
    calendarEventSubtitle,
    createCalendarViewModel,
    type CalendarEvent
  } from '$lib/calendar'

  const viewModel = createCalendarViewModel()

  const calendarShellClass = 'rounded-panel border border-line bg-canvas p-3 text-ink shadow-inner'
  const calendarHeaderClass = 'mb-3 flex items-center justify-between gap-2'
  const calendarNavClass = [
    'inline-flex size-8 items-center justify-center rounded-control border border-line bg-surface-raised text-primary',
    'hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-40'
  ].join(' ')
  const calendarGridClass = 'w-full border-separate border-spacing-1 text-center'
  const calendarHeadCellClass = 'h-7 font-hud text-[0.58rem] uppercase tracking-[0.16em] text-ink-muted'
  const calendarCellClass = 'relative size-9 text-center align-middle'
  const calendarDayClass = [
    'group relative inline-flex size-9 items-center justify-center rounded-control border border-transparent bg-surface-raised/60',
    'font-mono text-[0.74rem] text-ink transition hover:border-line-strong hover:bg-primary/10',
    'focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2',
    'data-[selected]:border-primary data-[selected]:bg-primary/20 data-[selected]:text-ink-bright',
    'data-[today]:text-primary data-[outside-month]:text-ink-muted/45 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-35'
  ].join(' ')

  let selectedDate = $state<DateValue | undefined>(dateValueFromKey(viewModel.selectedDateKey))
  let visibleMonth = $state<DateValue>(dateValueFromKey(viewModel.selectedDateKey))

  const selectedEvents = $derived(viewModel.selectedEvents)
  const selectedDateLabel = $derived(formatDateLabel(viewModel.selectedDateKey))

  onMount(() => {
    void viewModel.refresh()
  })

  function dateValueFromKey(key: string): CalendarDate {
    const [year, month, day] = key.split('-').map(part => Number(part))
    return new CalendarDate(year || 1970, month || 1, day || 1)
  }

  function handleDateChange(value: DateValue | undefined): void {
    selectedDate = value
    if (value) viewModel.selectDate(value.toString())
  }

  function handleVisibleMonthChange(value: DateValue): void {
    visibleMonth = value
    viewModel.setVisibleAnchor(value.toString())
    void viewModel.refresh()
  }

  function dayEventCount(date: DateValue): number {
    return calendarEventCountForDate(viewModel.events, date.toString())
  }

  function dayHasEvents(date: DateValue): boolean {
    return dayEventCount(date) > 0
  }

  function eventDescription(event: CalendarEvent): string {
    return event.description?.trim() || 'No description supplied by CalDAV.'
  }

  function formatDateLabel(dateKey: string): string {
    const date = new Date(`${dateKey}T00:00:00.000Z`)
    if (Number.isNaN(date.getTime())) return dateKey

    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'long',
      timeZone: 'UTC',
      weekday: 'long',
      year: 'numeric'
    }).format(date)
  }
</script>

<section class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-chat-scroll/40 p-3 font-mono text-ink md:overflow-hidden md:p-4" aria-label="Calendar">
  <div class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(19rem,0.85fr)_minmax(0,1.15fr)]">
    <Panel title="CALENDAR" badge={viewModel.statusLabel} class="border-line bg-surface" contentClass="overflow-y-auto p-3" titleClass="text-primary">
      <div class="grid gap-3">
        <div class="flex items-start justify-between gap-3 rounded-panel border border-line bg-surface-raised p-3">
          <div>
            <div class="font-hud text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-muted">CALDAV</div>
            <div class="mt-1 text-sm text-ink-bright">{viewModel.configStatus?.calendarUrl || 'No calendar collection configured'}</div>
            <div class="mt-1 text-xs text-ink-muted">{viewModel.configStatus?.username || viewModel.configurationHint}</div>
          </div>
          <Button size="sm" variant="primary" disabled={viewModel.loading} onclick={() => void viewModel.refresh()}>Refresh</Button>
        </div>

        <Calendar.Root
          type="single"
          value={selectedDate}
          placeholder={visibleMonth}
          onValueChange={handleDateChange}
          onPlaceholderChange={handleVisibleMonthChange}
          weekdayFormat="short"
          fixedWeeks={true}
          calendarLabel="BITCH CalDAV calendar"
          class={calendarShellClass}
        >
          {#snippet children({ months, weekdays })}
            <Calendar.Header class={calendarHeaderClass}>
              <Calendar.PrevButton class={calendarNavClass} aria-label="Previous month">‹</Calendar.PrevButton>
              <Calendar.Heading class="font-hud text-sm font-bold uppercase tracking-[0.16em] text-ink-bright" />
              <Calendar.NextButton class={calendarNavClass} aria-label="Next month">›</Calendar.NextButton>
            </Calendar.Header>

            {#each months as month (month.value.toString())}
              <Calendar.Grid class={calendarGridClass}>
                <Calendar.GridHead>
                  <Calendar.GridRow>
                    {#each weekdays as day (day)}
                      <Calendar.HeadCell class={calendarHeadCellClass}>{day}</Calendar.HeadCell>
                    {/each}
                  </Calendar.GridRow>
                </Calendar.GridHead>
                <Calendar.GridBody>
                  {#each month.weeks as weekDates}
                    <Calendar.GridRow>
                      {#each weekDates as date (date.toString())}
                        <Calendar.Cell {date} month={month.value} class={calendarCellClass}>
                          <Calendar.Day class={calendarDayClass} aria-label={`${date.toString()}${dayHasEvents(date) ? `, ${dayEventCount(date)} event marker` : ''}`}>
                            {#snippet children({ day })}
                              <span>{day}</span>
                              {#if dayHasEvents(date)}
                                <span class="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary" aria-hidden="true"></span>
                              {/if}
                            {/snippet}
                          </Calendar.Day>
                        </Calendar.Cell>
                      {/each}
                    </Calendar.GridRow>
                  {/each}
                </Calendar.GridBody>
              </Calendar.Grid>
            {/each}
          {/snippet}
        </Calendar.Root>
      </div>
    </Panel>

    <Panel title="DAY FEED" badge={selectedEvents.length ? `${selectedEvents.length}` : viewModel.statusLabel} class="border-line bg-surface" contentClass="overflow-y-auto p-3" titleClass="text-secondary">
      <div class="grid gap-3">
        <div class="rounded-panel border border-line bg-canvas p-3">
          <div class="font-hud text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-muted">Selected date</div>
          <div class="mt-1 text-lg font-semibold text-ink-bright">{selectedDateLabel}</div>
        </div>

        {#if viewModel.loading}
          <div class="rounded-panel border border-line bg-surface-raised p-4 text-sm text-ink-muted">Syncing CalDAV events…</div>
        {:else if viewModel.error}
          <div class="rounded-panel border border-danger/50 bg-danger/10 p-4 text-sm text-danger">{viewModel.error}</div>
        {:else if !viewModel.configured}
          <div class="rounded-panel border border-warning/50 bg-warning/10 p-4 text-sm leading-6 text-warning">
            Calendar config missing. {viewModel.configurationHint}
          </div>
        {:else if selectedEvents.length === 0}
          <div class="rounded-panel border border-line bg-surface-raised p-4 text-sm text-ink-muted">No events returned for this date.</div>
        {:else}
          <div class="grid gap-2" aria-label="Selected date CalDAV events">
            {#each selectedEvents as event (event.uid)}
              <article class="rounded-panel border border-line bg-surface-raised p-3 shadow-sm">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3 class="truncate text-sm font-semibold text-ink-bright">{event.title}</h3>
                    <p class="mt-1 text-xs text-primary">{calendarEventSubtitle(event)}</p>
                  </div>
                  {#if event.allDay}
                    <span class="rounded-control border border-primary/40 bg-primary/10 px-1.5 py-1 font-hud text-[0.58rem] uppercase tracking-[0.12em] text-primary">all day</span>
                  {/if}
                </div>
                <p class="mt-3 line-clamp-3 text-sm leading-6 text-ink-muted">{eventDescription(event)}</p>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </Panel>
  </div>
</section>
