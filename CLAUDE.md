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

## Folder component (src/components/Folder.tsx)
- Third-party React Bits component, about 2,460 lines. Do NOT read the whole file. Read only the props at the top (FolderProps, lines 18-57) and the default export.
- Use only for subfolder tiles. Props: mode="flap", variant="solid" (never "glass": WebGL context limit), openOn="hover", draggable={false}, intro={false}, zoomOnClick={false}, size about 0.8, label=folder name, color=the department colour.
- Hover shows the papers, a click must navigate into the folder (handle onClick on a wrapper div).
- items: pass up to 3 blank papers (`{}`) based on the folder's document count. When the count is 0 the folder must show no papers. The component falls back to sample items when items is empty (the `source` line near line 1225). Change that one line so an empty array stays empty, and check it in the browser.
- Drag and drop of documents onto folders is done with normal HTML5 drag events on a wrapper div around each tile, not with the component's own drag.

## Lint and formatting
- Do NOT run npm run format, prettier --write, or eslint --fix. Existing files have CRLF line endings and lint fails repo-wide for old reasons. Only check your own files.

## Type checking
- npm run build:frontend does NOT type-check. After every change also run `npx tsc --noEmit` and report errors in the files you touched (older errors elsewhere may exist, mention them but do not fix them).
