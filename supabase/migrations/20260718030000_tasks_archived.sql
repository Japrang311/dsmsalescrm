-- Migration: tasks archived flag
--
-- Plain-language summary: adds an "archived" toggle to tasks, separate from
-- `status`. Archiving hides a task from the main inbox views without
-- deleting it or conflating it with the Done status (a task can be archived
-- whether or not it was ever completed). No new RLS policy needed — the
-- existing tasks_update policy (sales own-only, manager all) already covers
-- writes to this column the same way it covers every other field.

alter table public.tasks add column archived boolean not null default false;
