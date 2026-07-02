# Testing

BITCH uses a layered test pyramid so Hermes Desktop-inspired features land behind repeatable checks instead of optimism wearing a lab coat. Keep the app remote-only in every layer: tests may mock the Tauri bridge and remote dashboard APIs, but they must not start a local Hermes server, expose dashboard secrets to the browser, or rely on public file-server/Dufs fallbacks.

## Behavior-first testing

Behavior-first testing is the default. Start with the smallest executable check that observes user-visible or domain behavior, watch it fail, then make the production change. Prefer pure unit tests for rules, Svelte component DOM tests for rendered controls, and Playwright route tests for navigation/workflow behavior. Raw-source checks are CI-allowlisted architecture tripwires only; they are not a way to avoid rendering the component or exercising the route.

The guard command `npm run test:source-contracts` inventories every test that uses `?raw`, `import.meta.glob(..., query: '?raw')`, `readFileSync`, or `readFile`, compares it to the allowlist below, and fails when a new non-allowlisted source-sniffing test appears. If a raw/file-text test is truly the right tool, add it here with an owner layer, disposition, and rationale in the same PR.

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

## Route-level UI coverage matrix

`src/app/tests/routes/route-interactions.ui.ts` extends the basic route smoke probe with rendered interaction coverage against mocked remote services:

| Route    | Viewports | Representative checks                                                                                                                                                         |
| -------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MAIN     | mobile    | Primary navigation popover opens and changes routes without a live gateway.                                                                                                   |
| AGENT    | mobile    | Session picker dialog opens by keyboard, lists mocked remote sessions, and hydrates a selected session through mocked dashboard history plus gateway resume.                  |
| ASSETS   | desktop   | Authenticated remote filesystem previews cover `/opt/data` text files and `/box/.hermes/cache/canvases` HTML media through `/api/fs/*`; `/tmp` is not used as the proof path. |
| CALENDAR | desktop   | Mocked CalDAV config/events render the month grid, next-month navigation, Today reset, and event detail links.                                                                |
| CRON     | desktop   | Mocked scheduler APIs exercise loading, job, run-failure, and backend-error states.                                                                                           |
| KANBAN   | desktop   | Mocked board data exercises lane collapse/expand and card detail inspection.                                                                                                  |
| SETTINGS | mobile    | Theme selection and the VS Code Marketplace theme picker dialog render under the compact viewport.                                                                            |

Generated Playwright screenshots, traces, videos, and HTML reports must stay under `test-results/**` or `playwright-report/**`; both directories are ignored by git and Knip so local failure artifacts do not leak into review.

## Source-contract allowlist

Raw-source tests (`?raw`, `import.meta.glob(..., query: '?raw')`, or direct file-text checks) are a small CI-checked allowlist, not a substitute for behavior coverage. Keep them only when the reviewed source text is the product contract and a DOM/unit/UI test would be weaker, slower, or misleading. Every source-contract test must name its owner layer and the invariant it protects, and every allowlisted path must also appear in `scripts/check-source-contracts.mjs`.

### Allowed source-contract categories

- Forbidden imports and lane boundaries, for example monitoring must not import Hermes/dashboard internals.
- Remote-only product guarantees, for example no Dufs/public file-server fallbacks, no `VITE_BOX_BASE_URL`, and no browser-held dashboard secrets.
- Explicit bundle, route, and lazy-loading contracts where source structure is the contract.
- Migration canaries for branding, startup splash, native bridge, installer, and packaging surfaces where the source text or generated file list is the reviewed artifact.

### Not allowed as source-contract tests

- Function signatures such as `monthWeekAtIndex(...)`, `agendaRowAtIndex(...)`, or other implementation hooks.
- Algorithm behavior hidden inside `.svelte` files; extract the pure rule into `domain` or `application` modules and test real inputs/outputs.
- Visual/component behavior that can be rendered with Testing Library.
- Route behavior that can be exercised with Playwright.
- Broad "page contains these classes/imports" assertions when the user-visible behavior is what matters.

### Disposition meanings

- `KEEP`: source text is the contract and remains on the allowlist.
- `REPLACE_WITH_UNIT`: extract or target pure domain/application behavior.
- `REPLACE_WITH_COMPONENT`: render the Svelte component with Testing Library or a component DOM harness.
- `REPLACE_WITH_UI`: exercise the route or workflow in Playwright with mocked Tauri/dashboard seams.
- `DELETE`: remove the source check with no replacement because it only duplicates stronger coverage.

