import "@tanstack/react-start/server-only";

import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { type AuthUser, canContribute, canPublish, isAdmin } from "./auth.server";
import { query, transaction } from "./db.server";
import {
  canCreatePdfPreview,
  createPdfPreview,
  pdfPreviewFileName,
} from "./document-preview.server";
import { getServerEnv } from "./env.server";
import { ApiError } from "./http.server";
import { deleteObject, readObject, signedDownloadUrl, uploadBuffer } from "./s3.server";

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
const previewJobs = new Set<string>();

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
  department_id: string;
  version_number: number;
  storage_path: string;
  file_name: string;
  file_size: number;
  mime_type: string | null;
  preview_storage_path: string | null;
  preview_file_name: string | null;
  preview_file_size: number | null;
  preview_mime_type: string | null;
  preview_generated_at: string | null;
  preview_error: string | null;
  created_at: string;
};

type GeneratedPreview = {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  bytes: Buffer;
};

type ViewUrlResult = {
  url: string | null;
  mimeType: string;
  fileName: string;
  standardized: boolean;
  processing: boolean;
  previewError: string | null;
};

type PdfFileResult = ViewUrlResult;

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

function previewObjectKey(departmentId: string, fileId: string, fileName: string) {
  return `${departmentId}/previews/${fileId}-${safeFileName(pdfPreviewFileName(fileName))}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 500) : "Preview conversion failed";
}

function isPdfFile(fileName: string, mimeType: string | null | undefined) {
  return (
    (mimeType || "").toLowerCase() === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")
  );
}

function requirePdfConvertible(file: File) {
  if (!canCreatePdfPreview(file.name, file.type || null)) {
    throw new ApiError(400, "Upload a PDF, Word, Excel, PowerPoint, text, CSV, PNG, or JPG file.");
  }
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
      SELECT v.*, d.department_id
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
      SELECT v.*, d.department_id
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

async function generateAndStorePreview(
  version: Pick<VersionRow, "id" | "department_id" | "storage_path" | "file_name" | "mime_type">,
  bytes: Buffer,
  contentType: string | null | undefined,
) {
  const fileId = crypto.randomUUID();
  const storagePath = previewObjectKey(version.department_id, fileId, version.file_name);
  try {
    const preview = await createPdfPreview({
      bytes,
      fileName: version.file_name,
      mimeType: version.mime_type || contentType,
    });
    if (!preview) return null;

    await uploadBuffer({
      key: storagePath,
      body: preview.bytes,
      contentLength: preview.bytes.byteLength,
      contentType: preview.mimeType,
    });

    await query(
      `
        UPDATE document_versions
        SET preview_storage_path = $2,
            preview_file_name = $3,
            preview_file_size = $4,
            preview_mime_type = $5,
            preview_generated_at = now(),
            preview_error = NULL
        WHERE id = $1
      `,
      [version.id, storagePath, preview.fileName, preview.bytes.byteLength, preview.mimeType],
    );

    return {
      storagePath,
      fileName: preview.fileName,
      fileSize: preview.bytes.byteLength,
      mimeType: preview.mimeType,
      bytes: preview.bytes,
    } satisfies GeneratedPreview;
  } catch (error) {
    console.warn("Document PDF preview generation failed", {
      versionId: version.id,
      fileName: version.file_name,
      error,
    });
    await query("UPDATE document_versions SET preview_error = $2 WHERE id = $1", [
      version.id,
      errorMessage(error),
    ]).catch(() => undefined);
    await deleteObject(storagePath).catch(() => undefined);
    return null;
  }
}

async function generateAndStorePreviewFromStorage(version: VersionRow) {
  const object = await readObject(version.storage_path);
  return generateAndStorePreview(version, Buffer.from(object.bytes), object.contentType);
}

function queuePreviewGeneration(version: VersionRow) {
  if (previewJobs.has(version.id)) return;
  previewJobs.add(version.id);
  void generateAndStorePreviewFromStorage(version).finally(() => {
    previewJobs.delete(version.id);
  });
}

async function previewInfo(version: VersionRow) {
  if (version.preview_storage_path && version.preview_file_name && version.preview_mime_type) {
    return {
      fileName: version.preview_file_name,
      mimeType: version.preview_mime_type,
      standardized: true,
      processing: false,
      previewError: null,
    };
  }

  if (isPdfFile(version.file_name, version.mime_type)) {
    return {
      fileName: pdfPreviewFileName(version.file_name),
      mimeType: "application/pdf",
      standardized: true,
      processing: false,
      previewError: null,
    };
  }

  if (canCreatePdfPreview(version.file_name, version.mime_type)) {
    if (version.preview_error && !previewJobs.has(version.id)) {
      return {
        fileName: pdfPreviewFileName(version.file_name),
        mimeType: "application/pdf",
        standardized: true,
        processing: false,
        previewError: version.preview_error,
      };
    }

    queuePreviewGeneration(version);
    return {
      fileName: pdfPreviewFileName(version.file_name),
      mimeType: "application/pdf",
      standardized: true,
      processing: true,
      previewError: version.preview_error,
    };
  }

  return {
    fileName: version.file_name,
    mimeType: version.mime_type || "application/octet-stream",
    standardized: false,
    processing: false,
    previewError: version.preview_error,
  };
}

async function previewPayload(version: VersionRow) {
  if (version.preview_storage_path && version.preview_file_name && version.preview_mime_type) {
    const object = await readObject(version.preview_storage_path);
    return {
      bytes: object.bytes,
      contentLength: object.contentLength,
      fileName: version.preview_file_name,
      mimeType: version.preview_mime_type,
    };
  }

  if (isPdfFile(version.file_name, version.mime_type)) {
    const object = await readObject(version.storage_path);
    return {
      bytes: object.bytes,
      contentLength: object.contentLength,
      fileName: pdfPreviewFileName(version.file_name),
      mimeType: "application/pdf",
    };
  }

  if (canCreatePdfPreview(version.file_name, version.mime_type)) {
    queuePreviewGeneration(version);
    throw new ApiError(409, "PDF preview is still being generated");
  }

  const object = await readObject(version.storage_path);
  return {
    bytes: object.bytes,
    contentLength: object.contentLength,
    fileName: version.file_name,
    mimeType: version.mime_type || object.contentType || "application/octet-stream",
  };
}

async function pdfDownloadInfo(version: VersionRow): Promise<PdfFileResult> {
  if (version.preview_storage_path && version.preview_file_name && version.preview_mime_type) {
    return {
      url: await signedDownloadUrl(version.preview_storage_path, version.preview_file_name),
      mimeType: version.preview_mime_type,
      fileName: version.preview_file_name,
      standardized: true,
      processing: false,
      previewError: null,
    };
  }

  if (isPdfFile(version.file_name, version.mime_type)) {
    const fileName = pdfPreviewFileName(version.file_name);
    return {
      url: await signedDownloadUrl(version.storage_path, fileName),
      mimeType: "application/pdf",
      fileName,
      standardized: true,
      processing: false,
      previewError: null,
    };
  }

  if (canCreatePdfPreview(version.file_name, version.mime_type)) {
    if (version.preview_error && !previewJobs.has(version.id)) {
      return {
        url: null,
        mimeType: "application/pdf",
        fileName: pdfPreviewFileName(version.file_name),
        standardized: true,
        processing: false,
        previewError: version.preview_error,
      };
    }

    queuePreviewGeneration(version);
    return {
      url: null,
      mimeType: "application/pdf",
      fileName: pdfPreviewFileName(version.file_name),
      standardized: true,
      processing: true,
      previewError: version.preview_error,
    };
  }

  return {
    url: null,
    mimeType: version.mime_type || "application/octet-stream",
    fileName: version.file_name,
    standardized: false,
    processing: false,
    previewError: "This file cannot be converted to PDF",
  };
}

async function createUploadedPreview({
  departmentId,
  fileId,
  fileName,
  mimeType,
  bytes,
}: {
  departmentId: string;
  fileId: string;
  fileName: string;
  mimeType: string | null;
  bytes: Buffer;
}) {
  const storagePath = previewObjectKey(departmentId, fileId, fileName);
  try {
    const preview = await createPdfPreview({ bytes, fileName, mimeType });
    if (!preview) return { preview: null, error: null };

    await uploadBuffer({
      key: storagePath,
      body: preview.bytes,
      contentLength: preview.bytes.byteLength,
      contentType: preview.mimeType,
    });

    return {
      preview: {
        storagePath,
        fileName: preview.fileName,
        fileSize: preview.bytes.byteLength,
        mimeType: preview.mimeType,
        bytes: preview.bytes,
      } satisfies GeneratedPreview,
      error: null,
    };
  } catch (error) {
    console.warn("Document PDF preview generation failed", { fileName, error });
    await deleteObject(storagePath).catch(() => undefined);
    return { preview: null, error: errorMessage(error) };
  }
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
    `
      SELECT v.*, d.department_id
      FROM document_versions v
      JOIN documents d ON d.id = v.document_id
      WHERE v.document_id = $1
      ORDER BY v.version_number DESC
    `,
    [documentId],
  );
  return rows;
}

export async function createDocument(user: AuthUser, formData: FormData) {
  if (!canContribute(user)) throw new ApiError(403, "You cannot upload documents");

  const file = requireFile(formData.get("file"));
  requirePdfConvertible(file);
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

  const fileId = crypto.randomUUID();
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const key = `${parsed.department_id}/${fileId}-${safeFileName(file.name)}`;
  const uploadedPdf = isPdfFile(file.name, file.type || null);
  await uploadBuffer({
    key,
    body: fileBytes,
    contentLength: fileBytes.byteLength,
    contentType: file.type || "application/octet-stream",
  });

  try {
    const result = await transaction(async (client) => {
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
      const versionResult = await client.query<{ id: string }>(
        `
          INSERT INTO document_versions (
            document_id, version_number, file_name, file_size, mime_type, storage_path, uploaded_by,
            preview_storage_path, preview_file_name, preview_file_size, preview_mime_type,
            preview_generated_at, preview_error
          )
          VALUES (
            $1, 1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            CASE WHEN $7::text IS NULL THEN NULL ELSE now() END,
            $11
          )
          RETURNING id
        `,
        [
          documentId,
          file.name,
          fileBytes.byteLength,
          file.type || null,
          key,
          user.id,
          uploadedPdf ? key : null,
          uploadedPdf ? pdfPreviewFileName(file.name) : null,
          uploadedPdf ? fileBytes.byteLength : null,
          uploadedPdf ? "application/pdf" : null,
          null,
        ],
      );
      await client.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id) VALUES ($1, 'document.created', 'document', $2)",
        [user.id, documentId],
      );
      return { id: documentId, versionId: versionResult.rows[0].id };
    });

    if (!uploadedPdf) {
      queuePreviewGeneration({
        id: result.versionId,
        document_id: result.id,
        department_id: parsed.department_id,
        version_number: 1,
        storage_path: key,
        file_name: file.name,
        file_size: fileBytes.byteLength,
        mime_type: file.type || null,
        preview_storage_path: null,
        preview_file_name: null,
        preview_file_size: null,
        preview_mime_type: null,
        preview_generated_at: null,
        preview_error: null,
        created_at: new Date().toISOString(),
      });
    }

    return { id: result.id };
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
  requirePdfConvertible(file);
  const fileId = crypto.randomUUID();
  const fileBytes = Buffer.from(await file.arrayBuffer());
  const key = `${doc.department_id}/${fileId}-${safeFileName(file.name)}`;
  const uploadedPdf = isPdfFile(file.name, file.type || null);
  await uploadBuffer({
    key,
    body: fileBytes,
    contentLength: fileBytes.byteLength,
    contentType: file.type || "application/octet-stream",
  });

  try {
    const result = await transaction(async (client) => {
      const nextVersion = Number(doc.current_version) + 1;
      const versionResult = await client.query<{ id: string }>(
        `
          INSERT INTO document_versions (
            document_id, version_number, file_name, file_size, mime_type, storage_path, uploaded_by,
            preview_storage_path, preview_file_name, preview_file_size, preview_mime_type,
            preview_generated_at, preview_error
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11,
            CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
            $12
          )
          RETURNING id
        `,
        [
          documentId,
          nextVersion,
          file.name,
          fileBytes.byteLength,
          file.type || null,
          key,
          user.id,
          uploadedPdf ? key : null,
          uploadedPdf ? pdfPreviewFileName(file.name) : null,
          uploadedPdf ? fileBytes.byteLength : null,
          uploadedPdf ? "application/pdf" : null,
          null,
        ],
      );
      await client.query("UPDATE documents SET current_version = $1 WHERE id = $2", [
        nextVersion,
        documentId,
      ]);
      await client.query(
        "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'document.version_added', 'document', $2, $3)",
        [user.id, documentId, JSON.stringify({ version: nextVersion })],
      );
      return { ok: true, version: nextVersion, versionId: versionResult.rows[0].id };
    });

    if (!uploadedPdf) {
      queuePreviewGeneration({
        id: result.versionId,
        document_id: documentId,
        department_id: doc.department_id,
        version_number: result.version,
        storage_path: key,
        file_name: file.name,
        file_size: fileBytes.byteLength,
        mime_type: file.type || null,
        preview_storage_path: null,
        preview_file_name: null,
        preview_file_size: null,
        preview_mime_type: null,
        preview_generated_at: null,
        preview_error: null,
        created_at: new Date().toISOString(),
      });
    }

    return { ok: true, version: result.version };
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
    versions.flatMap((version) =>
      [version.storage_path, version.preview_storage_path]
        .filter((key): key is string => Boolean(key))
        .map((key) => deleteObject(key).catch(() => undefined)),
    ),
  );
  return { ok: true };
}

export async function viewUrl(user: AuthUser, documentId: string): Promise<ViewUrlResult> {
  const version = await latestReadableVersion(user, documentId);
  const preview = await previewInfo(version);
  const token = await signPreviewToken(user.id, documentId);
  return {
    url: preview.processing
      ? null
      : `/api/documents/${documentId}/preview?token=${encodeURIComponent(token)}`,
    mimeType: preview.mimeType,
    fileName: preview.fileName,
    standardized: preview.standardized,
    processing: preview.processing,
    previewError: preview.previewError,
  };
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

export async function downloadUrl(user: AuthUser, documentId: string): Promise<PdfFileResult> {
  const version = await latestReadableVersion(user, documentId);
  return pdfDownloadInfo(version);
}

export async function versionDownloadUrl(user: AuthUser, versionId: string) {
  if (!isAdmin(user)) throw new ApiError(403, "Only admins can download documents");
  const params: unknown[] = [versionId];
  const visible = visibilityWhere(user, params);
  const { rows } = await query<VersionRow>(
    `
      SELECT v.*, d.department_id
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
