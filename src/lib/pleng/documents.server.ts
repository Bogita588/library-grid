import "@tanstack/react-start/server-only";

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { type AuthUser, canContribute, canPublish, isAdmin } from "./auth.server";
import { query, transaction } from "./db.server";
import { getServerEnv } from "./env.server";
import { ApiError } from "./http.server";
import { deleteObject, readObject, signedDownloadUrl, uploadObject } from "./s3.server";

const statuses = ["draft", "under_review", "published", "archived"] as const;
const confidentiality = [
  "public",
  "internal",
  "department",
  "confidential",
  "strictly_confidential",
] as const;
const hiddenDepartmentSlugs = ["construction", "project-management", "quality-assurance"];

const listSchema = z.object({
  q: z.string().optional(),
  dept: z.string().optional(),
  status: z.enum(statuses).optional(),
});

const statusSchema = z.object({
  status: z.enum(statuses),
});

const viewerIdsSchema = z.array(z.string().uuid()).max(500);
const previewAudience = "pleng-document-preview";

type DocumentRow = {
  id: string;
  document_number: string | null;
  title: string;
  description: string | null;
  status: string;
  confidentiality: string;
  current_version: number;
  updated_at: string;
  created_at: string;
  owner_id: string | null;
  uploaded_by: string | null;
  published_by: string | null;
  published_at: string | null;
  department_id: string;
  department_name: string | null;
  department_code: string | null;
  department_color: string | null;
  publisher_name: string | null;
  publisher_email: string | null;
  uploader_name: string | null;
  uploader_email: string | null;
};

type VersionRow = {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
};

function visibilityWhere(user: AuthUser, params: unknown[]) {
  if (isAdmin(user)) {
    return "TRUE";
  }

  params.push(user.id);
  const userId = `$${params.length}`;
  return `
    (
      d.confidentiality = 'public'
      OR d.owner_id = ${userId}
      OR d.uploaded_by = ${userId}
      OR EXISTS (
        SELECT 1
        FROM document_viewers dv
        WHERE dv.document_id = d.id
          AND dv.user_id = ${userId}
      )
    )
  `;
}

function mapDocument(row: DocumentRow) {
  return {
    id: row.id,
    document_number: row.document_number,
    title: row.title,
    description: row.description,
    status: row.status,
    confidentiality: row.confidentiality,
    current_version: row.current_version,
    updated_at: row.updated_at,
    created_at: row.created_at,
    owner_id: row.owner_id,
    uploaded_by: row.uploaded_by,
    published_by: row.published_by,
    published_at: row.published_at,
    department_id: row.department_id,
    departments: row.department_name
      ? {
          name: row.department_name,
          code: row.department_code,
          color: row.department_color,
        }
      : null,
    publisher:
      row.published_by && (row.publisher_name || row.publisher_email)
        ? {
            full_name: row.publisher_name,
            email: row.publisher_email,
          }
        : null,
    uploader:
      row.uploaded_by && (row.uploader_name || row.uploader_email)
        ? {
            full_name: row.uploader_name,
            email: row.uploader_email,
          }
        : null,
  };
}

function safeFileName(name: string) {
  return name.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 180) || "document";
}

function requireFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    throw new ApiError(400, "A document file is required");
  }
  return value;
}

function parseViewerIds(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    return [...new Set(viewerIdsSchema.parse(JSON.parse(value)))];
  } catch {
    throw new ApiError(400, "Invalid viewer selection");
  }
}

function previewSecretKey() {
  return new TextEncoder().encode(getServerEnv().jwtSecret);
}