### Current source-contract inventory

Updated on 2026-07-02 against `origin/main` at `debc971`, after the component DOM and route UI conversion PRs. `npm run test:source-contracts` currently inventories 21 source-contract/file-text test files: 14 `KEEP` allowlisted tripwires and 7 migration rows that must not grow. The inventory excludes production SVG raw imports in `src/lib/theme/icons.ts` and the `src/app/tests/ui/node-source-shims.d.ts` declaration shim because neither is a test.

| Test file                                                 | Raw/file-text target                            | Disposition              | Owner layer                         | Rationale / migration                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------- | ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/tests/support/architecture-boundaries.test.ts`   | renderer/Rust `import.meta.glob` source scan    | `KEEP`                   | architecture boundary support       | Canonical forbidden-import and lane-boundary tripwire; runtime tests would not catch source-level dependency leaks.                                                                                                                                                                    |
| `src/lib/tests/support/module-contracts.test.ts`          | legacy compatibility path globs                 | `KEEP`                   | module contract support             | Absence of obsolete top-level Hermes compatibility paths and store shims is a source tree contract; runtime export checks can stay as unit assertions.                                                                                                                                 |
| `src/lib/tests/support/rust-bridge-lanes.test.ts`         | Rust command/lane files                         | `KEEP`                   | Rust bridge lanes                   | Native bridge split and cross-lane leakage are source-structure contracts.                                                                                                                                                                                                             |
| `src/lib/tests/monitoring/lane-boundary.test.ts`          | monitoring lane source files                    | `KEEP`                   | monitoring lane                     | Protects the standalone Beszel lane from Hermes/dashboard imports.                                                                                                                                                                                                                     |
| `src/lib/tests/hermes/files/index.test.ts`                | renderer file consumers                         | `KEEP`                   | Hermes files lane                   | Public-entrypoint migration and remote-only file consumer imports are architecture tripwires; adapter behavior in the same file is already unit coverage.                                                                                                                              |
| `src/app/tests/app-shell-code-splitting.test.ts`          | `AppShell`, startup splash, Vite config         | `KEEP`                   | app shell / bundle                  | Dynamic route imports, chunk grouping, and deferred Threlte splash loading are explicit bundle/lazy-loading contracts.                                                                                                                                                                 |
| `src/app/tests/startup-branding.test.ts`                  | `index.html`, splash, main entry, Tauri config  | `KEEP`                   | startup branding / native packaging | Pre-bundle splash markup, desktop naming, and generated icon list are migration/packaging canaries where source text is the reviewed artifact.                                                                                                                                         |
| `src/app/tests/message-stream-lifecycle.test.ts`          | `App.svelte` and `AgentShell.svelte`            | `KEEP`                   | app shell lifecycle                 | The gateway stream must stay subscribed at the root instead of a route component; this is a route-lifecycle source placement contract.                                                                                                                                                 |
| `src/app/tests/navigation/theme-picker.test.ts`           | `AppShell`, `Dialog`, app CSS theme wiring      | `KEEP`                   | theme shell / portal                | Shell and portal theme attributes plus centralized CSS tokens are source-level theme propagation canaries; rendered Settings picker behavior is covered by `src/app/tests/settings/SettingsPage.component.test.ts`.                                                                    |
| `src/app/tests/settings/SettingsPage.test.ts`             | Settings lazy route and removed updater source  | `KEEP`                   | Settings route / migration          | The lazy route/navbar entries are bundle/route source contracts, and the removed source-updater strings are migration canaries. Rendered Settings and Marketplace behavior is component-tested.                                                                                        |
| `src/lib/tests/support/install-script.test.ts`            | package script and migrated config output       | `KEEP`                   | installer / platform                | File reads inspect fixture inputs and generated installer output; this is behavior-oriented installer coverage, not a page-source substitute.                                                                                                                                          |
| `src/lib/tests/support/testing-foundation.test.ts`        | docs, package scripts, config, workflow files   | `KEEP`                   | testing foundation / CI             | Keeps the documented pyramid, harness files, CI commands, and this allowlist policy encoded in CI.                                                                                                                                                                                     |
| `src/app/tests/ui/svg-icons.test.ts`                      | icon token and no-icon-font migration scan      | `KEEP`                   | shared icon migration               | The source scan is now limited to the no-icon-font/shared-Icon migration canary; rendered Icon accessibility is covered by `src/app/tests/components/ui/Icon.component.test.ts`.                                                                                                       |
| `src/app/tests/main/MainPage.test.ts`                     | broad MAIN dashboard source scan                | `REPLACE_WITH_UI`        | MAIN route                          | Replace layout, queues, responsive panels, and monitoring rows with Playwright route smoke/component checks; keep remote-only negative strings in a focused product-guarantee tripwire.                                                                                                |
| `src/app/tests/agent/AgentShell.test.ts`                  | AGENT shell, composer, conversation, sidebars   | `REPLACE_WITH_COMPONENT` | Agent page components               | Render separators, resize handles, mobile session dialog, persisted widths, and responsiveCompact props instead of checking class/function strings; session row labels and state badges are component-tested.                                                                          |
| `src/app/tests/agent/preview/AgentPreviewSidebar.test.ts` | preview shell, Markdown hooks, remote-only scan | `KEEP`                   | Agent preview source shell          | Preview sidebar remote bridge, canvas, text, image, and classifier fallback behavior is component-tested; remaining source checks guard shell placement, Markdown hook wiring, and public-file-server regressions.                                                                     |
| `src/app/tests/assets/AssetsPage.test.ts`                 | Assets page source                              | `REPLACE_WITH_UI`        | Assets route                        | Exercise context menus, navigation history, uploads/downloads, delete confirmation, and previews against dashboard filesystem mocks; keep remote-only negative strings in a focused tripwire.                                                                                          |
| `src/app/tests/calendar/CalendarPage.test.ts`             | Calendar page, calendar facade, adapter source  | `REPLACE_WITH_UNIT`      | Calendar domain/application         | Calendar virtual month/agenda grids, scroll math, and month event mapping now have executable unit coverage in `src/lib/tests/calendar/virtual-calendar.test.ts`; remaining raw checks should move to component/UI tests for the Bits shell, viewport switching, and sync/load policy. |
| `src/app/tests/cron/CronPage.test.ts`                     | Cron route/panel source                         | `REPLACE_WITH_UI`        | Cron route                          | Route, job list, details panel/dialog, run output, and create/edit flows should be exercised with mocked Hermes Cron APIs.                                                                                                                                                             |
| `src/app/tests/kanban-route.test.ts`                      | Kanban route/panel source                       | `REPLACE_WITH_UI`        | Kanban route                        | Lanes, filters, detail pane, profile context, and drag/drop affordances should be route/component behavior tests, not source strings.                                                                                                                                                  |
| `src/lib/tests/hermes/files/domain/preview.test.ts`       | Assets page raw block in a domain test file     | `REPLACE_WITH_COMPONENT` | Hermes files domain + Assets UI     | Keep file presentation classifier tests as unit coverage; move the AssetsPage source contract block to rendered component/route coverage.                                                                                                                                              |

Converted source-contract rows are removed from this inventory once their raw-source tests are deleted. The current component DOM replacements are `src/app/tests/navigation/AppNavbar.component.test.ts`, `src/app/tests/settings/SettingsPage.component.test.ts`, `src/app/tests/components/conversation/MessageAttachments.component.test.ts`, `src/app/tests/components/ui/Icon.component.test.ts`, `src/app/tests/agent/sessions/AgentSessionRow.component.test.ts`, and `src/app/tests/agent/preview/AgentPreviewSidebar.component.test.ts`; the raw navbar assertion in `src/app/tests/router.test.ts` was folded into AppNavbar behavior coverage.

No current file is classified `DELETE` outright; every remaining migration-disposition source check either owns behavior that needs a stronger replacement or contains a smaller invariant that should move into one of the kept tripwires.

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

The GitHub Actions workflow at `.github/workflows/validation.yml` runs the same foundation stack on pull requests and pushes to `main`: install with `npm ci --ignore-scripts`, install Chromium for Playwright route tests, then run formatting, type-check, lint, the source-contract allowlist guard, Vitest, component DOM tests, route UI smoke tests, renderer build, npm audit, Knip, and whitespace checks.

## Routine validation

Use focused commands while developing, then run the full stack before a PR:

```bash
npm run fmt:check
npm run type-check
npm run lint
npm run test:source-contracts
npm test
npm run test:component
npm run test:ui
npm run frontend:build
npm audit --audit-level=moderate
npx --yes knip --reporter json
git diff --check
```

`npm run test:all` is the quick pyramid sweep: unit/source-contract tests, component DOM tests, then route-level UI tests. `npm run validate:full` runs the complete local PR gate, including formatting, type-checking, lint, the source-contract guard, tests, build, npm audit, Knip, and whitespace checks.
