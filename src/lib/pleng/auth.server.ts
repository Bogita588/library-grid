import "@tanstack/react-start/server-only";

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getServerEnv } from "./env.server";
import { ApiError } from "./http.server";
import { query, transaction } from "./db.server";

export type AppRole = "super_admin" | "admin" | "dept_manager" | "contributor" | "viewer";

export type AuthUser = {
  id: string;
  email: string;
  full_name: string;
  department_id: string | null;
  role: AppRole;
};

const authCookie = "pleng_session";
const adminRoles: AppRole[] = ["super_admin", "admin"];
const contributorRoles: AppRole[] = ["super_admin", "admin", "dept_manager", "contributor"];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
  company_code: z.string().min(1),
});

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  department_id: string | null;
  active: boolean;
  role: AppRole | null;
};

function secretKey() {
  return new TextEncoder().encode(getServerEnv().jwtSecret);
}

function parseCookies(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        if (index === -1) return [part, ""];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

export function sessionCookie(token: string) {
  const secure = getServerEnv().nodeEnv === "production" ? "; Secure" : "";
  return `${authCookie}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${secure}`;
}

export function clearSessionCookie() {
  return `${authCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

async function signSession(userId: string) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey());
}

async function findUserById(userId: string) {
  const { rows } = await query<UserRow>(
    `
      SELECT u.id, u.email, u.full_name, u.password_hash, u.department_id, u.active,
             COALESCE(
               (SELECT role FROM user_roles WHERE user_id = u.id ORDER BY created_at ASC LIMIT 1),
               'viewer'
             ) AS role
      FROM app_users u
      WHERE u.id = $1
    `,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  const token = parseCookies(request)[authCookie];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sub !== "string") return null;
    const row = await findUserById(payload.sub);
    if (!row?.active) return null;
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      department_id: row.department_id,
      role: row.role ?? "viewer",
    };
  } catch {
    return null;
  }
}

export async function requireAuth(request: Request) {
  const user = await getAuthUser(request);
  if (!user) throw new ApiError(401, "Authentication required");
  return user;
}

export function isAdmin(user: AuthUser) {
  return adminRoles.includes(user.role);
}

export function canContribute(user: AuthUser) {
  return contributorRoles.includes(user.role);
}

export function canPublish(user: AuthUser, departmentId: string) {
  if (isAdmin(user)) return true;
  return user.role === "dept_manager" && user.department_id === departmentId;
}

export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const { rows } = await query<UserRow>(
    `
      SELECT u.id, u.email, u.full_name, u.password_hash, u.department_id, u.active,
             COALESCE(
               (SELECT role FROM user_roles WHERE user_id = u.id ORDER BY created_at ASC LIMIT 1),
               'viewer'
             ) AS role
      FROM app_users u
      WHERE lower(u.email) = lower($1)
    `,
    [data.email],
  );
  const user = rows[0];
  if (!user?.active) throw new ApiError(401, "Invalid email or password");

  const ok = await bcrypt.compare(data.password, user.password_hash);
  if (!ok) throw new ApiError(401, "Invalid email or password");

  return {
    token: await signSession(user.id),
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      department_id: user.department_id,
      role: user.role ?? "viewer",
    } satisfies AuthUser,
  };
}

export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  const countBefore = await query<{ count: string }>("SELECT count(*) FROM app_users");
  if (Number(countBefore.rows[0]?.count ?? 0) > 0) {
    throw new ApiError(403, "Registration is disabled. Ask an admin to add your email.");
  }

  const expectedCode = getServerEnv().companyAccessCode;
  if (!expectedCode || data.company_code.trim() !== expectedCode) {
    throw new ApiError(403, "Invalid company access code");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const result = await transaction(async (client) => {
    const countResult = await client.query<{ count: string }>("SELECT count(*) FROM app_users");
    const firstUser = Number(countResult.rows[0]?.count ?? 0) === 0;
    const userResult = await client.query<UserRow>(
      `
        INSERT INTO app_users (email, full_name, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, email, full_name, password_hash, department_id, active, NULL::app_role AS role
      `,
      [data.email.toLowerCase(), data.full_name, passwordHash],
    );
    const role: AppRole = firstUser ? "super_admin" : "viewer";
    await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2)", [
      userResult.rows[0].id,
      role,
    ]);
    return { ...userResult.rows[0], role };
  });

  return {
    token: await signSession(result.id),
    user: {
      id: result.id,
      email: result.email,
      full_name: result.full_name,
      department_id: result.department_id,
      role: result.role ?? "viewer",
    } satisfies AuthUser,
  };
}
