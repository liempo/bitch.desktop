# Plan 01 — Explicit File References and Preview Links

> **For Hermes:** Implement this plan with TDD. Keep changes scoped to explicit file-reference parsing and preview-sidebar behavior. Do not implement full media parity here.

**Goal:** Add `@file:` / `@local:` explicit file references and stop raw `/box/...` paths from becoming links.

**Architecture:** Convert explicit file directives into internal preview links that the existing thread click handler can route to the right preview sidebar. Raw markdown stays untouched.

**Primary files:**

- Modify: `src/lib/media.ts`
- Modify: `src/lib/preview.ts`
- Modify: `src/app/agent/thread/Markdown.svelte`
- Modify/add tests: `src/lib/media.test.ts`, `src/lib/preview.test.ts`, thread source-contract tests if no render-level test exists.

---

## Task 1: Add failing parser tests

**Objective:** Lock the explicit-only contract before changing implementation.

Add tests equivalent to:

```ts
expect(renderPreviewMediaReferences('/box/report.pdf')).toBe('/box/report.pdf')
expect(renderPreviewMediaReferences('See @file:/box/report.pdf')).toContain('#preview')
expect(renderPreviewMediaReferences('See @local:/opt/data/report.pdf')).toContain('#preview')
expect(renderPreviewMediaReferences('MEDIA:/box/render.png')).not.toContain('#preview')
```

Run:

```bash
npm test -- src/lib/media.test.ts src/lib/preview.test.ts
```

Expected: FAIL before implementation.

## Task 2: Remove raw `/box` auto-linking

**Objective:** Make raw `/box/...` paths plain text.

Implementation notes:

- Remove or disable `BOX_PATH_LINE_RE` standalone `/box` conversion in `src/lib/media.ts`.
- Keep dufs URL generation helpers; only stop implicit markdown rewriting.
- Ensure existing markdown links still work if the user writes regular markdown manually.

Expected test:

```ts
expect(renderPreviewMediaReferences('Output:\n/box/render.png')).toBe('Output:\n/box/render.png')
```

## Task 3: Add `@file:` and `@local:` rewriting

**Objective:** Convert explicit file directives into preview-sidebar links.

Suggested helper:

```ts
const FILE_REF_RE = /@(?:file|local):(`[^`\n]+`|"[^"\n]+"|'[^'\n]+'|\S+)/g
```

Behavior:

- Strip surrounding quotes/backticks.
- Trim trailing punctuation for unquoted refs.
- Label with filename only.
- Rewrite to internal preview markdown: `[filename](#preview:<encoded path>)` or whatever the existing preview helper expects.

Examples:

```text
@file:/box/reports/a.pdf      → [a.pdf](#preview:%2Fbox%2Freports%2Fa.pdf)
@local:`/opt/data/a b.png`    → [a b.png](#preview:%2Fopt%2Fdata%2Fa%20b.png)
```

## Task 4: Route click to preview sidebar

**Objective:** Ensure internal preview links open the right preview sidebar.

Implementation notes:

- Reuse existing `previewFromBoxPath` / right preview plumbing where possible.
- If preview helper currently rejects non-`/box` paths, add a separate preview constructor for local refs with an error/fallback URL when not fetchable.
- Keep visual rendering a simple link, not a large card.

## Task 5: Verify

Run:

```bash
npm test -- src/lib/media.test.ts src/lib/preview.test.ts src/app/agent/AgentShell.test.ts
npm run fmt:check
npm run type-check
npm run lint
```

Completion proof:

- Failing tests now pass.
- Raw `/box` paths remain unmodified.
- `@file:` links trigger preview-sidebar behavior.
