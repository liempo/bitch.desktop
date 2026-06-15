<script lang="ts">
  import { tick } from 'svelte'
  import { marked, Renderer, type Tokens } from 'marked'
  import DOMPurify from 'dompurify'
  import { boxUrlForAgentPath } from '$lib/box'
  import { gatewayMediaDataUrl, isRemoteGatewayMediaPath, mediaName, renderPreviewMediaReferences } from '$lib/media'
  import { previewFromBoxPath, previewKindForBoxPath, type ThreadPreview } from '$lib/preview'
  import './markdown.css'

  interface Props {
    onOpenPreview?: (preview: ThreadPreview) => void
    profile?: null | string
    streaming?: boolean
    text: string
  }

  let { onOpenPreview, profile = null, streaming = false, text }: Props = $props()
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

  $effect(() => {
    const element = containerElement
    if (!element) return

    element.addEventListener('click', handleMarkdownClick)
    return () => element.removeEventListener('click', handleMarkdownClick)
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

  function boxPreviewAnchor(href: string, label: string, title?: string | null): string | null {
    const boxUrl = boxUrlForAgentPath(href)
    if (!boxUrl) return null

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const previewKind = previewKindForBoxPath(href) ?? 'file'
    const text = label || mediaName(href)

    return `<a href="${escapeHtml(boxUrl)}" data-preview-source="${escapeHtml(href)}" data-preview-kind="${previewKind}"${titleAttr}>${escapeHtml(text)}</a>`
  }

  function markdownRenderer(): Renderer {
    const renderer = new Renderer()

    renderer.link = (token: Tokens.Link): string => {
      const href = token.href || ''
      const boxAnchor = boxPreviewAnchor(href, token.text || href, token.title)

      if (boxAnchor) return boxAnchor

      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${title}>${escapeHtml(token.text || href)}</a>`
    }

    renderer.image = (token: Tokens.Image): string => {
      const href = token.href || ''
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      const alt = escapeHtml(token.text || '')
      const boxAnchor = boxPreviewAnchor(href, token.text || mediaName(href) || 'BOX file', token.title)

      if (boxAnchor) return boxAnchor

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
      ADD_ATTR: [
        'target',
        'data-gateway-media-profile',
        'data-gateway-media-src',
        'data-gateway-media-state',
        'data-preview-kind',
        'data-preview-source'
      ],
      USE_PROFILES: { html: true }
    })
  }

  function handleMarkdownClick(event: MouseEvent): void {
    if (!onOpenPreview) return

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-preview-source]') : null
    const source = link?.dataset.previewSource
    const preview = source ? previewFromBoxPath(source) : null

    if (!preview) return

    event.preventDefault()
    onOpenPreview?.(preview)
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
