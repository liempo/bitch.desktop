<script lang="ts">
  import Panel from '@/app/components/ui/Panel.svelte'
</script>

<section class="h-full min-h-0 bg-chat-scroll/40 p-4 font-mono text-ink" aria-label="Calendar">
  <Panel
    title="CALENDAR"
    badge="placeholder"
    class="border-line bg-surface"
    contentClass="grid h-full min-h-0 place-items-center p-6 text-center"
    titleClass="text-ink-muted"
  >
    <div class="max-w-md">
      <div class="font-hud text-sm font-bold uppercase tracking-[0.16em] text-primary">Chronos panel queued</div>
      <p class="mt-3 text-sm leading-6 text-ink-muted">
        Calendar controls are reserved for the remote dashboard surface. No local scheduler or fake feed is mounted here.
      </p>
    </div>
  </Panel>
</section>
