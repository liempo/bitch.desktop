# Official Remote File Bridge

## Dashboard routes

All renderer file preview reads go through the Tauri dashboard bridge. The bridge owns auth headers and profile routing.

- `GET /api/fs/default-cwd` discovers the remote starting directory.
- `GET /api/fs/list?path=...` drives the Files page tree.
- `GET /api/fs/read-text?path=...` drives text previews.
- `GET /api/fs/read-data-url?path=...` drives image, media, document, and canvas data previews.

## Security expectations

- Do not preview secret-like paths automatically.
- Surface backend errors directly.
- Do not fallback to unauthenticated public origins.
- Do not load oversized binaries into renderer state.

## Composer attachments

Client-local drops must be staged through official Hermes attachment calls and submitted as returned `@file:` refs. Passing a local desktop pathname directly to the remote agent is invalid.
