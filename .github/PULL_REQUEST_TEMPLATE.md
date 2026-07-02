## Summary

-

## Testing checklist

- [ ] Behavior-first tests cover new behavior at the right layer: unit/domain, component DOM, or route UI.
- [ ] Raw-source/file-text checks are only allowlisted architecture tripwires; if this PR adds or changes `?raw`, `import.meta.glob(..., query: '?raw')`, `readFileSync`, or `readFile` tests, `docs/testing.md` and `scripts/check-source-contracts.mjs` list the owner and rationale.
- [ ] Full validation run, or the skipped command is explained with evidence:
  - `npm run fmt:check`
  - `npm run type-check`
  - `npm run lint`
  - `npm run test:source-contracts`
  - `npm test`
  - `npm run test:component`
  - `npm run test:ui`
  - `npm run frontend:build`
  - `npm audit --audit-level=moderate`
  - `npx --yes knip --reporter json`
  - `git diff --check`
