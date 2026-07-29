export type AppRole = "super_admin" | "admin" | "dept_manager" | "contributor" | "viewer";

export type ApiUser = {
  id: string;
  email: string;
  full_name: string;
  department_id: string | null;
  role: AppRole;
};

export type Department = {
  id: string;
  name: string;
  slug: string;
  code: string;
  description?: string | null;
  color: string | null;
};

export type DocumentRow = {
  id: string;
  title: string;
  document_number: string | null;
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
  departments?: { name: string; code: string; color: string | null } | null;
  publisher?: { full_name: string | null; email: string | null } | null;
  uploader?: { full_name: string | null; email: string | null } | null;
};

export type Version = {
  id: string;
  document_id: string;
  version_number: number;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  preview_storage_path: string | null;
  preview_file_name: string | null;
  preview_file_size: number | null;
  preview_mime_type: string | null;
  preview_generated_at: string | null;
  preview_error: string | null;
  created_at: string;
};

type ApiErrorBody = { error?: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body != null;
  if (hasBody && !(init?.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers,
  });
  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Keep the HTTP status fallback below.
    }
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function currentUser() {
  return api<{ user: ApiUser | null }>("/api/me");
}

export async function login(email: string, password: string) {
  return api<{ user: ApiUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(
  fullName: string,
  email: string,
  password: string,
  companyCode: string,
) {
  return api<{ user: ApiUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      full_name: fullName,
      email,
      password,
      company_code: companyCode,
    }),
  });
}

export async function logout() {
  return api<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export async function listDepartments() {
  return api<{ departments: Department[] }>("/api/departments");
}

export async function listDocuments(params: { q?: string; dept?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.dept) search.set("dept", params.dept);
  if (params.status) search.set("status", params.status);
  return api<{ documents: DocumentRow[] }>(`/api/documents?${search}`);
}

export async function getDocument(docId: string) {
  return api<{ document: DocumentRow; versions: Version[] }>(`/api/documents/${docId}`);
}

export async function uploadDocument(formData: FormData) {
  return api<{ id: string }>("/api/documents", { method: "POST", body: formData });
}

export async function uploadVersion(docId: string, formData: FormData) {
  return api<{ ok: true; version: number }>(`/api/documents/${docId}/versions`, {
    method: "POST",
    body: formData,
  });
}

export async function updateDocumentStatus(docId: string, status: string) {
  return api<{ document: DocumentRow }>(`/api/documents/${docId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export async function deleteDocument(docId: string) {
  return api<{ ok: true }>(`/api/documents/${docId}`, { method: "DELETE" });
}

export async function documentViewUrl(docId: string) {
  return api<{
    url: string | null;
    mimeType: string;
    fileName: string;
    standardized: boolean;
    processing: boolean;
    previewError: string | null;
  }>(`/api/documents/${docId}/view-url`);
}

export async function documentDownloadUrl(docId: string) {
  return api<{ url: string }>(`/api/documents/${docId}/download-url`);
}

export async function documentVersionDownloadUrl(versionId: string) {
  return api<{ url: string }>(`/api/document-versions/${versionId}/download-url`);
}

export async function getFavorite(docId: string) {
  return api<{ favorite: { id: string } | null }>(`/api/favorites/${docId}`);
}

export async function addFavorite(docId: string) {
  return api<{ favorite: { id: string } | null }>(`/api/favorites/${docId}`, { method: "POST" });
}

export async function removeFavorite(docId: string) {
  return api<{ ok: true }>(`/api/favorites/${docId}`, { method: "DELETE" });
}

export async function listFavorites() {
  return api<{
    favorites: Array<{
      id: string;
      created_at: string;
      document_id: string;
      documents: DocumentRow;
    }>;
  }>("/api/favorites");
}

export async function getDashboard() {
  return api<{
    dashboard: {
      docs: number;
      depts: number;
      users: number;
      recent: DocumentRow[];
      statusCounts: Record<string, number>;
      byDept: Array<Department & { count: number }>;
    };
  }>("/api/dashboard");
}

export async function listUsers() {
  return api<{
    users: Array<{
      id: string;
      full_name: string | null;
      email: string;
      department_id: string | null;
      created_at: string;
      role: AppRole;
    }>;
  }>("/api/users");
}

export async function createUser(input: {
  full_name: string;
  email: string;
  role: Extract<AppRole, "admin" | "contributor">;
  department_id?: string | null;
}) {
  return api<{ id: string }>("/api/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateUserRole(userId: string, role: AppRole) {
  return api<{ ok: true }>(`/api/users/${userId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}
