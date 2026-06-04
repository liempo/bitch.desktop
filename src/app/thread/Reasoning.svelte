<script lang="ts">
  interface Props {
    text: string
  }

  let { text }: Props = $props()
</script>

{#if text.trim()}
  <details class="mb-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-100/90">
    <summary class="cursor-pointer select-none font-medium uppercase tracking-[0.16em] text-violet-300/80">
      Reasoning
    </summary>
    <div class="mt-2 whitespace-pre-wrap wrap-break-word leading-5 text-violet-100/80">{text}</div>
  </details>
{/if}
