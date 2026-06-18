# 04 — Validation, PR, and Kanban Rollout

## Objective

Land the session-management parity change in one focused branch with test evidence, Kanban traceability, and a reviewable PR.

## Steps

1. Run focused session/composer/resume tests after each implementation slice.
2. Run the full validation stack before commit.
3. Commit with a scoped conventional commit accepted by this repo's commitlint, for example `feat(session): align session management with Hermes Desktop`.
4. Push `feat/session-management-parity` and open a PR to `main`.
5. Comment the PR URL and verification output back onto the Kanban cards.
6. Mark implementation cards complete only after their proof standard is satisfied.

## Required verification commands

```bash
npm test -- src/lib/stores/session.svelte.test.ts src/lib/session/resume.test.ts src/lib/stores/composer.svelte.test.ts
npm run fmt:check
npm run type-check
npm run lint
npm test
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
```

## Rollback note

The change should be revertible as one feature commit if validation or manual QA finds route/resume regressions. No backend API contract changes are expected.
