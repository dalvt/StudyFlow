# Feature: Community Submission Readiness & Quality Polish

## Objective
Fix all Obsidian Community Plugin review blockers, eliminate runtime race conditions and data corruption edge cases, complete internationalization, improve UI reactivity, and clean build/packaging configuration.

## Problem & Context
The plugin is preparing for submission to the official Obsidian Community Plugins directory. A deep audit surfaced review guideline violations (vault lifecycle before `onLayoutReady`, command IDs with plugin prefix, sentence case in English), logic bugs (Pomodoro task completion misrouting with wikilinks, calendar blocks dropping subject/color on save, habit ID collision on emojis, interrupted sessions polluting study metrics), and packaging inconsistencies.

## Scope & Constraints
- Branch: `feature/community-submission-readiness`
- Conventional commits only (no AI attribution or Co-Authored-By).
- Keep all unit tests passing (`npm test`).
- Keep TypeScript checking clean (`npm run check-types`).
- Ensure `npm run build` succeeds cleanly.
- Maintain existing comments and docstrings.

## Task List

- [x] **Task 1: Vault lifecycle (`onLayoutReady`), command IDs, and path normalization**
  - Route: Delegated / Writer trigger (touches `src/main.ts`, `src/storage-migration.ts`, `src/utils.ts`, `src/calendar.ts`, `src/schedule.ts`, `src/ui/calendar-day-detail.ts`, `src/ui/view.ts`).
  - Move `setObsidianLanguageResolver(getLanguage)` before `loadSettings()` in `src/main.ts`.
  - Move `migratePluginFilesToDedicatedFolder` and `runStartupMigration` inside `app.workspace.onLayoutReady` in `src/main.ts`.
  - Remove redundant `vault.adapter` fallback in `loadFocusSessionsFromFile` in `src/storage-migration.ts`.
  - Rename command IDs in `src/main.ts` (`open-hub`, `open-calendar`, `open-hub-sidebar`).
  - Normalize paths using `normalizePath()` in `getDailyNotePath` and all user-configured file/folder lookups.
  - Acceptance Criteria: Vault file operations happen after `onLayoutReady`; command IDs omit plugin ID prefix; trailing slashes in settings don't break lookups.
  - Verification: `npm run check-types && node --test tests/migration.test.mjs tests/settings-and-calendar.test.mjs`
  - Evidence: Verified clean type check (`tsc --noEmit`), 15/15 target tests passed, and full test suite passed (227/227 tests passing).

- [x] **Task 2: Sentence case in English and eliminate hardcoded Spanish strings**
  - Route: Delegated / Writer trigger (`src/i18n/en.ts`, `src/i18n/es.ts`, `src/analytics.ts`, `src/markdown-utils.ts`, `src/tasks.ts`, `src/calendar.ts`).
  - Fix English settings, headings, and buttons to use sentence case (per Obsidian UI review bot).
  - Localize day abbreviations in `computeWeeklyFocusTrend` in `src/analytics.ts`.
  - Localize closing Pomodoro notes in `src/markdown-utils.ts`.
  - Localize task mutation error notices in `src/tasks.ts`.
  - Support both `# Hábitos` and `# Habit Tracker` in `syncHabitsToMarkdown` in `src/markdown-utils.ts`.
  - Acceptance Criteria: All English strings pass sentence case requirements; no Spanish fragments leak into English mode.
  - Verification: `npm run check-types && node --test tests/i18n.test.mjs tests/utils.test.mjs`
  - Evidence: Verified clean type check (`tsc --noEmit`), 12/12 i18n tests passed, 232/232 full test suite passed without regressions.

- [x] **Task 3: Pomodoro task completion, calendar block persistence, and habit ID collisions**
  - Route: Delegated / Writer trigger (`src/pomodoro.ts`, `src/pomodoro-state.ts`, `src/markdown-utils.ts`, `src/habits.ts`).
  - In `completeActiveTask()` (`src/pomodoro.ts`), replace `.includes('[')` with time block regex matching and allow fallback to `locator.text` for indented tasks.
  - In `syncBlocksToMarkdown` (`src/markdown-utils.ts`), preserve `[subject:: ...]` and `[color:: ...]` metadata when writing time blocks back to markdown.
  - In `createHabitId` (`src/markdown-utils.ts`), generate a deterministic suffix when slug is empty (e.g. emoji-only habits) to prevent ID collisions.
  - Ensure habit updates run atomically inside `vault.process`.
  - Acceptance Criteria: Tasks with wikilinks or indentation complete cleanly from Pomodoro; time blocks preserve subject and color; emoji-only habits don't overwrite each other.
  - Verification: `npm run check-types && node --test tests/focus-flow.test.mjs tests/calendar-blocks.test.mjs tests/habits-streak.test.mjs`
  - Evidence: Verified clean type check (`tsc --noEmit`), 47/47 target tests passed, and full test suite passed (238/238 tests passing).

- [ ] **Task 4: Metrics accuracy, week start day, settings reactivity, and scoped CSS**
  - Route: Delegated / Writer trigger (`src/analytics.ts`, `src/subject-analytics.ts`, `src/habits.ts`, `src/settings.ts`, `src/ui/calendar-grid.ts`, `styles.css`).
  - Filter `!s.interrupted` in all focus time and completed session analytics.
  - Honor `settings.weekStartDay` in weekly subject and habit analytics.
  - Refresh open `StudyFlowView` instances when settings change.
  - Scope `.is-hidden` and `.sr-only` under plugin container/modal classes in `styles.css`.
  - Clean up drag listeners and preview DOM in `CalendarGridComponent.destroy()`.
  - Acceptance Criteria: Interrupted sessions do not count towards completed focus metrics; Sunday/Monday week starts are respected; settings reflect immediately; styles do not leak.
  - Verification: `npm run check-types && npm test`
  - Evidence: Pending

- [ ] **Task 5: Packaging, CI release workflow, gitignore, and documentation**
  - Route: Direct inline (`.gitignore`, `package.json`, `package-lock.json`, `.github/workflows/release.yml`, `README.md`).
  - Add `odd/` to `.gitignore` and untrack from git.
  - Add `"type": "module"` to `package.json` and sync `package-lock.json`.
  - Update release workflow to validate tag against `manifest.json`.
  - Update `README.md` command table with all 12 registered commands.
  - Acceptance Criteria: `npm test` runs with zero ESM warnings; `npm ci` succeeds; release action tags are validated; README matches reality.
  - Verification: `npm ci && npm run check-types && npm test && npm run build`
  - Evidence: Pending
