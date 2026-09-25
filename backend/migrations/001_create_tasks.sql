CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  reschedule_count INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT tasks_title_not_empty
    CHECK (length(trim(title)) > 0),

  CONSTRAINT tasks_priority_valid
    CHECK (priority IN ('low', 'medium', 'high')),

  CONSTRAINT tasks_status_valid
    CHECK (status IN ('pending', 'completed', 'cancelled')),

  CONSTRAINT tasks_reschedule_count_non_negative
    CHECK (reschedule_count >= 0)
);
