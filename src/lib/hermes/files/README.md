# Hermes files subfeature

This subfeature is the public renderer contract for authenticated Hermes dashboard filesystem and media helpers. Import `$lib/hermes/files` from renderer code.

## Ownership

- `@file:` and `MEDIA:` path parsing and presentation.
- Remote file listing, text reads, and media data URLs through Hermes dashboard filesystem routes.
- Managed remote-file actions for create directory, upload/write, delete, and authenticated data-URL download flows.
- Preview classification for authenticated remote files.

## Internal shape

- `domain/preview.ts` — remote path parsing, hrefs, denied-path checks, viewer classification, and file presentation helpers.
- `domain/media.ts` — `MEDIA:`, `@media:`, `@image:`, and `@file:` rendering helpers.
- `domain/types.ts` — shared remote-file DTOs and presentation types.
- `ports/remote-files-port.ts` — injectable remote filesystem port.
- `ports/local-files-port.ts` — explicit unavailable placeholder for local access; the product remains remote-only.
- `adapters/hermes-remote-files-adapter.ts` — authenticated Hermes dashboard adapter through `dashboard_request`.
- `application/list-remote-directory.ts` — listing normalization and remote directory use case.
- `application/resolve-file-preview.ts` — `/api/fs/*` text/data-url/default-cwd preview use cases.
- `application/manage-remote-files.ts` — `/api/files*` managed action helpers with normalized metadata and errors.

Do not add public file-server URL derivation, local filesystem shortcuts, or Dufs/BOX origins here. The product path is authenticated Hermes remote-file access through the Tauri bridge.

## Dashboard route split

BITCH intentionally bridges two official Hermes dashboard file surfaces through the same authenticated Tauri `dashboard_request` path:

- `/api/fs/*` is the arbitrary remote filesystem preview surface. Use it for directory browsing at `/`, text previews, media data URLs, and default-cwd discovery. These routes preserve remote-only semantics and do not derive public file-server URLs.
- `/api/files*` is the managed file-action surface. Use `/api/files/mkdir` for directory creation, `DELETE /api/files` for deletes, `/api/files/read` for authenticated data-URL download/read flows, `/api/files/upload-stream` for multipart `FormData` uploads when the bridge can forward multipart bodies, and `/api/files/upload` as the JSON data-URL write fallback.

The public helpers normalize returned managed entry metadata from Hermes' snake_case response shape to the renderer's camelCase `RemoteFileEntry` model and wrap failed actions in `RemoteFileActionError`. They only normalize remote path syntax with `filePathFromRemoteSource`; no new client-side path denial list is added here. Secret-path blocking remains limited to the existing automatic preview policy.
