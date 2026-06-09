<script lang="ts">
  import { tick } from 'svelte'
  import { marked, Renderer, type Tokens } from 'marked'
  import DOMPurify from 'dompurify'
  import { gatewayMediaDataUrl, isRemoteGatewayMediaPath, renderPreviewMediaReferences } from '$lib/media'
  import './markdown.css'

  interface Props {
    profile?: null | string
    streaming?: boolean
    text: string
  }

  let { profile = null, streaming = false, text }: Props = $props()
  let containerElement: HTMLDivElement | null = $state(null)

  const html = $derived(renderMarkdown(text))
  const renderSignature = $derived(`${html}\u0000${profile ?? ''}`)

  $effect(() => {
    const signature = renderSignature

    void tick().then(() => {
      if (signature === renderSignature) {
        void hydrateGatewayImages()
      }
    })
  })

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => {
      switch (character) {
        case '&':
          return '&amp;'
        case '<':
          return '&lt;'
        case '>':
          return '&gt;'
        case '"':
          return '&quot;'
        default:
          return '&#39;'
      }
    })
  }

  function remoteImagePlaceholder(): string {
    return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
  }

  function markdownRenderer(): Renderer {
    const renderer = new Renderer()

    renderer.image = (token: Tokens.Image): string => {
      const href = token.href || ''
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      const alt = escapeHtml(token.text || '')

      if (isRemoteGatewayMediaPath(href)) {
        return `<img src="${remoteImagePlaceholder()}" data-gateway-media-src="${escapeHtml(href)}" alt="${alt}"${title}>`
      }

      return `<img src="${escapeHtml(href)}" alt="${alt}"${title}>`
    }

    return renderer
  }

  function renderMarkdown(value: string): string {
    const raw = marked.parse(renderPreviewMediaReferences(value || ''), {
      async: false,
      breaks: true,
      gfm: true,
      renderer: markdownRenderer()
    }) as string

    return DOMPurify.sanitize(raw, {
      ADD_ATTR: ['target', 'data-gateway-media-profile', 'data-gateway-media-src', 'data-gateway-media-state'],
      USE_PROFILES: { html: true }
    })
  }

  async function hydrateGatewayImages(): Promise<void> {
    if (!containerElement) return

    const images = Array.from(containerElement.querySelectorAll<HTMLImageElement>('img[data-gateway-media-src]'))

    const profileKey = profile ?? ''

    for (const image of images) {
      if (image.dataset.gatewayMediaState && image.dataset.gatewayMediaProfile === profileKey) continue

      const source = image.dataset.gatewayMediaSrc
      if (!source) continue

      image.dataset.gatewayMediaProfile = profileKey
      image.dataset.gatewayMediaState = 'loading'

      try {
        image.src = await gatewayMediaDataUrl(source, profile)
        image.dataset.gatewayMediaState = 'loaded'
      } catch {
        image.dataset.gatewayMediaState = 'failed'
        image.alt = image.alt ? `${image.alt} (unavailable)` : 'gateway image unavailable'
      }
    }
  }
</script>

<div
  class="bitch-markdown text-sm leading-6 text-ink"
  data-streaming={streaming ? 'true' : undefined}
  bind:this={containerElement}
>
  {@html html}
</div>
