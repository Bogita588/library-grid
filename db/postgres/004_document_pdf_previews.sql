ALTER TABLE document_versions
  ADD COLUMN IF NOT EXISTS preview_storage_path text,
  ADD COLUMN IF NOT EXISTS preview_file_name text,
  ADD COLUMN IF NOT EXISTS preview_file_size bigint,
  ADD COLUMN IF NOT EXISTS preview_mime_type text,
  ADD COLUMN IF NOT EXISTS preview_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS preview_error text;
