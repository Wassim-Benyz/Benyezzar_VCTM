CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  type TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT task_events_type_valid
    CHECK (type IN (
      'task_created',
      'task_completed',
      'task_reopened',
      'task_edited',
      'task_rescheduled',
      'task_cancelled',
      'task_deleted'
    )),

  CONSTRAINT task_events_source_valid
    CHECK (source IN ('voice', 'visual', 'system')),

  CONSTRAINT task_events_schema_version_positive
    CHECK (schema_version > 0)
);
