-- Enable Supabase realtime on the tables the PWA subscribes to in src/lib/store.ts.
-- Without this, postgres_changes events never fire and devices stay desynced
-- between visibility-refetches.

ALTER PUBLICATION supabase_realtime ADD TABLE planner_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE planner_icebox;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_blocks;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
