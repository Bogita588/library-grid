import "@tanstack/react-start/server-only";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { type AuthUser, canContribute, isAdmin } from "./auth.server";
import { query, transaction } from "./db.server";
import { ApiError } from "./http.server";

const roleSchema = z.object({
  role: z.enum(["super_admin", "admin", "dept_manager", "contributor", "viewer"]),
});

const createUserSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["admin", "contributor"]).default("contributor"),
  department_id: z.string().uuid().nullable().optional(),
});

const DEFAULT_LIBRARY_PASSWORD = "docs.pleng";

export async function listUsers(user: AuthUser) {
  if (!isAdmin(user) && !canContribute(user)) {
    throw new ApiError(403, "User list access required");
  }
  const { rows } = await query(
    `
      SELECT u.id, u.full_name, u.email, u.department_id, u.created_at,
             COALESCE(
               (SELECT role FROM user_roles WHERE user_id = u.id ORDER BY created_at ASC LIMIT 1),
               'viewer'
             ) AS role
      FROM app_users u
      WHERE u.active = true
      ORDER BY u.created_at DESC
    `,
  );
  return rows;
}

export async function createUser(user: AuthUser, input: unknown) {
  if (!isAdmin(user)) throw new ApiError(403, "Admin access required");
  const data = createUserSchema.parse(input);
  const passwordHash = await bcrypt.hash(DEFAULT_LIBRARY_PASSWORD, 12);

  return transaction(async (client) => {
    const userResult = await client.query<{ id: string }>(
      `
        INSERT INTO app_users (email, full_name, password_hash, department_id)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `,
      [data.email.toLowerCase(), data.full_name, passwordHash, data.department_id || null],
    );
    const targetUserId = userResult.rows[0].id;
    await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [
      targetUserId,
      data.role,
    ]);
    await client.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'user.created', 'user', $2, $3)",
      [user.id, targetUserId, JSON.stringify({ role: data.role })],
    );
    return { id: targetUserId };
  });
}

export async function updateRole(user: AuthUser, targetUserId: string, input: unknown) {
  if (!isAdmin(user)) throw new ApiError(403, "Admin access required");
  const { role } = roleSchema.parse(input);
  await transaction(async (client) => {
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [targetUserId]);
    await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [
      targetUserId,
      role,
    ]);
    await client.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'user.role_updated', 'user', $2, $3)",
      [user.id, targetUserId, JSON.stringify({ role })],
    );
  });
  return { ok: true };
}
