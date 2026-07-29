ALTER TABLE documents
  ALTER COLUMN confidentiality SET DEFAULT 'public';

CREATE TABLE IF NOT EXISTS document_viewers (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS document_viewers_user_idx ON document_viewers(user_id);
