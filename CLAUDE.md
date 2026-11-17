# Pleng Library
Internal PDF document library for Pleng Limited. Stack: TanStack Start, React, Tailwind v4, shadcn/ui, PostgreSQL, Contabo S3.

## Rules
- Keep changes small. Do not over-engineer.
- Work only on branch ngangadev. Never force-push or rewrite history.
- Follow existing patterns: server logic in src/lib/pleng/*.server.ts, client calls in src/lib/pleng/api.ts, API routes in src/routes/api.*.ts, pages in src/routes/_authenticated/.
- Validate input with zod, use parameterised SQL only.
- DB changes go in a new numbered file in db/postgres/ (next is 005). Never edit old migrations.
- Never put secrets in code. Do not change auth, roles, file storage, or document deletion rules.
- Run `npm run lint` and `npm run build:frontend` after changes.

## Current feature: nested folders
Folders live inside departments, can nest, hold documents and other folders. Existing `folders` table and `documents.folder_id` are already in the schema. A "New folder" button next to Upload, a path (Engineering / Folder-1 / Subfolder 2) in the header, folder tiles using the React Bits Folder component, drag a document onto a folder to move it. Delete a folder only when empty. Existing documents stay at the department root.
