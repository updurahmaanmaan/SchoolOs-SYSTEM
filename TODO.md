# TODO — App language switching (translated UI + localStorage)

- [x] Add `t(key)` translation helper + dictionaries (en/ar/so) in `SchoolsOs.js`.
- [ ] Replace hardcoded UI strings across dashboard renderers with `t(key)` (many strings are still hardcoded in modals/tables).
- [x] Language switching already persists to `localStorage` (`schoolos_lang`) and triggers full `render()`.
- [ ] Manual test checklist: dashboard, students list, attendance, grades, timetable grid/settings, classes + modals.

