<script lang="ts">
  import { tick } from 'svelte'
  import { marked, Renderer, type Tokens } from 'marked'
  import DOMPurify from 'dompurify'
  import { isRemoteGatewayMediaPath, mediaName, renderPreviewMediaReferences } from '$lib/files/media'
  import { previewFromRemoteFilePath, type ThreadPreview } from '$lib/thread/preview'
  import { readRemoteFileDataUrl, remoteFileSourceFromHref, viewerKindForRemoteFile } from '$lib/files/remote'
  import './markdown.css'

  interface Props {
    onOpenPreview?: (preview: ThreadPreview) => void
    profile?: null | string
    streaming?: boolean
    text: string
  }

  type MediaOverlayKind = 'image' | 'pdf' | 'video'

  interface ActiveMediaOverlay {
    kind: MediaOverlayKind
    label: string
    source: string
  }

  let { onOpenPreview, profile = null, streaming = false, text }: Props = $props()
  let containerElement: HTMLDivElement | null = $state(null)
  let activeMediaOverlay: ActiveMediaOverlay | null = $state(null)
  let activeMediaOverlayUrl: null | string = $state(null)
  let activeMediaOverlayError = $state('')
  let activeMediaOverlayLoading = $state(false)
  let mediaOverlaySequence = 0

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

  function mediaOverlayKindForViewer(viewerKind: string): MediaOverlayKind | null {
    if (viewerKind === 'image' || viewerKind === 'pdf' || viewerKind === 'video') return viewerKind
    return null
  }

  function mediaOverlayKindFromValue(value: string | undefined): MediaOverlayKind | null {
    if (value === 'image' || value === 'pdf' || value === 'video') return value
    return null
  }

  function mediaOverlayAttrs(source: string, kind: MediaOverlayKind, label: string): string {
    return ` data-media-overlay-source="${escapeHtml(source)}" data-media-overlay-kind="${kind}" data-media-overlay-label="${escapeHtml(label || mediaName(source))}"`
  }

  function previewAnchorForPath(path: string, href: string, label: string, title?: string | null): string {
    const preview = previewFromRemoteFilePath(path, href, profile)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const text = label || preview?.label || mediaName(path)
    const kind = preview?.kind ?? 'file'

    return `<a href="${escapeHtml(href)}" data-preview-source="${escapeHtml(path)}" data-preview-kind="${kind}"${titleAttr}>${escapeHtml(text)}</a>`
  }

  function mediaOverlayAnchorForPath(
    path: string,
    href: string,
    kind: MediaOverlayKind,
    label: string,
    title?: string | null
  ): string {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const text = label || mediaName(path)
    const badge = kind === 'pdf' ? 'PDF' : kind === 'video' ? 'Video' : 'Image'

    return `<a href="${escapeHtml(href)}" class="inline-flex max-w-full items-center gap-2 rounded-control border border-line bg-surface/70 px-2 py-1 text-xs text-ink-bright hover:border-primary/55 hover:bg-primary/10"${mediaOverlayAttrs(path, kind, text)}${titleAttr}><span class="font-hud uppercase tracking-[0.16em] text-primary">${badge}</span><span class="truncate">${escapeHtml(text)}</span></a>`
  }

  function remoteMediaElement(href: string, label: string, title?: string | null): string | null {
    const source = remoteFileSourceFromHref(href)
    if (!source) return null

    const viewerKind = viewerKindForRemoteFile(source.path)
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
    const text = label || mediaName(source.path)
    const fallback = escapeHtml(text)
    const attrs = dataAttrsForRemoteSource(source.path)

    if (source.mode === 'media' && viewerKind === 'audio') {
      return `<audio controls preload="metadata"${attrs}${titleAttr}>${fallback}</audio>`
    }

    if (source.mode === 'media' && viewerKind === 'video') {
      return `<figure class="grid max-w-full gap-1 rounded-control border border-line bg-black/30 p-2" data-media-kind="video"><video controls preload="metadata" playsinline${attrs}${titleAttr} class="max-h-96 w-full bg-black">${fallback}</video><figcaption class="flex items-center gap-2 text-xs text-ink-muted"><span class="min-w-0 flex-1 truncate">${fallback}</span><a href="${escapeHtml(href)}" class="shrink-0 text-primary underline decoration-primary/50 underline-offset-4"${mediaOverlayAttrs(source.path, 'video', text)}>Open video</a></figcaption></figure>`
    }

    const overlayKind = mediaOverlayKindForViewer(viewerKind)
    if (source.mode === 'media' && overlayKind) {
      return mediaOverlayAnchorForPath(source.path, href, overlayKind, text, title)
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
        const image = `<img src="${remoteImagePlaceholder()}"${dataAttrsForRemoteSource(remoteSource.path)} alt="${alt}"${title}>`
        const overlayKind = mediaOverlayKindForViewer(viewerKindForRemoteFile(remoteSource.path))
        if (overlayKind === 'image') {
          const label = token.text || mediaName(remoteSource.path)
          return `<a href="${escapeHtml(href)}" class="inline-block max-w-full"${mediaOverlayAttrs(remoteSource.path, overlayKind, label)}${title}>${image}</a>`
        }
        return image
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
        'download',
        'loading',
        'playsinline',
        'preload',
        'target',
        'data-media-kind',
        'data-media-overlay-kind',
        'data-media-overlay-label',
        'data-media-overlay-source',
        'data-preview-kind',
        'data-preview-source',
        'data-remote-file-profile',
        'data-remote-file-src',
        'data-remote-file-state'
      ],
      ADD_TAGS: ['audio', 'figcaption', 'figure', 'video'],
      USE_PROFILES: { html: true }
    })
  }

  function handleMarkdownClick(event: MouseEvent): void {
    if (handleMediaOverlayClick(event)) return
    if (!onOpenPreview) return

    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-preview-source]') : null
    const source = link?.dataset.previewSource
    const preview = source ? previewFromRemoteFilePath(source, link?.href ?? source, profile) : null

    if (!preview) return

    event.preventDefault()
    onOpenPreview?.(preview)
  }

  function handleMediaOverlayClick(event: MouseEvent): boolean {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-media-overlay-source]') : null
    const source = link?.dataset.mediaOverlaySource
    const kind = mediaOverlayKindFromValue(link?.dataset.mediaOverlayKind)
    if (!link || !source || !kind) return false

    event.preventDefault()
    const label = link.dataset.mediaOverlayLabel || mediaName(source)
    const embedded = link.querySelector<HTMLImageElement | HTMLMediaElement>('[data-remote-file-src]')
    const hydratedUrl = embedded?.dataset.remoteFileState === 'loaded' ? embedded.currentSrc || embedded.src : null
    void openMediaOverlay({ kind, label, source }, hydratedUrl)
    return true
  }

  async function openMediaOverlay(overlay: ActiveMediaOverlay, hydratedUrl?: null | string): Promise<void> {
    const sequence = (mediaOverlaySequence += 1)
    activeMediaOverlay = overlay
    activeMediaOverlayUrl = hydratedUrl || null
    activeMediaOverlayError = ''
    activeMediaOverlayLoading = !hydratedUrl

    if (hydratedUrl) return

    try {
      const dataUrl = await readRemoteFileDataUrl(overlay.source, profile)
      if (sequence !== mediaOverlaySequence) return
      activeMediaOverlayUrl = dataUrl
    } catch (error) {
      if (sequence === mediaOverlaySequence) activeMediaOverlayError = error instanceof Error ? error.message : String(error)
    } finally {
      if (sequence === mediaOverlaySequence) activeMediaOverlayLoading = false
    }
  }

  function closeMediaOverlay(): void {
    mediaOverlaySequence += 1
    activeMediaOverlay = null
    activeMediaOverlayUrl = null
    activeMediaOverlayError = ''
    activeMediaOverlayLoading = false
  }

  function handleMediaOverlayBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) closeMediaOverlay()
  }

  function handleMediaOverlayKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && activeMediaOverlay) closeMediaOverlay()
  }

  function downloadNameForMediaOverlay(overlay: ActiveMediaOverlay): string {
    return (overlay.label || mediaName(overlay.source) || 'media').replace(/[\\/]/g, '-')
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

<svelte:window onkeydown={handleMediaOverlayKeydown} />

<div
  class="bitch-markdown text-sm leading-6 text-ink"
  data-streaming={streaming ? 'true' : undefined}
  bind:this={containerElement}
>
  {@html html}
</div>

{#if activeMediaOverlay}
  <div
    class="fixed inset-0 z-50 flex bg-canvas/95 text-ink shadow-[0_0_0_1px_var(--color-line)] backdrop-blur"
    role="dialog"
    aria-modal="true"
    aria-label={`Media viewer: ${activeMediaOverlay.label}`}
    tabindex="-1"
    onclick={handleMediaOverlayBackdropClick}
    onkeydown={handleMediaOverlayKeydown}
  >
    <div class="flex min-h-0 w-full flex-col">
      <header class="flex min-h-12 items-center gap-2 border-b border-line bg-surface/90 px-3">
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-sm font-semibold text-ink-bright">{activeMediaOverlay.label}</h2>
          <p class="truncate font-hud text-[0.62rem] uppercase tracking-[0.14em] text-ink-muted">
            {activeMediaOverlay.kind} · {activeMediaOverlay.source}
          </p>
        </div>
        {#if activeMediaOverlayUrl}
          <a
            class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-primary/50 bg-surface-raised font-hud text-base font-bold text-primary hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
            href={activeMediaOverlayUrl}
            download={downloadNameForMediaOverlay(activeMediaOverlay)}
            aria-label="Download media"
            title="Download media"
          >
            ⇩
          </a>
        {/if}
        <button
          type="button"
          class="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface-raised font-hud text-sm font-bold text-ink-muted hover:border-line-strong hover:text-ink-bright focus-visible:outline-2 focus-visible:outline-focus"
          aria-label="Close media viewer"
          onclick={closeMediaOverlay}
        >
          ×
        </button>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden bg-black/20 p-3">
        {#if activeMediaOverlayLoading}
          <div class="flex h-full items-center justify-center rounded-panel border border-primary/30 bg-primary/10 font-hud text-[0.68rem] uppercase tracking-[0.18em] text-primary" role="status">
            Loading remote media…
          </div>
        {:else if activeMediaOverlayError}
          <div class="flex h-full items-center justify-center rounded-panel border border-dashed border-warning/40 bg-warning/5 p-6 text-center text-sm leading-6 text-warning" role="status">
            <div>
              <p class="font-semibold uppercase tracking-[0.12em]">Media unavailable</p>
              <p class="mt-2 text-warning/80">{activeMediaOverlayError}</p>
            </div>
          </div>
        {:else if activeMediaOverlay.kind === 'image' && activeMediaOverlayUrl}
          <div class="flex h-full items-center justify-center overflow-auto">
            <img src={activeMediaOverlayUrl} alt={activeMediaOverlay.label} class="max-h-full max-w-full object-contain" />
          </div>
        {:else if activeMediaOverlay.kind === 'video' && activeMediaOverlayUrl}
          <div class="flex h-full items-center justify-center overflow-auto">
            <!-- svelte-ignore a11y_media_has_caption -->
            <video controls preload="metadata" src={activeMediaOverlayUrl} class="max-h-full max-w-full rounded-control"></video>
          </div>
        {:else if activeMediaOverlay.kind === 'pdf' && activeMediaOverlayUrl}
          <iframe title={activeMediaOverlay.label} src={activeMediaOverlayUrl} class="h-full w-full rounded-control border border-line bg-white"></iframe>
        {:else}
          <div class="flex h-full items-center justify-center rounded-panel border border-line bg-surface/70 p-6 text-center text-sm text-ink-muted">
            Media preview unavailable.
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
