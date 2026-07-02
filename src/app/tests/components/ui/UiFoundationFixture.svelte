<script lang="ts">
  import Button from '@/app/components/ui/Button.svelte'
  import Panel from '@/app/components/ui/Panel.svelte'
  import BracketTrigger from '@/app/components/ui/BracketTrigger.svelte'

  let count = $state(0)
</script>

<Panel title="Foundation Panel" badge="dom" aria-label="Foundation component panel">
  <div class="grid gap-3">
    <Button variant="primary" onclick={() => (count += 1)}>Activate harness</Button>
    <BracketTrigger label="PROFILE" value="default" aria-label="Profile picker" />
    <p aria-live="polite">count: {count}</p>
  </div>
</Panel>
