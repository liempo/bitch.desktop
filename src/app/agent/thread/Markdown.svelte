<script lang="ts">
  import { tick } from 'svelte'
  import { marked, Renderer, type Tokens } from 'marked'
  import DOMPurify from 'dompurify'
  import { boxUrlForAgentPath } from '$lib/box'
  import {
    gatewayMediaDataUrl,
    isRemoteGatewayMediaPath,
    mediaHtmlForMarkdownHref,
    mediaName,
    renderPreviewMediaReferences
  } from '$lib/media'
  import { previewFromFileReference, previewKindForBoxPath, type ThreadPreview } from '$lib/preview'
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

  function decodePreviewHref(href: string): string | null {
    if (!href.startsWith('#preview:')) return null

    const encoded = href.slice('#preview:'.length)
    if (!encoded) return null

    try {
      return decodeURIComponent(encoded)
    } catch {
      return encoded
    }
  }

  function explicitPreviewAnchor(href: string, label: string, title?: string | null): string | null {
    const source = decodePreviewHref(href)
    if (!source) return null

    const preview = previewFromFileReference(source)
    if (!preview) return null

    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const text = label || preview.label

    return `<a href="${escapeHtml(preview.url ?? href)}" data-preview-source="${escapeHtml(source)}" data-preview-kind="${preview.kind}"${titleAttr}>${escapeHtml(text)}</a>`
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
      const mediaHtml = mediaHtmlForMarkdownHref(href, token.text || href)
      if (mediaHtml) return mediaHtml

      const previewAnchor = explicitPreviewAnchor(href, token.text || href, token.title)
      if (previewAnchor) return previewAnchor

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
        'data-media-kind',
        'data-preview-kind',
        'data-preview-source',
        'controls',
        'download',
        'loading',
        'playsinline',
        'preload'
      ],
      ADD_TAGS: ['audio', 'video', 'figure', 'figcaption'],
      USE_PROFILES: { html: true }
    })
  }

  function handleMarkdownClick(event: MouseEvent): void {
    if (!onOpenPreview) return

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-preview-source]') : null
    const source = link?.dataset.previewSource
    const preview = source ? previewFromFileReference(source) : null

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
