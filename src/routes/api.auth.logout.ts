import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => {
        const { clearSessionCookie } = await import("@/lib/pleng/auth.server");
        return Response.json({ ok: true }, { headers: { "set-cookie": clearSessionCookie() } });
      },
    },
  },
});
