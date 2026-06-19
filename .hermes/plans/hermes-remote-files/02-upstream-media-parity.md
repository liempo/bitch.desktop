# Inline Media Parity

Copy official Hermes Desktop semantics where compatible with the current Svelte/Tauri surface. Do not introduce raw-path auto-linking.

## Media kind detection

Supported groups:

- image: `bmp`, `gif`, `jpeg`, `jpg`, `png`, `svg`, `webp`
- audio: `flac`, `m4a`, `mp3`, `ogg`, `opus`, `wav`
- video: `avi`, `mkv`, `mov`, `mp4`, `webm`
- otherwise: file/download

Examples:

```ts
expect(mediaKind('/opt/data/a.png')).toBe('image')
expect(mediaKind('/opt/data/a.mp3')).toBe('audio')
expect(mediaKind('/opt/data/a.mp4')).toBe('video')
expect(mediaKind('/opt/data/a.pdf')).toBe('file')
```

## Rendering

`MEDIA:` becomes an internal media marker. The renderer should hydrate media elements by requesting a data URL from the authenticated remote-file bridge. Unknown file types should become explicit open-preview links.

Examples:

```text
MEDIA:/opt/data/render.png -> inline image
MEDIA:/opt/data/clip.mp4   -> video controls or an honest unsupported/too-large state
MEDIA:/opt/data/song.mp3   -> audio controls or an honest unsupported/too-large state
```

Large audio/video still needs range-capable streaming before reliable seeking can be promised. Until then, keep the UX honest.
