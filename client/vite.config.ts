import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));

// The React app (being migrated from public/js). Production still serves public/ until the cutover.
export default defineConfig({
    root: here,
    plugins: [react()],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        // Same page URLs as public/: the app, the four sign-in pages and the two legal pages.
        rollupOptions: {
            input: Object.fromEntries(
                ["index", "login", "register", "forgot-password", "reset-password", "privacy", "terms"]
                    .map((page) => [page, `${here}${page}.html`])
            )
        }
    },
    server: {
        port: 5173,
        // During the migration the stylesheet is imported straight from public/css (one copy only).
        fs: { allow: [projectRoot] },
        // The API is the Express server (npm run dev). Keep the browser's Host header: the server's
        // same-origin check compares Origin with Host, so changeOrigin must stay off.
        proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } }
    }
});
