import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

// The frontend (React + TypeScript). `npm run build:client` writes the finished site into public/,
// which is what Vercel serves for an Express project (express.static is ignored there). public/ is
// generated: never edit it by hand. In development, `npm run dev` serves client/ through this config
// from inside Express (see server.js), with instant reload.
export default defineConfig({
    root: here,
    plugins: [react()],
    build: {
        outDir: "../public",
        emptyOutDir: true,
        // Same page URLs as before: the app, the four sign-in pages and the two legal pages.
        rollupOptions: {
            input: Object.fromEntries(
                ["index", "login", "register", "forgot-password", "reset-password", "privacy", "terms"]
                    .map((page) => [page, `${here}${page}.html`])
            )
        }
    }
});
