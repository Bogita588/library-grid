import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim();
  const projectRoot = __dirname;

  return {
    root: path.resolve(projectRoot, "frontend"),
    envDir: projectRoot,
    publicDir: path.resolve(projectRoot, "public"),
    plugins: [react(), tailwindcss(), tsconfigPaths()],
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "src"),
      },
    },
    server: {
      fs: {
        allow: [projectRoot],
      },
      proxy: apiProxyTarget
        ? {
            "/api": {
              target: apiProxyTarget,
              changeOrigin: true,
              secure: false,
              configure: (proxy) => {
                proxy.on("proxyRes", (proxyRes) => {
                  const setCookie = proxyRes.headers["set-cookie"];
                  if (!setCookie) return;
                  proxyRes.headers["set-cookie"] = setCookie.map((cookie) =>
                    cookie.replace(/;\s*Secure/gi, ""),
                  );
                });
              },
            },
          }
        : undefined,
    },
    build: {
      outDir: path.resolve(projectRoot, "dist"),
      emptyOutDir: true,
    },
  };
});
