import "@tanstack/react-start/server-only";

import { ZodError } from "zod";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return json({ error: "Invalid request", issues: error.flatten() }, { status: 400 });
  }
  console.error(error);
  return json({ error: "Internal server error" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new ApiError(400, "Invalid JSON body");
  }
}
