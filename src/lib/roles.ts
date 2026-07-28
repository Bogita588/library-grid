export type AppRole = "super_admin" | "admin" | "dept_manager" | "contributor" | "viewer";

const ADMIN_ROLES: AppRole[] = ["super_admin", "admin"];
const CONTRIBUTOR_ROLES: AppRole[] = ["super_admin", "admin", "dept_manager", "contributor"];

export function isAdminRole(role: string | null | undefined) {
  return ADMIN_ROLES.includes(role as AppRole);
}

export function canContributeRole(role: string | null | undefined) {
  return CONTRIBUTOR_ROLES.includes(role as AppRole);
}
