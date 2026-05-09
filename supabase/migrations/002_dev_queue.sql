-- Dev queue: tasks queued from Telegram, processed by Claude Code on laptop
create table dev_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  description text not null,
  project text,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  status text not null default 'pending' check (status in ('pending','in_progress','done','cancelled')),
  result text,
  completed_at timestamptz
);

create index idx_dev_queue_status on dev_queue(status) where status in ('pending','in_progress');
