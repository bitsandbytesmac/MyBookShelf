// Theme presets and custom background colour (same as public/js/theme.js).
// The look is saved to the user's account and cached in localStorage for theme-boot.js, which applies
// it before first paint and exposes window.mbsApplyTheme. Keep preset ids in sync with style.css
// [data-theme] blocks, public/js/theme-boot.js (and its client/public copy) and src/controllers/themeController.js.
import { api } from "../../api";
import type { Theme, ThemePreset } from "../../api/types";

declare global {
    interface Window { mbsApplyTheme?: (theme: Theme) => void }
}

// `preview` only colours the little sample cards in the dialog.
export const PRESETS: { id: ThemePreset; name: string; preview: { bg: string; surface: string; accent: string; soft: string; text: string } }[] = [
    { id: "cream", name: "Cream", preview: { bg: "#FFF9D6", surface: "#fffdf4", accent: "#D8A2A2", soft: "#FFDCDC", text: "#463232" } },
    { id: "blush", name: "Blush", preview: { bg: "#ffeceb", surface: "#fffaf8", accent: "#D8A2A2", soft: "#e8efd9", text: "#463232" } },
    { id: "sage", name: "Sage", preview: { bg: "#eef3e2", surface: "#fbfdf5", accent: "#D8A2A2", soft: "#dfe9cb", text: "#34392b" } },
    { id: "lavender", name: "Lavender", preview: { bg: "#f3eefb", surface: "#fdfbff", accent: "#b9a2dd", soft: "#e7dcf8", text: "#3a3346" } },
    { id: "night", name: "Night", preview: { bg: "#1f1a1b", surface: "#2a2324", accent: "#D8A2A2", soft: "#4a3334", text: "#f3e7e2" } }
];

export const BACKGROUNDS = [
    { name: "Cream", value: "#fff9d6" },
    { name: "Blush", value: "#ffdcdc" },
    { name: "Peach", value: "#fbe9d9" },
    { name: "Sage", value: "#e8efd9" },
    { name: "Mist", value: "#e3eef2" },
    { name: "Lilac", value: "#efe7fa" },
    { name: "Linen", value: "#f4efe6" },
    { name: "Cocoa", value: "#2a2324" }
];

export const DEFAULT_THEME: Theme = { preset: "cream", background: null };
const HEX = /^#[0-9a-f]{6}$/i;

export function cleanTheme(theme: Partial<Theme> | null | undefined): Theme {
    return {
        preset: PRESETS.some((p) => p.id === theme?.preset) ? theme!.preset! : "cream",
        background: typeof theme?.background === "string" && HEX.test(theme.background) ? theme.background.toLowerCase() : null
    };
}

export function currentTheme(): Theme {
    try {
        return cleanTheme(JSON.parse(localStorage.getItem("theme") || "null"));
    } catch {
        return { ...DEFAULT_THEME };
    }
}

export function applyTheme(theme: Theme) {
    window.mbsApplyTheme?.(cleanTheme(theme));
}

export function rememberTheme(theme: Theme) {
    const value = cleanTheme(theme);
    try {
        localStorage.setItem("theme", JSON.stringify(value));
    } catch {
        /* storage blocked: the theme still applies for this visit */
    }
    applyTheme(value);
}

// Pick up changes made on another device.
export async function syncTheme() {
    try {
        rememberTheme(await api.getTheme());
    } catch (error) {
        if ((error as { status?: number }).status !== 401) console.warn("Couldn't load your saved theme:", (error as Error).message);
    }
}

// ---------- Contrast check for custom backgrounds ----------

function luminance(hex: string): number {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

export function toHex(color: string): string | null {
    const m = color.trim().match(/^#([0-9a-f]{6})$/i) || color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    if (m.length === 2) return `#${m[1]}`;
    return `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}
