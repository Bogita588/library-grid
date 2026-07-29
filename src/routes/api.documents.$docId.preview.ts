import { createFileRoute } from "@tanstack/react-router";

function inlineFileName(fileName: string) {
  const asciiName = fileName.replaceAll('"', "'").replace(/[^\x20-\x7E]/g, "_");
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export const Route = createFileRoute("/api/documents/$docId/preview")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { requireAuth } = await import("@/lib/pleng/auth.server");
          const { previewFile, previewFileFromToken } =
            await import("@/lib/pleng/documents.server");
          const url = new URL(request.url);
          const token = url.searchParams.get("token");
          const file = token
            ? await previewFileFromToken(params.docId, token)
            : await previewFile(await requireAuth(request), params.docId);

          const headers = new Headers({
            "content-type": file.mimeType,
            "content-disposition": inlineFileName(file.fileName),
            "cache-control": "private, max-age=300",
          });
          if (file.contentLength) headers.set("content-length", String(file.contentLength));
          return new Response(file.bytes, { headers });
        } catch (error) {
          const { fail } = await import("@/lib/pleng/http.server");
          return fail(error);
        }
      },
    },
  },
});