async function signPreviewToken(userId: string, documentId: string) {
  return new SignJWT({ doc: documentId, typ: "document-preview" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(previewAudience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(previewSecretKey());
}

async function verifyPreviewToken(documentId: string, token: string) {
  try {
    const { payload } = await jwtVerify(token, previewSecretKey(), {
      audience: previewAudience,
    });
    if (payload.doc !== documentId || payload.typ !== "document-preview") {
      throw new Error("Invalid preview token");
    }
  } catch {
    throw new ApiError(401, "Preview link expired");
  }
}

async function latestReadableVersion(user: AuthUser, documentId: string) {
  const params: unknown[] = [documentId];
  const visible = visibilityWhere(user, params);
  const { rows } = await query<VersionRow>(
    `
      SELECT v.*
      FROM document_versions v
      JOIN documents d ON d.id = v.document_id
      WHERE d.id = $1 AND ${visible}
      ORDER BY v.version_number DESC
      LIMIT 1
    `,
    params,
  );
  const version = rows[0];
  if (!version) throw new ApiError(404, "Document file not found");
  return version;
}

async function latestVersion(documentId: string) {
  const { rows } = await query<VersionRow>(
    `
      SELECT v.*
      FROM document_versions v
      JOIN documents d ON d.id = v.document_id
      WHERE d.id = $1
      ORDER BY v.version_number DESC
      LIMIT 1
    `,
    [documentId],
  );
  const version = rows[0];
  if (!version) throw new ApiError(404, "Document file not found");
  return version;
}

async function previewPayload(version: VersionRow) {
  const object = await readObject(version.storage_path);
  return {
    bytes: object.bytes,
    contentLength: object.contentLength,
    fileName: version.file_name,
    mimeType: version.mime_type || object.contentType || "application/octet-stream",
  };
}

export async function listDepartments() {
  const { rows } = await query(
    "SELECT * FROM departments WHERE slug <> ALL($1::text[]) ORDER BY name",
    [hiddenDepartmentSlugs],
  );
  return rows;
}

export async function listDocuments(user: AuthUser, input: unknown) {
  const filters = listSchema.parse(input);
  const params: unknown[] = [];
  const where = [visibilityWhere(user, params)];

  if (filters.dept) {
    params.push(filters.dept);
    where.push(`dept.slug = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`d.status = $${params.length}`);
  }
  if (filters.q?.trim()) {
    params.push(filters.q.trim());
    where.push(`d.search_tsv @@ websearch_to_tsquery('english', $${params.length})`);
  }

  const { rows } = await query<DocumentRow>(
    `
      SELECT d.*,
             dept.name AS department_name,
             dept.code AS department_code,
             dept.color AS department_color,
             pub.full_name AS publisher_name,
             pub.email AS publisher_email,
             uploader.full_name AS uploader_name,
             uploader.email AS uploader_email
      FROM documents d
      JOIN departments dept ON dept.id = d.department_id
      LEFT JOIN app_users pub ON pub.id = d.published_by
      LEFT JOIN app_users uploader ON uploader.id = d.uploaded_by
      WHERE ${where.join(" AND ")}
      ORDER BY d.updated_at DESC
      LIMIT 200
    `,
    params,
  );
  return rows.map(mapDocument);
}

export async function getDocument(user: AuthUser, documentId: string) {
  const params: unknown[] = [documentId];
  const visible = visibilityWhere(user, params);
  const { rows } = await query<DocumentRow>(
    `
      SELECT d.*,
             dept.name AS department_name,
             dept.code AS department_code,
             dept.color AS department_color,
             pub.full_name AS publisher_name,
             pub.email AS publisher_email,
             uploader.full_name AS uploader_name,
             uploader.email AS uploader_email
      FROM documents d
      JOIN departments dept ON dept.id = d.department_id
      LEFT JOIN app_users pub ON pub.id = d.published_by
      LEFT JOIN app_users uploader ON uploader.id = d.uploaded_by
      WHERE d.id = $1 AND ${visible}
      LIMIT 1
    `,
    params,
  );
  const doc = rows[0];
  if (!doc) throw new ApiError(404, "Document not found");
  return mapDocument(doc);
}

export async function listVersions(user: AuthUser, documentId: string) {
  await getDocument(user, documentId);
  const { rows } = await query<VersionRow>(
    "SELECT * FROM document_versions WHERE document_id = $1 ORDER BY version_number DESC",
    [documentId],
  );
  return rows;
}

export async function createDocument(user: AuthUser, formData: FormData) {
  if (!canContribute(user)) throw new ApiError(403, "You cannot upload documents");

  const file = requireFile(formData.get("file"));
  const parsed = z
    .object({
      title: z.string().min(1),
      description: z.string().optional(),
      keywords: z.string().optional(),
      department_id: z.string().uuid(),
      confidentiality: z.enum(confidentiality).default("public"),
    })
    .parse(Object.fromEntries(formData.entries()));
  const viewerIds =
    parsed.confidentiality === "public"
      ? []
      : parseViewerIds(formData.get("viewer_ids")).filter((id) => id !== user.id);

  const key = `${parsed.department_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  await uploadObject({ key, file });

  try {
    return await transaction(async (client) => {
      const adminUpload = isAdmin(user);
      const initialStatus = adminUpload ? "published" : "draft";
      const docResult = await client.query<{ id: string }>(
        `
          INSERT INTO documents (
            title, description, department_id, confidentiality, keywords,
            status, current_version, owner_id, uploaded_by, published_by, published_at
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6::doc_status, 1, $7::uuid, $7::uuid,
            CASE WHEN $8::boolean THEN $7::uuid ELSE NULL::uuid END,
            CASE WHEN $8::boolean THEN now() ELSE NULL::timestamptz END
          )
          RETURNING id
        `,
        [
          parsed.title,
          parsed.description || null,
          parsed.department_id,
          parsed.confidentiality,
          parsed.keywords || null,
          initialStatus,
          user.id,
          adminUpload,
        ],
      );
      const documentId = docResult.rows[0].id;
      if (viewerIds.length > 0) {
        const validUsers = await client.query<{ id: string }>(
          "SELECT id FROM app_users WHERE active = true AND id = ANY($1::uuid[])",
          [viewerIds],
        );
        if (validUsers.rows.length !== viewerIds.length) {
          throw new ApiError(400, "One or more selected viewers could not be found");
        }
        await client.query(
          `
            INSERT INTO document_viewers (document_id, user_id, granted_by)
            SELECT $1::uuid, selected.user_id, $3::uuid
            FROM unnest($2::uuid[]) AS selected(user_id)
            ON CONFLICT DO NOTHING
          `,
          [documentId, viewerIds, user.id],
        );
      }
      await client.query(
        `
          INSERT INTO document_versions (
            document_id, version_number, file_name, file_size, mime_type, storage_path, uploaded_by
          )
          VALUES ($1, 1, $2, $3, $4, $5, $6)
        `,
        [documentId, file.name, file.size, file.type || null, key, user.id],
      );
      await client.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'document.created', 'document', $2)",
        [user.id, documentId],
      );
      return { id: documentId };
    });
  } catch (error) {
    await deleteObject(key).catch(() => undefined);
    throw error;
  }
}

export async function addVersion(user: AuthUser, documentId: string, formData: FormData) {
  if (!canContribute(user)) throw new ApiError(403, "You cannot upload document versions");
  const doc = await getDocument(user, documentId);
  if (!isAdmin(user) && doc.owner_id !== user.id && doc.uploaded_by !== user.id) {
    throw new ApiError(403, "You cannot edit this document");
  }

  const file = requireFile(formData.get("file"));
  const key = `${doc.department_id}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  await uploadObject({ key, file });

  try {
    return await transaction(async (client) => {
      const nextVersion = Number(doc.current_version) + 1;
      await client.query(
        `
          INSERT INTO document_versions (
            document_id, version_number, file_name, file_size, mime_type, storage_path, uploaded_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [documentId, nextVersion, file.name, file.size, file.type || null, key, user.id],
      );
      await client.query("UPDATE documents SET current_version = $1 WHERE id = $2", [
        nextVersion,
        documentId,
      ]);
      await client.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'document.version_added', 'document', $2, $3)",
        [user.id, documentId, JSON.stringify({ version: nextVersion })],
      );
      return { ok: true, version: nextVersion };
    });
  } catch (error) {
    await deleteObject(key).catch(() => undefined);
    throw error;
  }
}

