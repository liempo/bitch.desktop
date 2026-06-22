# Hermes files subfeature

This subfeature is the public renderer contract for authenticated Hermes dashboard filesystem and media helpers. Import `$lib/hermes/files` from renderer code.

## Ownership

- `@file:` and `MEDIA:` path parsing and presentation.
- Remote file listing, text reads, and media data URLs through Hermes dashboard filesystem routes.
- Preview classification for authenticated remote files.

## Internal shape

- `domain/preview.ts` — remote path parsing, hrefs, denied-path checks, viewer classification, and file presentation helpers.
- `domain/media.ts` — `MEDIA:`, `@media:`, `@image:`, and `@file:` rendering helpers.
- `domain/types.ts` — shared remote-file DTOs and presentation types.
- `ports/remote-files-port.ts` — injectable remote filesystem port.
- `ports/local-files-port.ts` — explicit unavailable placeholder for local access; the product remains remote-only.
- `adapters/hermes-remote-files-adapter.ts` — authenticated Hermes dashboard `/api/fs/*` adapter through `dashboard_request`.
- `application/list-remote-directory.ts` — listing normalization and remote directory use case.
- `application/resolve-file-preview.ts` — text/data-url/default-cwd preview use cases.

Do not add public file-server URL derivation, local filesystem shortcuts, or Dufs/BOX origins here. The product path is authenticated Hermes remote-file access through the Tauri bridge.
