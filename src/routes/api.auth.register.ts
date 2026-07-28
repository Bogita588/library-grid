import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/register")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { readJson, json } = await import("@/lib/pleng/http.server");
          const { register, sessionCookie } = await import("@/lib/pleng/auth.server");
          const result = await register(await readJson(request));
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
