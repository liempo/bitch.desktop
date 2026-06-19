# Hermes remote file support

**Status:** implementation contract for `feat/hermes-remote-files`.
**Upstream baseline:** official Hermes Desktop remote filesystem APIs and Deliverable Mode behavior.

## Goal

`BITCH` is remote-only. Every file preview, inline media render, and composer attachment resolves through the authenticated Hermes dashboard/gateway for the active profile. The renderer must not fetch public file-server origins, derive URLs from a special root, or own dashboard auth headers.

Raw absolute paths remain plain text in the desktop thread. Renderer behavior requires an explicit Hermes directive or an internal preview marker.

## Official syntax and semantics

| Syntax                                                             | Official Hermes meaning                                                                                                                                                                                                    | `BITCH` behavior                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@file:<path>`                                                     | User/context reference. The backend expands readable text into attached context, strips the directive from submitted prompts, and emits actionable blocks for binary files. Optional ranges use `@file:src/main.py:10-30`. | Treat as the universal explicit file directive for any path visible to the remote Hermes environment. In assistant/stored output, render a file chip that opens the preview rail through the remote filesystem API. |
| ``@file:`path with spaces.txt` `` / `@file:"path with spaces.txt"` | Quoted values preserve spaces and bracket characters.                                                                                                                                                                      | Preserve upstream parsing/formatting so staged attachment refs round-trip through `agent.context_references`.                                                                                                       |
| `@folder:<path>`                                                   | User/context reference that injects a bounded folder listing.                                                                                                                                                              | Keep as context/composer syntax. Do not treat folders as preview files unless a folder-browser UI is explicitly added.                                                                                              |
| `@image:<path>`                                                    | Legacy/user-side image chip. In remote mode, local image bytes are uploaded through `image.attach_bytes`; gateway-visible paths may use `image.attach`.                                                                    | Keep only for compatibility with stored user messages and image attachments. Prefer `MEDIA:` for new assistant-authored inline media.                                                                               |
| `MEDIA:<path>`                                                     | Assistant-side inline media directive. Desktop rewrites it to a media marker and renders by media kind.                                                                                                                    | Render image/audio/video inline when the authenticated remote resolver can provide bytes. Degrade unknown or unsupported files to an explicit preview/download link.                                                |
| `[Preview: name](#preview:%2Fpath)`                                | Internal preview marker. Raw paths and URLs are not inferred as preview targets.                                                                                                                                           | Use internal markers for renderer-created links; public agent output should use explicit `@file:<path>` for file preview.                                                                                           |
| Plain absolute path in an agent response                           | Gateway Deliverable Mode on messaging platforms may scan absolute paths and upload native attachments. This is not Desktop remote-preview syntax.                                                                          | Do not rely on this in the desktop thread. Require `@file:` or `MEDIA:` for renderer behavior.                                                                                                                      |

Supported `MEDIA:` media groups are extension-driven:

- images: `bmp`, `gif`, `jpeg`, `jpg`, `png`, `svg`, `webp`
- audio: `flac`, `m4a`, `mp3`, `ogg`, `opus`, `wav`
- video: `avi`, `mkv`, `mov`, `mp4`, `webm`
- everything else: `file`

## Remote resolver contract

All remote byte reads go through the active profile's authenticated Hermes dashboard/gateway. Renderer code calls the Tauri bridge, and the bridge attaches the dashboard session token.

### `/api/fs/*`: arbitrary remote filesystem preview

Official Desktop uses the dashboard filesystem API through the desktop bridge when the connection is remote:

- `GET /api/fs/list?path=<path>`
  - returns `{ entries: [{ name, path, isDirectory }] }`
  - sorts directories first, then case-insensitive names
  - returns HTTP 200 with `{ entries: [], error: ... }` for expected filesystem errors
- `GET /api/fs/read-text?path=<path>`
  - requires a regular file
  - rejects source files over 64 MiB with 413
  - reads at most 512 KiB and reports whether the payload was clipped
  - returns `binary`, `byteSize`, `language`, `mimeType`, `path`, `text`, and clip state
- `GET /api/fs/read-data-url?path=<path>`
  - requires a regular file
  - rejects files over 16 MiB with 413
  - returns `{ dataUrl: "data:<mime>;base64,..." }`
- `GET /api/fs/git-root?path=<path>` resolves the nearest git root from a file or directory path
- `GET /api/fs/default-cwd` returns `{ cwd, branch }` for the backend's default working directory. The Files tab intentionally mounts `/` instead of this cwd so operators can browse the full authenticated remote filesystem tree.

Path parsing accepts absolute paths, `~`, paths relative to the dashboard process cwd, and `file://` URLs with an empty or `localhost` authority. NUL bytes, foreign-host `file://` URLs, and invalid paths return 400.

### `/api/media`: generated-image compatibility only

`GET /api/media?path=<path>` is not the general file resolver. It is an authenticated image-only data-URL endpoint for Hermes-generated media roots. New remote file preview and inline media should use `/api/fs/read-data-url` unless a narrower generated-image optimization is intentionally added.

### `/api/files/*`: managed file download/upload surface

The managed-files API is useful for downloads and uploads but has a different root policy than `/api/fs/*`:

- `GET /api/files/download?path=<path>` streams an attachment download and caps files at 100 MiB.
- Only this download route accepts `?token=` because OS-opened links cannot set headers. `BITCH` should avoid leaking that token into the renderer; prefer a Rust/Tauri-authenticated proxy or a short-lived object URL.
- `POST /api/files/upload` accepts data URLs; `POST /api/files/upload-stream` streams multipart bodies in 1 MiB chunks and avoids base64 inflation.
- `HERMES_DASHBOARD_FILES_ROOT`, or hosted `/opt/data`, locks the managed root. Without that, local dashboards default to the backend user's home directory and can change path.

## Composer attachment pipeline

Remote Desktop cannot pass a client-local path to the gateway and hope the agent can read it. Official Desktop stages selected or dropped files first:

1. The local desktop bridge reads the file bytes.
2. Images call JSON-RPC `image.attach_bytes` with `session_id`, `content_base64`, and `filename`.
3. Non-image files call JSON-RPC `file.attach` with `session_id`, `path`, `name`, and, in remote mode, `data_url`.
4. The gateway materializes files it cannot already read under `<session cwd>/.hermes/desktop-attachments/`.
5. The gateway returns a workspace-relative `ref_text`, for example `@file:.hermes/desktop-attachments/report.txt`.
6. `prompt.submit` sends that returned ref, not the original client path.

If the attachment already has a `refText` and no path, official Desktop passes it through. That is safe only for refs already meaningful to the remote session. OS or Finder drops must carry bytes through `file.attach` / `image.attach_bytes`.

## Preview and inline-media rendering

### `@file:` preview rail

For assistant or stored text, convert explicit `@file:<path>` references into preview rail actions:

1. Parse quoted and unquoted values with the upstream grammar.
2. Normalize `file://` forms and preserve absolute remote paths.
3. Resolve relative refs against the active session cwd/default cwd only when the backend context makes that unambiguous.
4. Fetch text previews with `/api/fs/read-text` for known text/code and unknown/opaque file types.
5. Render the returned `text` even when the API's `binary` hint is true; the desktop client cannot reliably determine binary status from the path alone.
6. For first-class image/audio/video/pdf/html previews, use `/api/fs/read-data-url` and render the returned data URL.
7. For HTML, feed a sandboxed iframe from an authenticated data/blob URL, not a raw remote URL.
8. For missing, denied, unreadable, or oversized files, show an explicit error card.

Raw absolute paths must stay plain markdown/text. Upstream preview target tests explicitly refuse to infer preview targets from raw paths or URLs; only internal preview markers count.

### `MEDIA:` inline rendering

`MEDIA:<path>` renders inside the message body:

- image: inline zoomable image
- audio: `<audio controls preload="metadata">`
- video: `<video controls>` with bounded height
- file/unknown: open/download link

Small remote media can use `/api/fs/read-data-url`; large audio/video needs a range-capable Tauri proxy before playback/seeking is promised.

## Security and error behavior

| Case               | Official behavior                                                                                                                                                                                                                         | Migration requirement                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing path       | Context refs warn; `/api/fs/read-*` returns 404; `/api/fs/list` returns `ENOENT`; `/api/media` returns 404.                                                                                                                               | Render a clear missing-file state. No dead chips.                                                                                                 |
| Permission denied  | Context refs warn; `/api/fs/read-*` returns 403 `File is not readable`; `/api/fs/list` returns `EACCES`.                                                                                                                                  | Surface the backend error without retrying through public URLs.                                                                                   |
| Sensitive paths    | Context refs block `.ssh`, `.aws`, `.gnupg`, `.kube`, `.docker`, `.azure`, `.config/gh`, `.netrc`, `.pgpass`, `.npmrc`, `.pypirc`, `$HERMES_HOME/.env`, and `skills/.hub`. `/api/fs/*` is authenticated but does not carry this denylist. | Mirror this denylist for automatic preview of assistant-authored `@file:` refs. Require explicit user action for any future browser escape hatch. |
| Symlink escape     | Context refs and `/api/media` resolve real paths before checks.                                                                                                                                                                           | Resolve before root/deny checks. String-prefix checks are not enough.                                                                             |
| Directory as file  | Context refs warn `path is not a file`; `/api/fs/read-*` returns 400 `Path points to a directory`; managed download returns 400 `Path is not a file`.                                                                                     | Show directory-not-file unless a folder UI is intentionally invoked.                                                                              |
| Non-regular file   | `/api/fs/read-*` returns 400 `Only regular files can be read`.                                                                                                                                                                            | Do not render sockets, devices, FIFOs, or procfs streams.                                                                                         |
| Large text         | `/api/fs/read-text` rejects over 64 MiB and previews only the first 512 KiB.                                                                                                                                                              | Show byte size/clip state; do not load huge text into Svelte state.                                                                               |
| Large binary/media | `/api/fs/read-data-url` rejects over 16 MiB; `/api/media` rejects over 25 MiB; managed download rejects over 100 MiB.                                                                                                                     | Use download/stream fallback or a clear too-large state.                                                                                          |
| Range/seeking      | `/api/fs/read-data-url` and `/api/media` do not support HTTP range.                                                                                                                                                                       | Add a remote streaming proxy before claiming large media seeking support.                                                                         |

## Implementation checklist

1. Use a remote file/media module backed by `/api/fs/*`.
2. Render explicit `@file:` refs as preview chips.
3. Render quoted/unquoted `MEDIA:` refs inline.
4. Leave raw paths plain.
5. Keep legacy `@image:` compatibility for stored user attachments only.
6. Stage composer attachments through `image.attach_bytes` / `file.attach` and submit returned `@file:` refs.
7. Document dashboard-authenticated remote file routing and keep env docs limited to dashboard origin + bridge token.

## Verification probes before the final PR

Run these against a real remote dashboard backend through the same Tauri bridge path the app uses:

1. `@file:/tmp/hermes-remote-probe.txt` opens a remote text preview.
2. ``@file:`/tmp/hermes remote probe.txt` `` preserves spaces and opens preview.
3. `@file:/tmp/hermes-remote-probe.txt:2-3` still works as user context injection.
4. `MEDIA:/tmp/hermes-remote-probe.png` renders inline through `/api/fs/read-data-url`.
5. `MEDIA:/tmp/hermes-remote-probe.mp3` either plays through a remote blob/stream or shows an honest unsupported/too-large state; it must not use local `file://`.
6. Missing paths show a visible 404/missing state.
7. Directory paths show a directory-not-file state.
8. A symlink from an allowed-looking path to a denied secret is blocked by the resolved-path policy.
9. `$HERMES_HOME/.env`, `~/.ssh/id_rsa`, and similar secret-like paths are blocked for automatic preview.
10. A file over 16 MiB does not get base64-loaded into the renderer.

Passing these probes is the migration gate. Anything less is just a public file server wearing a nicer badge.

## Upstream source map

- `agent/context_references.py` — `@file:`, `@folder:`, `@url:`, `@diff`, quoting, range parsing, allowed-root checks, secret-path blocks, binary-file attached-context blocks
- `tui_gateway/server.py` — `image.attach_bytes`, `file.attach`, `.hermes/desktop-attachments/`, attachment ref quoting, backend contract v2
- `hermes_cli/web_server.py` — `/api/fs/*`, `/api/media`, `/api/files/*`, size caps, managed-files policy, and query-token download exception
- `apps/desktop/src/lib/desktop-fs.ts` — remote-mode `/api/fs/*` bridge calls
- `apps/desktop/src/lib/media.ts`, `chat-messages.ts`, and `markdown-text.tsx` — `MEDIA:` parsing, media kinds, download URLs, and current local-vs-remote media behavior
- Hermes docs: Desktop app and Deliverable Mode pages
