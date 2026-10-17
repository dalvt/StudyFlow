# Feature: Edit Habit Frequency

## Objective
Allow users to edit the frequency (daily, weekly target, specific weekdays) and name of existing habits after creation from the Habits tab interface.

## Problem & Why
Currently, habits can only have their frequency defined at initial creation time. If a user wants to change a daily habit to 3 times a week, or adjust their weekly goal, there is no UI or backend update method to modify an existing habit's frequency, forcing users to delete and recreate the habit (losing their history/streak) or manually edit raw markdown.

## Scope
- Fix `syncHabitsToMarkdown` in `src/markdown-utils.ts` so lines containing frequency/rest metadata are properly matched and preserved during markdown synchronization.
- Implement `updateHabitInFile` in `src/habits.ts` to update habit frequency (and name) and recalculate streak based on the updated frequency.
- Create `HabitEditModal` in `src/habit-edit-modal.ts` providing an accessible modal to edit name and frequency (`daily`, `weekly` with numeric target 1-7, and `specific_days`).
- Add i18n keys for habit editing in Spanish and English (`src/i18n/es.ts`, `src/i18n/en.ts`).
- Update `src/ui/habits-tab.ts` to make the frequency badge clickable and add an edit pencil button to each habit card.
- Add unit tests verifying `syncHabitsToMarkdown` and habit frequency updates.

## Constraints
- Preserve existing habits format and HTML comments metadata (`<!-- streak: ... | freq: ... -->`).
- Conventional commits only; no AI attribution or co-authored-by.
- Keep UI consistent with existing StudyFlow modals and design tokens.
- All 213+ tests must pass with `npm test`.

## Tasks
- [x] TASK-1: Fix habit regex in `syncHabitsToMarkdown` in `src/markdown-utils.ts` and add unit test in `tests/habits-streak.test.mjs`.
  - Route: delegated direct (Writer trigger)
  - Checks: `npm test` (214/214 passed)
- [ ] TASK-2: Add `updateHabitInFile` in `src/habits.ts` with streak recalculation and unit tests.
  - Route: delegated direct (Writer trigger)
  - Checks: `npm test`
- [ ] TASK-3: Add i18n keys and create `HabitEditModal` in `src/habit-edit-modal.ts`.
  - Route: delegated direct (Writer trigger)
  - Checks: `npm run check-types`
- [ ] TASK-4: Wire `HabitEditModal` to habit cards and frequency badges in `src/ui/habits-tab.ts` and update styles in `styles.css`.
  - Route: delegated direct (Writer trigger)
  - Checks: `npm test && npm run build`

## Engram Mirror Status
- Mirror: Pending (Engram MCP server not configured in active session)
