-- Run logging table for tracking actuals vs plan
-- Plan is in TypeScript (running-plan.ts); this table records what actually happened

CREATE TABLE IF NOT EXISTS run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  session_type TEXT NOT NULL,
  planned_distance NUMERIC(5,2),
  actual_distance NUMERIC(5,2),
  planned_pace TEXT,
  actual_pace TEXT,
  perceived_effort INT CHECK (perceived_effort BETWEEN 1 AND 10),
  completed BOOLEAN NOT NULL DEFAULT false,
  phase TEXT,
  event TEXT,  -- 'pc100' or 'marathon'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_run_log_date ON run_log(date);
CREATE INDEX idx_run_log_event ON run_log(event);

ALTER TABLE run_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on run_log" ON run_log FOR ALL USING (true) WITH CHECK (true);
