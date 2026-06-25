# UI componentization audit

Date: 2026-06-25

## Scope and evidence

This audit scanned the Svelte renderer and adjacent TypeScript UI helpers for repeated structures, ad hoc controls, and candidates for Bits UI-backed wrappers.

Evidence gathered:

- `search_files` inventory before implementation: 46 Svelte sources under `src/App.svelte` and `src/app/**/*.svelte`, plus 111 TypeScript sources under `src/**/*.ts`.
- Post-extraction renderer manifest: 47 Svelte sources, including the new `src/app/main/components/MainDashboardStatGrid.svelte`.
- `uvx pygount --format=summary --folders-to-skip='.git,node_modules,venv,.venv,__pycache__,.cache,dist,build,.next,.tox,vendor,third_party,src-tauri/target,.cargo,.rustup' src docs` reported 111 TypeScript files and 46 pre-existing Svelte files as `__unknown__` before the extraction.
- `package-lock.json` pins `bits-ui` 2.18.1; local `node_modules` was not present before validation install.
- Bits UI documentation checked: Select, Popover, Dialog, and Context Menu. The current app already wraps Bits Dialog in `src/app/components/ui/Dialog.svelte` and uses Bits Popover/ContextMenu where behavior needs floating or contextual menus.

The scan covered these renderer sources:

- `src/App.svelte`
- `src/app/AppShell.svelte`
- `src/app/agent/AgentShell.svelte`
- `src/app/agent/preview/AgentPreviewSidebar.svelte`
- `src/app/agent/sessions/AgentSessionSidebar.svelte`
- `src/app/agent/sessions/components/AgentArchivedSessionsDialog.svelte`
- `src/app/agent/sessions/components/AgentProfileFilterDialog.svelte`
- `src/app/agent/sessions/components/AgentSessionActionsMenu.svelte`
- `src/app/agent/sessions/components/AgentSessionList.svelte`
- `src/app/agent/sessions/components/AgentSessionRow.svelte`
- `src/app/assets/AssetsPage.svelte`
- `src/app/calendar/CalendarPage.svelte`
- `src/app/components/Glyph.svelte`
- `src/app/components/GlyphCanvas.svelte`
- `src/app/components/StartupSplash.svelte`
- `src/app/components/composer/Composer.svelte`
- `src/app/components/composer/ModelPicker.svelte`
- `src/app/components/conversation/Conversation.svelte`
- `src/app/components/conversation/Markdown.svelte`
- `src/app/components/conversation/Message.svelte`
- `src/app/components/conversation/MessageAttachments.svelte`
- `src/app/components/conversation/Reasoning.svelte`
- `src/app/components/conversation/System.svelte`
- `src/app/components/conversation/Tool.svelte`
- `src/app/components/prompts/Approval.svelte`
- `src/app/components/prompts/ClarifyCard.svelte`
- `src/app/components/prompts/CredentialModal.svelte`
- `src/app/components/prompts/SecretModal.svelte`
- `src/app/components/prompts/SudoModal.svelte`
- `src/app/components/ui/Button.svelte`
- `src/app/components/ui/Dialog.svelte`
- `src/app/components/ui/Loader.svelte`
- `src/app/components/ui/Panel.svelte`
- `src/app/components/ui/SectionTitle.svelte`
- `src/app/components/ui/TerminalBlock.svelte`
- `src/app/components/ui/TextArea.svelte`
- `src/app/components/ui/TextInput.svelte`
- `src/app/cron/CronPage.svelte`
- `src/app/kanban/KanbanPage.svelte`
- `src/app/main/MainPage.svelte`
- `src/app/main/panels/MainAgentPanel.svelte`
- `src/app/main/panels/MainContainersPanel.svelte`
- `src/app/main/panels/MainCronPanel.svelte`
- `src/app/main/panels/MainGlyphPanel.svelte`
- `src/app/main/panels/MainKanbanPanel.svelte`
- `src/app/navigation/AppNavbar.svelte`

## Current shared UI baseline

The app already has a small shared UI layer under `src/app/components/ui/`:

- `Button.svelte` covers anchor/button chrome, sizes, and tone variants. Bits UI does not provide a generic button primitive, so this remains a custom primitive.
- `Panel.svelte` covers the bracket-title panel shell used across main, agent, assets, cron, kanban, and calendar surfaces.
- `Dialog.svelte` is a Bits UI wrapper and is the correct base for modal work.
- `TextInput.svelte` and `TextArea.svelte` wrap shared input classes; several native inputs/selects still remain outside these wrappers.
- `styles.ts` centralizes surface, card, menu, input, textarea, section-title, and tag class strings.

## Findings and priority

