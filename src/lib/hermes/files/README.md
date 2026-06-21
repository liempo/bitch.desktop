# Hermes files subfeature

This subfeature is the public renderer contract for authenticated Hermes dashboard filesystem and media helpers. It currently re-exports `$lib/files` for compatibility.

## Ownership

- `@file:` and `MEDIA:` path parsing and presentation.
- Remote file listing, text reads, and media data URLs through Hermes dashboard filesystem routes.
- Preview classification for authenticated remote files.

Do not add public file-server URL derivation, local filesystem shortcuts, or Dufs/BOX origins here. The product path is authenticated Hermes remote-file access through the Tauri bridge.
