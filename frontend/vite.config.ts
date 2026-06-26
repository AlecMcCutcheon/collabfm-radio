import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:4002";

  const proxy = {
    target: proxyTarget,
    changeOrigin: true,
    secure: proxyTarget.startsWith("https://"),
  };

  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "index.html"),
          join: resolve(__dirname, "join-required.html"),
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": proxy,
        "/auth": proxy,
      },
    },
  };
});
