DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tasks) THEN
    RAISE EXCEPTION 'Cannot add NOT NULL task ownership while tasks contains existing rows.';
  END IF;

  IF EXISTS (SELECT 1 FROM task_events) THEN
    RAISE EXCEPTION 'Cannot add task ownership while task_events contains existing rows.';
  END IF;
END
$$;

ALTER TABLE tasks
  ADD COLUMN user_id UUID NOT NULL REFERENCES users(id);

CREATE INDEX tasks_user_id_created_at_active_idx
  ON tasks (user_id, created_at DESC)
  WHERE deleted_at IS NULL;
