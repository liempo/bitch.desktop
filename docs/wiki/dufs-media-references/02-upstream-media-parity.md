# Plan 02 — Upstream-Style MEDIA Rendering Parity

> **For Hermes:** Implement after Plan 01. Copy upstream Hermes Desktop semantics where compatible with the Svelte/Tauri surface. Keep dufs as serving substrate; do not introduce raw-path auto-linking.

**Goal:** Make `MEDIA:` render in-thread like upstream Hermes Desktop: images inline/zoomable, audio/video controls, file fallback links.

**Architecture:** `MEDIA:<path>` becomes an internal `#media:` markdown link. The thread markdown renderer intercepts `#media:` and renders a media component based on file extension and fetchability.

**Primary files:**

- Modify: `src/lib/media.ts`
- Modify: `src/lib/messages/media-attachments.ts`
- Modify: `src/app/agent/thread/Markdown.svelte`
- Create if useful: `src/app/agent/thread/MediaAttachment.svelte`
- Tests: `src/lib/media.test.ts`, `src/lib/messages/media-attachments.test.ts`, `src/app/agent/thread/*test*`

---

## Task 1: Add upstream media kind map

**Objective:** Recognize image/audio/video/file kinds using upstream extension behavior.

Add:

```ts
export type MediaKind = 'audio' | 'image' | 'video' | 'file'
```

Map extensions:

- image: `bmp`, `gif`, `jpeg`, `jpg`, `png`, `svg`, `webp`
- audio: `flac`, `m4a`, `mp3`, `ogg`, `opus`, `wav`
- video: `avi`, `mkv`, `mov`, `mp4`, `webm`
- default: `file`

Tests:

```ts
expect(mediaKind('/box/a.png')).toBe('image')
expect(mediaKind('/box/a.mp3')).toBe('audio')
expect(mediaKind('/box/a.mp4')).toBe('video')
expect(mediaKind('/box/a.pdf')).toBe('file')
```

## Task 2: Add internal `#media:` href helpers

**Objective:** Match upstream's internal media-link strategy.

Add helpers:

```ts
export function mediaMarkdownHref(path: string): string {
  return `#media:${encodeURIComponent(path)}`
}

export function mediaPathFromMarkdownHref(href?: string): string | null {
  if (!href?.startsWith('#media:')) return null
  try {
    return decodeURIComponent(href.slice('#media:'.length))
  } catch {
    return null
  }
}
```

## Task 3: Rewrite `MEDIA:` to `#media:`

**Objective:** `MEDIA:` should not open the preview sidebar by default.

Examples:

```text
MEDIA:/box/render.png → [Image: render.png](#media:%2Fbox%2Frender.png)
MEDIA:/box/clip.mp4   → [Video: clip.mp4](#media:%2Fbox%2Fclip.mp4)
MEDIA:/box/song.mp3   → [Audio: song.mp3](#media:%2Fbox%2Fsong.mp3)
```

Keep quoting support for spaces:

```text
MEDIA:`/box/render 1.png`
```

## Task 4: Render `#media:` in thread markdown

**Objective:** Add an in-thread media renderer.

Behavior:

- image: adaptive inline image with max width constrained to message width and sane max height.
- audio: `<audio controls preload="metadata">` with filename.
- video: `<video controls>` with max height and dark background.
- file: simple open link.

Fetch strategy:

- `/box/...`: prefer dufs URL via existing `boxUrlForAgentPath`.
- local absolute paths: do not render as chat directives; bitch.desktop is remote-only and should use BOX/Dufs or browser-fetchable URLs for interactive media.
- audio/video should prefer browser-fetchable dufs URL; if local bridge does not stream, show fallback open link.

## Task 5: Preserve `@image:` legacy alias

**Objective:** Keep existing `@image:` working but deprecate it.

Behavior:

- `@image:/box/render.png` rewrites to the same internal `#media:` path as `MEDIA:`.
- Plugin should not emit `@image:` by default.

## Task 6: Verify

Run:

```bash
npm test -- src/lib/media.test.ts src/lib/messages/media-attachments.test.ts src/app/agent/thread/MessageAttachments.test.ts
npm run fmt:check
npm run type-check
npm run lint
npm test
```

Completion proof:

- `MEDIA:` renders image/audio/video/file in thread.
- `@file:` from Plan 01 still opens the preview sidebar.
- Raw `/box` paths still remain plain text.
