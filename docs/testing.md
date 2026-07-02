# Testing

BITCH uses a layered test pyramid so Hermes Desktop-inspired features land behind repeatable checks instead of optimism wearing a lab coat. Keep the app remote-only in every layer: tests may mock the Tauri bridge and remote dashboard APIs, but they must not start a local Hermes server, expose dashboard secrets to the browser, or rely on public file-server/Dufs fallbacks.

## Test pyramid

### Pure unit and source-contract tests

- Location: `src/lib/tests/**` for library/domain/application behavior and `src/app/tests/**` for app source contracts.
- Command: `npm run test:unit`.
- Purpose: pure domain rules, ViewModel/application orchestration, architecture-boundary contracts, route parsing, remote-only invariants, and source-contract checks that are cheaper and more stable than a DOM harness.
- Mocks: use explicit ports and `vi.mock` for `$lib/platform/tauri`, Hermes dashboard calls, and gateway request ports. Domain tests must not import browser, Tauri, or live network APIs.

### Svelte component DOM tests

- Location: `src/**/*.component.test.ts` plus colocated test-only fixtures.
- Command: `npm run test:component`; `npm test` also runs component tests through the default Vitest config.
- Harness: `@testing-library/svelte`, `@testing-library/user-event`, `@testing-library/jest-dom/vitest`, and `jsdom`, with shared setup in `src/lib/tests/support/component-dom-setup.ts`.
- Purpose: rendered behavior for shared components, BITS UI wrappers, keyboard/focus behavior, accessible roles/labels, responsive-visible controls, and theme-token class contracts where rendered DOM is more useful than raw source strings.

### Route-level UI tests

- Location: `src/app/tests/**/*.ui.ts`.
- Command: `npm run test:ui`.
- Harness: Playwright starts the Vite renderer with `npm run frontend:dev`, installs a mocked Tauri/dashboard environment before app code runs, and exercises real browser routes without a live Hermes gateway or live Beszel hub.
- Purpose: smoke MAIN, AGENT, ASSETS, CRON, KANBAN, SETTINGS, and CALENDAR routes; cover mobile and desktop breakpoints; prove route-level rendering, not just raw source strings.

## Remote-only mocks

Test doubles live under `src/app/tests/fixtures/` or `src/lib/tests/support/` depending on who owns them. They should model these seams directly:

- Tauri commands: mock `window.__TAURI_INTERNALS__.invoke` and event listener callbacks, not renderer-side auth headers.
- Hermes dashboard REST: answer `/api/*` paths through `dashboard_request` shapes. Keep dashboard session tokens behind the mocked Tauri bridge.
- WebSocket events: mock `connect_ws`, `send_ws_message`, `close_ws`, and `plugin:event|listen`; do not open a real gateway socket in UI tests.
- Beszel monitoring: mock the monitoring lane through `monitoring_request` and PocketBase-shaped `systems`/`system_stats` records, not legacy Glances endpoints.
- remote filesystem/media: use official Hermes filesystem routes such as `/api/fs/list`, `/api/fs/read-text`, and `/api/fs/read-data-url`. Fixtures that prove preview behavior must include `/opt/data` and `/box` paths; `/tmp` alone is not valid proof.
- notifications: mock the Tauri notification plugin commands and click/event listener surfaces.

Never add Dufs, `VITE_BOX_BASE_URL`, browser-held dashboard secrets, local Hermes bootstrap, or public file-server derivation to satisfy a test. If a test needs a remote file, provide it through the authenticated dashboard filesystem mock.

## Fixture ownership

- Shared app/UI fixtures: `src/app/tests/fixtures/`.
- Library support and source-contract helpers: `src/lib/tests/support/`.
- Component-only Svelte fixtures: next to the component test under `src/app/tests/**` or `src/lib/tests/**`.
- Generated screenshots, traces, and Playwright artifacts: `test-results/**` or `playwright-report/**`; these paths are ignored by Knip and should not be committed.

## CI validation

The GitHub Actions workflow at `.github/workflows/validation.yml` runs the same foundation stack on pull requests and pushes to `main`: install with `npm ci`, install Chromium for Playwright route tests, then run formatting, type-check, lint, Vitest, route UI smoke tests, renderer build, npm audit, Knip, and whitespace checks.

## Routine validation

Use focused commands while developing, then run the full stack before a PR:

```bash
npm run fmt:check
npm run type-check
npm run lint
npm test
npm run test:ui
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
git diff --check
```

`npm run test:all` is the quick pyramid sweep: unit/source-contract tests, component DOM tests, then route-level UI tests.
