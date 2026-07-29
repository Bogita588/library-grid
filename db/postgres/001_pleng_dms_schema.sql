CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('super_admin','admin','dept_manager','contributor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE doc_status AS ENUM ('draft','under_review','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE confidentiality AS ENUM ('public','internal','department','confidential','strictly_confidential');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#0f766e',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, department_id)
);

CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text UNIQUE,
  title text NOT NULL,
  description text,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  folder_id uuid REFERENCES folders(id) ON DELETE SET NULL,
  category text,
  status doc_status NOT NULL DEFAULT 'draft',
  confidentiality confidentiality NOT NULL DEFAULT 'public',
  tags text[] DEFAULT '{}',
  keywords text,
  owner_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  published_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  current_version int NOT NULL DEFAULT 1,
  effective_date date,
  expiry_date date,
  review_date date,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  search_tsv tsvector
);

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number int NOT NULL,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text,
  change_note text,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE TABLE IF NOT EXISTS document_viewers (
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (document_id, user_id)
);

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (document_id IS NOT NULL OR folder_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_email_idx ON app_users (lower(email));
CREATE INDEX IF NOT EXISTS user_roles_user_idx ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS folders_dept_idx ON folders(department_id);
CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders(parent_id);
CREATE INDEX IF NOT EXISTS documents_dept_idx ON documents(department_id);
CREATE INDEX IF NOT EXISTS documents_folder_idx ON documents(folder_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);
CREATE INDEX IF NOT EXISTS documents_search_idx ON documents USING GIN(search_tsv);
CREATE INDEX IF NOT EXISTS documents_tags_idx ON documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS document_versions_doc_idx ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS document_viewers_user_idx ON document_viewers(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_document_idx
  ON favorites(user_id, document_id)
  WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_folder_idx
  ON favorites(user_id, folder_id)
  WHERE folder_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_users_updated ON app_users;
CREATE TRIGGER app_users_updated BEFORE UPDATE ON app_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS folders_updated ON folders;
CREATE TRIGGER folders_updated BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS documents_updated ON documents;
CREATE TRIGGER documents_updated BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION documents_update_search()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('english', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.document_number,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.keywords,'')), 'C') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags,' '),'')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_search ON documents;
CREATE TRIGGER documents_search BEFORE INSERT OR UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION documents_update_search();

CREATE OR REPLACE FUNCTION generate_document_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  dept_code text;
  year_str text := to_char(now(),'YYYY');
  seq int;
BEGIN
  IF NEW.document_number IS NULL OR NEW.document_number = '' THEN
    SELECT code INTO dept_code FROM departments WHERE id = NEW.department_id;
    SELECT COALESCE(MAX(CAST(split_part(document_number,'-',3) AS int)),0) + 1 INTO seq
      FROM documents
      WHERE document_number LIKE dept_code || '-' || year_str || '-%';
    NEW.document_number := dept_code || '-' || year_str || '-' || LPAD(seq::text,4,'0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_number_gen ON documents;
CREATE TRIGGER documents_number_gen BEFORE INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION generate_document_number();

INSERT INTO departments (name, slug, code, description, color)
VALUES
  ('Administration', 'administration', 'ADM', 'Company administration and general records.', '#64748b'),
  ('Construction', 'construction', 'CON', 'Construction execution, site records, and field documentation.', '#f97316'),
  ('Engineering', 'engineering', 'ENG', 'Engineering drawings, calculations, specifications, and technical records.', '#0f766e'),
  ('Finance', 'finance', 'FIN', 'Finance policies, controls, and reporting documents.', '#16a34a'),
  ('Health and Safety', 'health-and-safety', 'HSE', 'Safety procedures, incident records, and compliance documentation.', '#dc2626'),
  ('Human Resources', 'human-resources', 'HR', 'People operations, onboarding, and employment documentation.', '#9333ea'),
  ('Legal', 'legal', 'LEG', 'Contracts, legal notices, and governance records.', '#0f172a'),
  ('Operations', 'operations', 'OPS', 'Operating procedures, manuals, and business continuity documents.', '#0891b2'),
  ('Procurement', 'procurement', 'PRC', 'Supplier, purchasing, and contract administration documents.', '#ca8a04'),
  ('Project Management', 'project-management', 'PMO', 'Schedules, reports, project controls, and delivery documentation.', '#7c3aed'),
  ('Quality Assurance', 'quality-assurance', 'QA', 'Quality plans, inspection records, and audit documentation.', '#059669')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    code = EXCLUDED.code,
    description = EXCLUDED.description,
    color = EXCLUDED.color;
