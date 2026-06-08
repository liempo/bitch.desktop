<script lang="ts">
  import { marked } from 'marked'
  import DOMPurify from 'dompurify'
  import './markdown.css'

  interface Props {
    streaming?: boolean
    text: string
  }

  let { streaming = false, text }: Props = $props()

  const html = $derived(renderMarkdown(text))

  function renderMarkdown(value: string): string {
    const raw = marked.parse(value || '', {
      async: false,
      breaks: true,
      gfm: true
    }) as string

    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target'],
      USE_PROFILES: { html: true }
    })
  }
</script>

<div class="bitch-markdown text-sm leading-6 text-ink" data-streaming={streaming ? 'true' : undefined}>
  {@html html}
</div>
