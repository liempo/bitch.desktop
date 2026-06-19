<script lang="ts">
  import { tick } from 'svelte'
  import { marked, Renderer, type Tokens } from 'marked'
  import DOMPurify from 'dompurify'
  import { isRemoteGatewayMediaPath, mediaName, renderPreviewMediaReferences } from '$lib/media'
  import { previewFromRemoteFilePath, type ThreadPreview } from '$lib/preview'
  import { readRemoteFileDataUrl, remoteFileSourceFromHref, viewerKindForRemoteFile } from '$lib/remote-files'
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
        void hydrateRemoteMedia()
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

  function dataAttrsForRemoteSource(source: string): string {
    return ` data-remote-file-src="${escapeHtml(source)}"`
  }

  function previewAnchorForPath(path: string, href: string, label: string, title?: string | null): string {
    const preview = previewFromRemoteFilePath(path, href, profile)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const text = label || preview?.label || mediaName(path)
    const kind = preview?.kind ?? 'file'

    return `<a href="${escapeHtml(href)}" data-preview-source="${escapeHtml(path)}" data-preview-kind="${kind}"${titleAttr}>${escapeHtml(text)}</a>`
  }

  function remoteMediaElement(href: string, label: string, title?: string | null): string | null {
    const source = remoteFileSourceFromHref(href)
    if (!source) return null

    const viewerKind = viewerKindForRemoteFile(source.path)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const fallback = escapeHtml(label || mediaName(source.path))
    const attrs = dataAttrsForRemoteSource(source.path)

    if (source.mode === 'media' && viewerKind === 'audio') {
      return `<audio controls preload="metadata"${attrs}${titleAttr}>${fallback}</audio>`
    }

    if (source.mode === 'media' && viewerKind === 'video') {
      return `<video controls preload="metadata"${attrs}${titleAttr}>${fallback}</video>`
    }

    return previewAnchorForPath(source.path, href, label, title)
  }

  function markdownRenderer(): Renderer {
    const renderer = new Renderer()

    renderer.link = (token: Tokens.Link): string => {
      const href = token.href || ''
      const remoteElement = remoteMediaElement(href, token.text || href, token.title)
      if (remoteElement) return remoteElement

      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer"${title}>${escapeHtml(token.text || href)}</a>`
    }

    renderer.image = (token: Tokens.Image): string => {
      const href = token.href || ''
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
      const alt = escapeHtml(token.text || '')
      const remoteSource = remoteFileSourceFromHref(href)

      if (remoteSource?.mode === 'media') {
        return `<img src="${remoteImagePlaceholder()}"${dataAttrsForRemoteSource(remoteSource.path)} alt="${alt}"${title}>`
      }

      if (isRemoteGatewayMediaPath(href)) {
        return `<img src="${remoteImagePlaceholder()}"${dataAttrsForRemoteSource(href)} alt="${alt}"${title}>`
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
        'controls',
        'preload',
        'target',
        'data-preview-kind',
        'data-preview-source',
        'data-remote-file-profile',
        'data-remote-file-src',
        'data-remote-file-state'
      ],
      USE_PROFILES: { html: true }
    })
  }

  function handleMarkdownClick(event: MouseEvent): void {
    if (!onOpenPreview) return

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-preview-source]') : null
    const source = link?.dataset.previewSource
    const preview = source ? previewFromRemoteFilePath(source, link?.href ?? source, profile) : null

    if (!preview) return

    event.preventDefault()
    onOpenPreview?.(preview)
  }

  async function hydrateRemoteMedia(): Promise<void> {
    if (!containerElement) return

    const elements = Array.from(containerElement.querySelectorAll<HTMLImageElement | HTMLMediaElement>('[data-remote-file-src]'))
    const profileKey = profile ?? ''

    for (const element of elements) {
      if (element.dataset.remoteFileState && element.dataset.remoteFileProfile === profileKey) continue

      const source = element.dataset.remoteFileSrc
      if (!source) continue

      element.dataset.remoteFileProfile = profileKey
      element.dataset.remoteFileState = 'loading'

      try {
        element.src = await readRemoteFileDataUrl(source, profile)
        element.dataset.remoteFileState = 'loaded'
      } catch {
        element.dataset.remoteFileState = 'failed'
        if (element instanceof HTMLImageElement) {
          element.alt = element.alt ? `${element.alt} (unavailable)` : 'remote image unavailable'
        }
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
