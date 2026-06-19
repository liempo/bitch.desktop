# Hermes Remote File References — Overview Plan

**Goal:** Align `bitch.desktop` with official Hermes Desktop remote-filesystem behavior. Explicit Hermes directives drive preview and inline rendering; raw absolute paths remain plain text.

**Architecture:** the desktop renderer uses authenticated Hermes dashboard filesystem routes through the Tauri bridge. The renderer does not derive public file-server URLs and does not depend on custom reference-generation tooling.

## User-visible contract

| Input                          | Desktop behavior                                          |
| ------------------------------ | --------------------------------------------------------- |
| `/opt/data/foo.png`            | plain markdown/text only                                  |
| `@file:/opt/data/foo.pdf`      | visible file link; click opens the right preview sidebar  |
| ``@file:`/opt/data/a b.png` `` | same as above, with preserved spaces                      |
| `MEDIA:/opt/data/foo.png`      | inline media rendering through the authenticated resolver |
| `@image:/opt/data/foo.png`     | compatibility alias for stored image references only      |

## Implementation slices

1. Frontend file references: parse explicit `@file:` values, open the preview rail, and keep raw paths inert.
2. Inline media parity: render `MEDIA:` as image/audio/video/file according to official Hermes media groups.
3. Official remote-file bridge: use `/api/fs/list`, `/api/fs/read-text`, `/api/fs/read-data-url`, and `/api/fs/default-cwd` through the existing dashboard bridge.
4. Integration rollout: update docs, env examples, source-contract tests, and final verification probes.

## Verification gate

- Raw absolute paths stay plain.
- `@file:` works for any absolute path visible to the remote Hermes process.
- Quoted file directives preserve spaces.
- `MEDIA:` renders inline for supported images/audio/video.
- All preview bytes come from authenticated dashboard filesystem routes.
- No custom helper plugin or public sidecar is required.
