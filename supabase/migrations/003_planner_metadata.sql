-- Internal metadata table for reminder logs, bot context, etc.
-- Stops polluting planner_icebox with REM| and CTX| entries.
CREATE TABLE IF NOT EXISTS planner_metadata (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_planner_metadata_key ON planner_metadata (key);

-- Migrate existing REM| and CTX| entries out of icebox
INSERT INTO planner_metadata (key, created_at)
SELECT text, created_at FROM planner_icebox
WHERE text LIKE 'REM|%' OR text LIKE 'CTX|%';

DELETE FROM planner_icebox
WHERE text LIKE 'REM|%' OR text LIKE 'CTX|%';
