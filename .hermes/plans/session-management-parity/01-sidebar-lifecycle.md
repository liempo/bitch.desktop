# 01 — Sidebar Lifecycle and Session List Stability

## Objective

Mirror official Hermes Desktop sidebar list behavior: recent sessions stay visible during backend persistence races, pinned sessions do not disappear when off the first page, and compression/renewal lineage collapses to one row.

## Implementation notes

- Keep route/sidebar ids as stored session ids, not runtime ids.
- Preserve already-loaded active, pinned, working, and recently-settled rows when merging page-0 session refreshes.
- Add a short settle grace after a working session transitions idle so a just-finished background new chat survives until `/api/profiles/sessions` returns it.
- Add an optimistic session row when `session.create` returns a stored key, seeded with the first prompt preview when available.
- Remove both direct stored ids and lineage-root pin ids when archive/delete hides a session.

## Acceptance tests

- `mergeSessions` keeps pinned and active rows omitted from incoming page zero.
- `mergeSessions` dedupes by lineage key when an incoming compression tip supersedes an older visible row.
- A working-to-idle transition contributes the session id to the temporary keep set, then expires.
- Creating a session can seed an optimistic row with profile, preview, activity time, and stored id.
