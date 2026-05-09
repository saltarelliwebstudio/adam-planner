-- Dynamic Schedule Engine: replace hardcoded DEFAULT_SCHEDULE with DB-driven blocks

-- Recurring weekly blocks (replaces DEFAULT_SCHEDULE const)
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '⬜',
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  locked BOOLEAN NOT NULL DEFAULT false,
  skippable BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_blocks_dow ON schedule_blocks(day_of_week);

-- Per-date overrides (skip, move, ad-hoc blocks like Sobeys shifts)
CREATE TABLE IF NOT EXISTS schedule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  block_id UUID REFERENCES schedule_blocks(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('skip', 'move', 'adhoc')),
  label TEXT,
  emoji TEXT,
  start_time TEXT,
  end_time TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_overrides_date ON schedule_overrides(date);

-- Weekly recaps (pre-computed on Sundays)
CREATE TABLE IF NOT EXISTS weekly_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL UNIQUE,
  time_by_category JSONB NOT NULL DEFAULT '{}',
  tasks_completed INT NOT NULL DEFAULT 0,
  tasks_overdue INT NOT NULL DEFAULT 0,
  streaks JSONB NOT NULL DEFAULT '{}',
  highlights TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed schedule_blocks from the hardcoded DEFAULT_SCHEDULE
INSERT INTO schedule_blocks (label, emoji, day_of_week, start_time, end_time, locked, skippable, sort_order) VALUES
  -- MONDAY (1)
  ('Follow-up leads', '📞', 1, '06:30', '06:50', true, true, 1),
  ('Morning routine', '🙏', 1, '06:50', '08:00', true, true, 2),
  ('School', '🏫', 1, '08:00', '11:00', true, true, 3),
  ('Free — fill from tasks', '⬜', 1, '11:00', '19:00', false, false, 4),
  ('Genius', '🥋', 1, '19:00', '20:30', true, true, 5),
  ('Ariana', '💛', 1, '20:30', '22:30', true, true, 6),
  ('Sleep', '😴', 1, '22:30', '23:59', true, false, 7),

  -- TUESDAY (2)
  ('Morning routine', '🙏', 2, '06:30', '08:00', true, true, 1),
  ('School', '🏫', 2, '08:00', '11:00', true, true, 2),
  ('Free — fill from tasks', '⬜', 2, '11:00', '16:00', false, false, 3),
  ('Mike Minter Workout', '💪', 2, '16:00', '17:00', true, true, 4),
  ('Genius', '🥋', 2, '17:00', '21:00', true, true, 5),
  ('Wind down / light tasks', '🌙', 2, '21:00', '22:30', false, false, 6),
  ('Sleep', '😴', 2, '22:30', '23:59', true, false, 7),

  -- WEDNESDAY (3)
  ('Morning routine', '🙏', 3, '06:30', '08:00', true, true, 1),
  ('School', '🏫', 3, '08:00', '11:00', true, true, 2),
  ('Free — fill from tasks', '⬜', 3, '11:00', '19:00', false, false, 3),
  ('Genius', '🥋', 3, '19:00', '21:00', true, true, 4),
  ('Wind down / light tasks', '🌙', 3, '21:00', '22:30', false, false, 5),
  ('Sleep', '😴', 3, '22:30', '23:59', true, false, 6),

  -- THURSDAY (4)
  ('Follow-up leads', '📞', 4, '06:30', '06:50', true, true, 1),
  ('Morning routine', '🙏', 4, '06:50', '08:00', true, true, 2),
  ('School', '🏫', 4, '08:00', '11:00', true, true, 3),
  ('Free — fill from tasks', '⬜', 4, '11:00', '17:00', false, false, 4),
  ('Genius', '🥋', 4, '17:00', '21:00', true, true, 5),
  ('Wind down / light tasks', '🌙', 4, '21:00', '22:30', false, false, 6),
  ('Sleep', '😴', 4, '22:30', '23:59', true, false, 7),

  -- FRIDAY (5)
  ('Morning routine', '🙏', 5, '06:30', '08:00', true, true, 1),
  ('School', '🏫', 5, '08:00', '11:00', true, true, 2),
  ('Free — fill from tasks', '⬜', 5, '11:00', '19:00', false, false, 3),
  ('Genius', '🥋', 5, '19:00', '20:30', true, true, 4),
  ('Free', '⬜', 5, '20:30', '22:30', false, false, 5),
  ('Sleep', '😴', 5, '22:30', '23:59', true, false, 6),

  -- SATURDAY (6)
  ('Free — fill from tasks', '⬜', 6, '06:30', '11:30', false, false, 1),
  ('Genius', '🥋', 6, '11:30', '13:00', true, true, 2),
  ('Free — fill from tasks', '⬜', 6, '13:00', '22:30', false, false, 3),
  ('Sleep', '😴', 6, '22:30', '23:59', true, false, 4),

  -- SUNDAY (0)
  ('Morning routine', '🙏', 0, '06:30', '08:00', true, true, 1),
  ('Financial log', '💰', 0, '08:00', '09:00', true, true, 2),
  ('Week review', '📋', 0, '09:00', '09:30', true, true, 3),
  ('Build next week schedule', '📆', 0, '09:30', '10:00', true, true, 4),
  ('Free — fill from tasks', '⬜', 0, '10:00', '22:00', false, false, 5),
  ('Weekly reset — brain dump', '🔁', 0, '22:00', '22:30', true, true, 6),
  ('Sleep', '😴', 0, '22:30', '23:59', true, false, 7);

-- Enable RLS (but allow all for single-user app)
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on schedule_blocks" ON schedule_blocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on schedule_overrides" ON schedule_overrides FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on weekly_recaps" ON weekly_recaps FOR ALL USING (true) WITH CHECK (true);
