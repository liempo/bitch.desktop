<script lang="ts">
  const pips = Array.from({ length: 18 }, (_, index) => index)
</script>

<div class="grid h-2.5 w-36 grid-cols-[repeat(18,minmax(0,1fr))] gap-0.5" aria-hidden="true">
  {#each pips as pip (pip)}
    <span class="bg-primary/25"></span>
  {/each}
</div>
