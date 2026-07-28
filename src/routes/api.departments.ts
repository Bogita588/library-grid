import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/departments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { listDepartments } = await import("@/lib/pleng/documents.server");
          await requireAuth(request);
          return Response.json({ departments: await listDepartments() });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
