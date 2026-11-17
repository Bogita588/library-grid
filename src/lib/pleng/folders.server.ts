import "@tanstack/react-start/server-only";

import { z } from "zod";
import { type AuthUser, canContribute, isAdmin } from "./auth.server";
import { query } from "./db.server";
import { getDocument, visibilityWhere } from "./documents.server";
import { ApiError } from "./http.server";

const listSchema = z.object({
  dept: z.string().min(1),
  parent: z.string().uuid().optional(),
  all: z.literal("1").optional(),
});

const renameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const createSchema = z.object({
  department_id: z.string().uuid(),
  parent_id: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(120),
});

const moveSchema = z.object({
  folder_id: z.string().uuid().nullable(),
});

const idSchema = z.string().uuid();

type FolderRow = {
  id: string;
  department_id: string;
  parent_id: string | null;
  name: string;
  created_by: string | null;
  created_at: string;
  document_count: number;
};

async function folderInDepartment(folderId: string, departmentId: string) {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM folders WHERE id = $1 AND department_id = $2",
    [folderId, departmentId],
  );
  if (!rows[0]) throw new ApiError(404, "Folder not found in this department");
}

export async function listFolders(user: AuthUser, input: unknown) {
  const { dept, parent, all } = listSchema.parse(input);
  const deptResult = await query<{ id: string; name: string }>(
    "SELECT id, name FROM departments WHERE slug = $1",
    [dept],
  );
  const departmentId = deptResult.rows[0]?.id;
  if (!departmentId) throw new ApiError(404, "Department not found");

  if (all) {
    const { rows } = await query<{ id: string; path: string }>(
      `
        WITH RECURSIVE tree AS (
          SELECT id, ($2::text || ' / ' || name) AS path, 0 AS depth
          FROM folders
          WHERE department_id = $1 AND parent_id IS NULL
          UNION ALL
          SELECT f.id, t.path || ' / ' || f.name, t.depth + 1
          FROM folders f
          JOIN tree t ON f.parent_id = t.id
          WHERE t.depth < 50
        )
        SELECT id, path FROM tree ORDER BY lower(path)
      `,
      [departmentId, deptResult.rows[0].name],
    );
    return { folders: rows };
  }

  let path: Array<{ id: string; name: string }> = [];
  if (parent) {
    await folderInDepartment(parent, departmentId);
    const pathResult = await query<{ id: string; name: string; depth: number }>(
      `
        WITH RECURSIVE chain AS (
          SELECT id, parent_id, name, 0 AS depth FROM folders WHERE id = $1
          UNION ALL
          SELECT f.id, f.parent_id, f.name, c.depth + 1
          FROM folders f
          JOIN chain c ON f.id = c.parent_id
          WHERE c.depth < 50
        )
        SELECT id, name, depth FROM chain ORDER BY depth DESC
      `,
      [parent],
    );
    path = pathResult.rows.map(({ id, name }) => ({ id, name }));
  }

  const params: unknown[] = [departmentId, parent ?? null];
  const visible = visibilityWhere(user, params);
  const { rows } = await query<FolderRow>(
    `
      SELECT f.id, f.department_id, f.parent_id, f.name, f.created_by, f.created_at,
             (
               SELECT count(*)::int
               FROM documents d
               WHERE d.folder_id = f.id AND ${visible}
             ) AS document_count
      FROM folders f
      WHERE f.department_id = $1
        AND f.parent_id IS NOT DISTINCT FROM $2::uuid
      ORDER BY lower(f.name)
    `,
    params,
  );

  return { folders: rows, path };
}

export async function createFolder(user: AuthUser, input: unknown) {
  if (!canContribute(user)) throw new ApiError(403, "You cannot create folders");
  const parsed = createSchema.parse(input);
  if (parsed.parent_id) await folderInDepartment(parsed.parent_id, parsed.department_id);

  try {
    const { rows } = await query<{ id: string }>(
      `
        INSERT INTO folders (department_id, parent_id, name, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [parsed.department_id, parsed.parent_id ?? null, parsed.name, user.id],
    );
    const id = rows[0].id;
    await query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'folder.created', 'folder', $2)",
      [user.id, id],
    );
    return { id };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "A folder with that name already exists here");
    }
    if ((error as { code?: string }).code === "23503") {
      throw new ApiError(400, "Department not found");
    }
    throw error;
  }
}

export async function deleteFolder(user: AuthUser, folderId: string) {
  const id = idSchema.parse(folderId);
  const { rows } = await query<{
    created_by: string | null;
    subfolders: number;
    documents: number;
  }>(
    `
      SELECT f.created_by,
             (SELECT count(*)::int FROM folders c WHERE c.parent_id = f.id) AS subfolders,
             (SELECT count(*)::int FROM documents d WHERE d.folder_id = f.id) AS documents
      FROM folders f
      WHERE f.id = $1
    `,
    [id],
  );
  const folder = rows[0];
  if (!folder) throw new ApiError(404, "Folder not found");
  if (!isAdmin(user) && folder.created_by !== user.id) {
    throw new ApiError(403, "You cannot delete this folder");
  }
  if (folder.subfolders > 0 || folder.documents > 0) {
    throw new ApiError(409, "Only empty folders can be deleted");
  }

  // Re-check emptiness in the DELETE itself so a concurrent insert cannot slip through.
  const result = await query(
    `
      DELETE FROM folders f
      WHERE f.id = $1
        AND NOT EXISTS (SELECT 1 FROM folders c WHERE c.parent_id = f.id)
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.folder_id = f.id)
    `,
    [id],
  );
  if (result.rowCount === 0) throw new ApiError(409, "Only empty folders can be deleted");

  await query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'folder.deleted', 'folder', $2)",
    [user.id, id],
  );
  return { ok: true };
}

export async function renameFolder(user: AuthUser, folderId: string, input: unknown) {
  const id = idSchema.parse(folderId);
  const { name } = renameSchema.parse(input);
  const { rows } = await query<{ name: string; created_by: string | null }>(
    "SELECT name, created_by FROM folders WHERE id = $1",
    [id],
  );
  const folder = rows[0];
  if (!folder) throw new ApiError(404, "Folder not found");
  if (!isAdmin(user) && folder.created_by !== user.id) {
    throw new ApiError(403, "You cannot rename this folder");
  }

  try {
    await query("UPDATE folders SET name = $1 WHERE id = $2", [name, id]);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new ApiError(409, "A folder with that name already exists here");
    }
    throw error;
  }

  await query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'folder.renamed', 'folder', $2, $3)",
    [user.id, id, JSON.stringify({ from: folder.name, to: name })],
  );
  return { ok: true };
}

export async function moveDocument(user: AuthUser, documentId: string, input: unknown) {
  const docId = idSchema.parse(documentId);
  const { folder_id } = moveSchema.parse(input);
  const doc = await getDocument(user, docId);
  if (!isAdmin(user) && doc.owner_id !== user.id && doc.uploaded_by !== user.id) {
    throw new ApiError(403, "You cannot move this document");
  }
  if (folder_id) await folderInDepartment(folder_id, doc.department_id);

  await query("UPDATE documents SET folder_id = $1 WHERE id = $2", [folder_id, docId]);
  await query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'document.moved', 'document', $2, $3)",
    [user.id, docId, JSON.stringify({ from: doc.folder_id, to: folder_id })],
  );
  return { ok: true };
}
