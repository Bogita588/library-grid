-- Nested folders: sibling folder names must be unique (case-insensitive) and non-blank.

CREATE UNIQUE INDEX IF NOT EXISTS folders_unique_name_idx
  ON folders (
    department_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

DO $$ BEGIN
  ALTER TABLE folders
    ADD CONSTRAINT folders_name_length_check CHECK (length(btrim(name)) BETWEEN 1 AND 120);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
