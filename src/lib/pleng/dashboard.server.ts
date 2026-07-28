import "@tanstack/react-start/server-only";

import { type AuthUser } from "./auth.server";
import { listDepartments, listDocuments } from "./documents.server";
import { query } from "./db.server";

export async function dashboard(user: AuthUser) {
  const [documents, departments, users] = await Promise.all([
    listDocuments(user, {}),
    listDepartments(),
    query<{ count: string }>("SELECT count(*) FROM app_users WHERE active = true"),
  ]);
  const statusCounts: Record<string, number> = {};
  documents.forEach((doc) => {
    statusCounts[doc.status] = (statusCounts[doc.status] ?? 0) + 1;
  });
  const byDept = departments.map((dept) => ({
    ...dept,
    count: documents.filter((doc) => doc.department_id === dept.id).length,
  }));
  return {
    docs: documents.length,
    depts: departments.length,
    users: Number(users.rows[0]?.count ?? 0),
    recent: documents.slice(0, 6),
    statusCounts,
    byDept,
  };
}
