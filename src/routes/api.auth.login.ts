import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { readJson, json } = await import("@/lib/pleng/http.server");
          const { login, sessionCookie } = await import("@/lib/pleng/auth.server");
          const result = await login(await readJson(request));
          return json(
            { user: result.user },
            { headers: { "set-cookie": sessionCookie(result.token) } },
          );
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