| Priority       | Pattern                         | Evidence                                                                                                                                                                                   | Bits UI fit                                                                                                                     | Recommendation                                                                                                                                                            | Risk                                                                                |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P0 implemented | Main dashboard stat mini-panels | `MainCronPanel.svelte` and `MainKanbanPanel.svelte` duplicated the same 2x/4x stat grid and flat `Panel` card markup.                                                                      | No Bits primitive; this is presentational.                                                                                      | Extract a page-local `MainDashboardStatGrid` and keep the existing `Panel` styling/token contract.                                                                        | Low                                                                                 |
| P1             | Native select/filter controls   | Native `<select>` appears in `AppNavbar.svelte`, `CronPage.svelte`, and `KanbanPage.svelte`; similar label/select classes are repeated around profile, board, tenant, and theme selection. | Strong fit: Bits UI Select supports keyboard navigation, typeahead, portal positioning, grouped options, and reusable wrappers. | Create a shared `Select` wrapper under `src/app/components/ui/` using Bits `Select.Root`, then migrate theme/profile/board/tenant selectors in a focused PR.              | Medium; selection handlers and tests need careful source-contract updates.          |
| P1             | Status/tag/pill chips           | Status/pill class strings recur in Cron, Kanban, Main Cron, Main Kanban, prompt cards, and model picker (`rounded-control border ... text-[0.58rem/0.62rem]`).                             | No direct Bits primitive; these are static display tokens.                                                                      | Promote `tagClass` into a `Pill.svelte`/`StatusPill.svelte` with `tone` and `compact` props.                                                                              | Low to medium; avoid changing semantic text or route-specific status color mapping. |
| P2             | Empty/loading/error notices     | Dashed empty states, danger/warning alerts, syncing blocks, and muted notices repeat in Agent sessions, Assets, Conversation media, Cron, Kanban, and Main panels.                         | No direct Bits primitive; Bits Alert/Dialog would be overbuilt for inline notices.                                              | Add a shared `Notice.svelte` or `EmptyState.svelte` that accepts `tone`, `compact`, and optional `role`.                                                                  | Low; must preserve `role="alert"` where present.                                    |
| P2             | Filter/form field labels        | `grid/flex gap-1 text-[0.65rem] uppercase tracking-[0.16em] text-ink-muted` repeats across Cron and Kanban forms.                                                                          | Pair with Bits Select for selects; simple fields can remain custom.                                                             | Add `Field.svelte` after the Select wrapper exists so label/control/help text are consistent.                                                                             | Medium; form markup should remain accessible and not hide native labels.            |
| P2             | Session picker option rows      | `AgentShell.svelte` and `MainAgentPanel.svelte` both render compact selectable session rows with title, metadata, selected state, and mobile/dialog variants.                              | No direct Bits primitive unless converted to a listbox/combobox later.                                                          | Extract a page-owned `AgentSessionOptionList` only after confirming desktop/mobile behavior should remain identical.                                                      | Medium; session routing and compact composer state are sensitive.                   |
| P3             | Action menus/popovers           | `AgentSessionActionsMenu.svelte`, `Composer.svelte`, and `MainKanbanPanel.svelte` use Bits ContextMenu/Popover with shared `menuItemClass`/`popoverClass`, but not a common menu wrapper.  | Strong fit already in use.                                                                                                      | Defer a generic `ActionMenu` wrapper until there are at least three equivalent click-open menus. Context menus should stay explicit because right-click semantics differ. | Low if deferred; medium if abstracted too early.                                    |
| P3             | Media preview frames            | `AgentPreviewSidebar.svelte`, `Markdown.svelte`, `MessageAttachments.svelte`, and `AssetsPage.svelte` repeat image/PDF/audio/video/text preview frames and empty states.                   | No direct Bits primitive; overlay behavior already has separate contracts.                                                      | Consider a remote-media frame wrapper only after the remote-file preview behavior stabilizes further.                                                                     | Medium to high; file/media regressions are user-visible.                            |

## Implemented extraction

`src/app/main/components/MainDashboardStatGrid.svelte` now owns the repeated Main dashboard stat-grid card markup. `MainCronPanel.svelte` and `MainKanbanPanel.svelte` pass their existing stat arrays and count formatter into the shared component. The extraction intentionally stays page-local because the exact dense dashboard card treatment is not yet a general app primitive.

Source-contract coverage in `src/app/tests/main/MainPage.test.ts` now asserts that both panels use `MainDashboardStatGrid`, that the shared component owns the flat `Panel` stat-card markup, and that the old duplicated `raisedPanelClass` path does not return.

## Deferred follow-up plan

1. Add a Bits UI-backed `Select` wrapper and migrate the five native selects in AppNavbar, Cron, and Kanban.
2. Add `Pill.svelte`/`StatusPill.svelte` for static status chips after mapping the current tone variants.
3. Add `Notice.svelte`/`EmptyState.svelte` for inline empty/loading/error panels while preserving existing alert roles.
4. Revisit session picker row extraction after the mobile Agent and Main Agent contracts are stable.
5. Revisit media preview frame extraction only with remote-file regression tests in place.

## Non-goals

This audit did not redesign navigation, alter route behavior, replace native buttons with Bits UI, or change file/media rendering contracts. Interactive Bits UI migrations are intentionally deferred to focused PRs so each behavior change can receive targeted regression coverage.