export async function changeDocumentStatus(user: AuthUser, documentId: string, input: unknown) {
  const { status } = statusSchema.parse(input);
  const doc = await getDocument(user, documentId);
  if (status === "published") {
    if (!canPublish(user, doc.department_id))
      throw new ApiError(403, "You cannot publish this document");
  } else if (!isAdmin(user) && doc.owner_id !== user.id && doc.uploaded_by !== user.id) {
    throw new ApiError(403, "You cannot edit this document");
  }

  await query(
    `
      UPDATE documents
      SET status = $1,
          published_by = CASE WHEN $1 = 'published' THEN $2 ELSE published_by END,
          published_at = CASE WHEN $1 = 'published' THEN now() ELSE published_at END
      WHERE id = $3
    `,
    [status, user.id, documentId],
  );

  await query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'document.status_changed', 'document', $2, $3)",
    [user.id, documentId, JSON.stringify({ status })],
  );

  return getDocument(user, documentId);
}

export async function deleteDocument(user: AuthUser, documentId: string) {
  if (!isAdmin(user)) throw new ApiError(403, "Only admins can delete documents");
  const versions = await listVersions(user, documentId);
  await query("DELETE FROM documents WHERE id = $1", [documentId]);
  await Promise.all(
    versions.map((version) => deleteObject(version.storage_path).catch(() => undefined)),
  );
  return { ok: true };
}

export async function viewUrl(user: AuthUser, documentId: string) {
  await latestReadableVersion(user, documentId);
  const token = await signPreviewToken(user.id, documentId);
  return { url: `/api/documents/${documentId}/preview?token=${encodeURIComponent(token)}` };
}

export async function previewFile(user: AuthUser, documentId: string) {
  const version = await latestReadableVersion(user, documentId);
  return previewPayload(version);
}

export async function previewFileFromToken(documentId: string, token: string) {
  await verifyPreviewToken(documentId, token);
  const version = await latestVersion(documentId);
  return previewPayload(version);
}

export async function downloadUrl(user: AuthUser, documentId: string) {
  if (!isAdmin(user)) throw new ApiError(403, "Only admins can download documents");
  const version = await latestReadableVersion(user, documentId);
  return { url: await signedDownloadUrl(version.storage_path, version.file_name) };
}

export async function versionDownloadUrl(user: AuthUser, versionId: string) {
  if (!isAdmin(user)) throw new ApiError(403, "Only admins can download documents");
  const params: unknown[] = [versionId];
  const visible = visibilityWhere(user, params);
  const { rows } = await query<VersionRow>(
    `
      SELECT v.*
      FROM document_versions v
      JOIN documents d ON d.id = v.document_id
      WHERE v.id = $1 AND ${visible}
      LIMIT 1
    `,
    params,
  );
  const version = rows[0];
  if (!version) throw new ApiError(404, "Document version not found");
  return { url: await signedDownloadUrl(version.storage_path, version.file_name) };
}
