# Feature: Pre-Release Polish & Obsidian Community Submission Readiness

## Objective
Leave Study Flow Assistant 100% compliant with Obsidian Community Plugin submission guidelines, eliminate vault security risks, fix logic and UI bugs, complete i18n, and prune dead code.

## Authorized Scope
- Packaging files: `LICENSE`, `versions.json`, `manifest.json`, `.gitignore`, `package.json`, `.github/workflows/release.yml`.
- Safe storage & vault lifecycle: `src/main.ts`, `src/utils.ts`, `src/storage-migration.ts`.
- Event listener safety & styles: `src/zen.ts`, `src/ui/calendar-grid.ts`, `src/ui/pomodoro-tab.ts`, `src/analytics-ui.ts`, `src/ui/calendar-day-detail.ts`, `styles.css`.
- Habits logic & UI: `src/ui/habits-tab.ts`, `src/ui/today-tab.ts`, `src/habit-edit-modal.ts`.
- i18n & localizations: `src/habits.ts`, `src/pomodoro-task-check-modal.ts`, `src/settings.ts`, `src/i18n/index.ts`, `src/i18n/en.ts`, `src/i18n/es.ts`.
- Dead code removal & documentation: `src/conventions.ts`, `src/storage-migration.ts`, `src/schedule.ts`, `src/settings-utils.ts`, `README.md`.
- Tests: `tests/migration.test.mjs`, `tests/focus-flow.test.mjs`, `tests/calendar-grid-and-schedule.test.mjs`, `tests/habits-streak.test.mjs`, `tests/i18n.test.mjs`.

## Task List

- [x] **Task 1: Packaging & Obsidian Store Metadata Compliance**
  - Add `LICENSE` (MIT) and `versions.json`.
  - Fix `manifest.json` (`description` < 250 chars without "Obsidian", fix `authorUrl`).
  - Untrack `main.js` and `odd/` from git; update `.gitignore`.
  - Clean local paths in `package.json` `"deploy"` script.
  - Verification: `npm run check-types && npm test`
  - Evidence: a620986

- [x] **Task 2: GitHub Actions Release Workflow**
  - Create `.github/workflows/release.yml` to build and attach `main.js`, `manifest.json`, and `styles.css` on tag push.
  - Verification: YAML validation and lint check.
  - Evidence: Commit ID

- [x] **Task 3: Safe Storage & Vault Startup Lifecycle**
  - Stop unprompted migration/renaming of root `Inbox.md`, `Habits.md`, and `Daily` in `src/utils.ts`.
  - Remove redundant early `loadFocusSessionsFromFile` call before `onLayoutReady` in `src/main.ts`.
  - Avoid raw `vault.adapter` on `StudyFlow/Sessions.jsonl` in `src/storage-migration.ts`.
  - Verification: `tests/migration.test.mjs`, `npm test`, `npm run check-types`.
  - Evidence: Commit ID

- [x] **Task 4: Event Listener Leaks & Static Inline Styles Cleanup**
  - Fix raw `window.addEventListener` in `src/zen.ts` and prevent duplicate indicator DOM nodes.
  - Add `pointercancel` and destroy/view-close cleanup to drag listeners in `src/ui/calendar-grid.ts`.
  - Move static layout styles (`pomodoro-tab`, `analytics-ui`, `calendar-day-detail`) to `styles.css`.
  - Verification: `npm test`, `npm run check-types`.
  - Evidence: Commit ID

- [ ] **Task 5: Habits Streak Recalculation & Specific Days Selector**
  - Fix off-by-one / stale streak notice in `src/ui/habits-tab.ts` and `src/ui/today-tab.ts`.
  - Add day checkboxes (Mon-Sun) for `specific_days` in `src/habit-edit-modal.ts` and `src/ui/habits-tab.ts`.
  - Verification: `tests/habits-streak.test.mjs`, `npm test`.
  - Evidence: Commit ID

- [ ] **Task 6: Complete i18n & Zero Hardcoded Strings**
  - Localize initial `Habits.md` creation based on active language in `src/habits.ts`.
  - Localize distractions count in `src/pomodoro-task-check-modal.ts`.
  - Localize calendar accessibility titles/labels in `src/ui/calendar-day-detail.ts` and `src/ui/calendar-grid.ts`.
  - Fix settings empty fallbacks to use `getDefaultConventions(lang)` in `src/settings.ts`.
  - Replace fragile string check in `src/habits.ts` with `getEffectiveLanguage()`.
  - Verification: `tests/i18n.test.mjs`, `npm test`.
  - Evidence: Commit ID

- [ ] **Task 7: Dead Code Pruning & Documentation Update**
  - Remove dead `.ics`, weekly review, and pomodoro log migration code and orphan translation keys.
  - Update `README.md` in English (with Spanish section/link) with accurate current features.
  - Verification: `npm run check-types && npm test && npm run build`.
  - Evidence: Commit ID
