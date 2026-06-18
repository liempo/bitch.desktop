# Plan 04 — Integration, Docs, and Rollout

> **For Hermes:** Run after Plans 01–03. This plan is about making the feature coherent, documented, and safe to ship.

**Goal:** Tie frontend directive behavior and the Hermes plugin into one coherent feature with docs, tests, and rollout notes.

**Architecture:** The plugin emits canonical directives; bitch.desktop renders them. Docs describe the directives as the contract, not dufs internals.

**Primary files:**

- Modify: `README.md` if user-facing syntax belongs there.
- Modify: `AGENTS.md` if repo contributor guidance should mention directive behavior.
- Modify: `docs/wiki/roadmap.md` and `docs/plans/roadmap.md` only if roadmap scope changes.
- Modify/add tests across frontend/plugin areas from previous plans.

---

## Task 1: Add syntax documentation

Document the contract:

```text
Raw /box paths stay plain text.
@file:/box/path opens the right preview sidebar.
@local:/absolute/path is an explicit local/gateway path reference.
MEDIA:/box/path renders media inside the thread.
@image:/box/path remains supported as a legacy alias; prefer MEDIA:.
```

Avoid calling the syntax `dufs`. Dufs is implementation plumbing.

## Task 2: Add migration note

If existing behavior auto-linked raw `/box` paths, document the change:

```text
Before: standalone /box paths could become preview links.
After: use @file:/box/... explicitly. This prevents accidental linkification and keeps markdown predictable.
```

## Task 3: Add examples to plugin/tool descriptions

Ensure tool descriptions make agent behavior obvious:

- Use `bitch_file_ref` when the user should open/preview a file.
- Use `bitch_media_ref` when the user should see inline media in the thread.
- Do not emit raw `/box` paths when the file should be interactive.

## Task 4: Full frontend validation

Run:

```bash
npm run fmt:check
npm run type-check
npm run lint
npm test
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
```

Expected:

- Prettier clean.
- Svelte check 0 errors/0 warnings.
- Full Vitest suite green.
- Build succeeds.
- Audit 0 moderate+ vulnerabilities.
- Knip `{"issues":[]}`.

## Task 5: Manual smoke matrix

Use representative message text in the app/test harness:

```text
/box/raw.png
@file:/box/report.pdf
@file:`/box/report 1.pdf`
@local:/opt/data/render.png
MEDIA:/box/render.png
MEDIA:/box/audio.mp3
MEDIA:/box/video.mp4
@image:/box/legacy.png
```

Verify:

- raw path stays plain.
- `@file:` is simple link and opens preview sidebar.
- `MEDIA:` renders in thread.
- `@image:` still works.
- missing file degrades without crashing.

## Task 6: Release/PR hygiene

Recommended stacked PRs:

1. Explicit file refs and no raw path auto-linking.
2. Upstream media parity.
3. Hermes plugin.
4. Docs/QA polish.

Each PR must include:

- summary
- test plan with real command output
- screenshots or small GIF if UI behavior changed materially
- no credentials or dufs tokens in output

Completion proof:

- PRs opened and linked to Kanban cards.
- Kanban card comments include PR URLs and validation output.
- Final card marks all acceptance criteria satisfied.
