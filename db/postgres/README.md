# Pleng DMS PostgreSQL Setup

This schema is the Supabase database model rewritten for a private PostgreSQL database on the Contabo VPS. It does not depend on Supabase `auth`, RLS, or Storage tables.

## Create The Database

Run on the Contabo VPS:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql
```

```sql
CREATE DATABASE pleng_dms;
CREATE USER pleng_app WITH ENCRYPTED PASSWORD 'REPLACE_WITH_A_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE pleng_dms TO pleng_app;
\c pleng_dms
GRANT ALL ON SCHEMA public TO pleng_app;
\q
```

Apply the schema:

```bash
psql "postgresql://pleng_app:REPLACE_WITH_A_STRONG_PASSWORD@127.0.0.1:5432/pleng_dms" \
  -f db/postgres/001_pleng_dms_schema.sql
```

Keep PostgreSQL private:

```bash
sudo sed -i "s/^#\\?listen_addresses.*/listen_addresses = 'localhost'/" /etc/postgresql/*/main/postgresql.conf
sudo systemctl restart postgresql
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw deny 5432
sudo ufw enable
```

## Contabo Object Storage

For the bucket URL:

```text
https://eu2.contabostorage.com/a66e070f1ad1463d95eca9e84ee7e7c8:pleng
```

Use:

```env
S3_ENDPOINT=https://eu2.contabostorage.com
S3_BUCKET=a66e070f1ad1463d95eca9e84ee7e7c8:pleng
S3_REGION=default
```

The backend uses path-style S3 requests, which is the safest option for Contabo bucket names like `tenant:bucket`.

## App Runtime Env

Run the TanStack Start backend on the same VPS as PostgreSQL so `DATABASE_URL` can stay on `127.0.0.1`:

```env
COMPANY_ACCESS_CODE=choose-a-private-registration-code
DATABASE_URL=postgresql://pleng_app:REPLACE_WITH_A_STRONG_PASSWORD@127.0.0.1:5432/pleng_dms
S3_ENDPOINT=https://eu2.contabostorage.com
S3_REGION=default
S3_BUCKET=a66e070f1ad1463d95eca9e84ee7e7c8:pleng
S3_ACCESS_KEY_ID=REPLACE_WITH_CONTABO_OBJECT_STORAGE_ACCESS_KEY
S3_SECRET_ACCESS_KEY=REPLACE_WITH_CONTABO_OBJECT_STORAGE_SECRET_KEY
JWT_SECRET=REPLACE_WITH_OUTPUT_FROM_OPENSSL_RAND_HEX_32
NODE_ENV=production
```

Generate the JWT secret on the server:

```bash
openssl rand -hex 32
```

Build and run the app with Node 22:

```bash
npm install
npm run build
node .output/server/index.mjs
```

## Publishing Rules

Documents are published by changing their status to `published`. The backend records `published_by` and `published_at` on the `documents` table. Publishing is allowed for `super_admin`, `admin`, and a `dept_manager` whose user department matches the document department.
