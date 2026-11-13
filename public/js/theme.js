// Theme presets, custom background colour, and the Customize dialog.
// The look is saved to the user's account and cached in localStorage for theme-boot.js.
import { api } from "./api.js";
import { h, modal, toast } from "./ui.js";

// Keep ids in sync with style.css [data-theme] blocks and src/controllers/themeController.js.
// `preview` only colours the little sample cards in the dialog.
export const PRESETS = [
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

const DEFAULT_THEME = { preset: "cream", background: null };
const HEX = /^#[0-9a-f]{6}$/i;

function clean(theme) {
    return {
        preset: PRESETS.some((p) => p.id === theme?.preset) ? theme.preset : "cream",
        background: typeof theme?.background === "string" && HEX.test(theme.background) ? theme.background.toLowerCase() : null
    };
}

export function currentTheme() {
    try {
        return clean(JSON.parse(localStorage.getItem("theme")));
    } catch {
        return { ...DEFAULT_THEME };
    }
}

export function applyTheme(theme) {
    window.mbsApplyTheme?.(clean(theme));
}

export function rememberTheme(theme) {
    const value = clean(theme);
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
        if (error.status !== 401) console.warn("Couldn't load your saved theme:", error.message);
    }
}

// ---------- Contrast check for custom backgrounds ----------

function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function toHex(color) {
    const m = color.trim().match(/^#([0-9a-f]{6})$/i) || color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    if (m.length === 2) return `#${m[1]}`;
    return `#${m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

// ---------- Customize dialog ----------

export function openCustomize() {
    const original = currentTheme();
    let draft = { ...original };
    let saved = false;

    const presetButtons = PRESETS.map((preset) => {
        const p = preset.preview;
        return h("button", {
            type: "button", class: "theme-option", role: "radio", dataset: { preset: preset.id },
            onclick: () => update({ preset: preset.id })
        },
            h("span", { class: "theme-sample", style: { background: p.bg }, "aria-hidden": "true" },
                h("span", { class: "theme-sample-card", style: { background: p.surface } },
                    h("span", { class: "theme-sample-line", style: { background: p.text } }),
                    h("span", { class: "theme-sample-line short", style: { background: p.text } }),
                    h("span", { class: "theme-sample-row" },
                        h("span", { class: "theme-sample-pill", style: { background: p.accent } }),
                        h("span", { class: "theme-sample-dot", style: { background: p.soft } }))
                )
            ),
            h("span", { class: "theme-name" }, preset.name)
        );
    });

    const swatch = (label, value) => h("button", {
        type: "button", class: `swatch${value ? "" : " swatch-default"}`, role: "radio",
        title: label, "aria-label": `${label} background`, dataset: { value: value || "" },
        style: value ? { background: value } : null,
        onclick: () => update({ background: value })
    }, value ? null : "Aa");

    const swatches = [swatch("Theme default", null), ...BACKGROUNDS.map((b) => swatch(b.name, b.value))];

    const picker = h("input", {
        type: "color", class: "color-input", id: "customBg", "aria-label": "Custom background colour",
        oninput: (event) => update({ background: event.target.value.toLowerCase() })
    });

    const bgValue = h("span", { class: "bg-value" });
    const warning = h("p", { class: "contrast-warning", role: "status" });

    function update(change) {
        draft = clean({ ...draft, ...change });
        applyTheme(draft); // live preview behind the dialog
        render();
    }

    function render() {
        for (const btn of presetButtons) btn.setAttribute("aria-checked", String(btn.dataset.preset === draft.preset));

        const known = draft.background === null || BACKGROUNDS.some((b) => b.value === draft.background);
        for (const btn of swatches) btn.setAttribute("aria-checked", String((btn.dataset.value || null) === draft.background));
        picker.classList.toggle("active", !known);
        picker.value = draft.background || toHex(getComputedStyle(document.documentElement).getPropertyValue("--bg")) || "#fff9d6";

        bgValue.textContent = draft.background ? draft.background.toUpperCase() : "Matches the theme";

        warning.textContent = "";
        if (draft.background) {
            // Check the page's main and secondary text colours (headings and subtitles sit on the background).
            const style = getComputedStyle(document.documentElement);
            const texts = ["--text", "--text-2"].map((name) => toHex(style.getPropertyValue(name))).filter(Boolean);
            if (texts.some((text) => contrast(draft.background, text) < 4.5)) {
                warning.textContent = "Headings may be hard to read on this colour. Try a lighter one, or the Night theme for dark backgrounds.";
            }
        }
    }

    const m = modal({
        title: "Customize your shelf",
        submitLabel: "Save look",
        body: h("div", { class: "stack customize" },
            h("p", { class: "sub" }, "Changes preview right away. Your choice is saved to your account, so it follows you to any device."),
            h("div", { class: "field" },
                h("span", { class: "label", id: "themeLabel" }, "Theme"),
                h("div", { class: "theme-options", role: "radiogroup", "aria-labelledby": "themeLabel" }, presetButtons)
            ),
            h("div", { class: "field" },
                h("div", { class: "label-row" },
                    h("span", { class: "label", id: "bgLabel" }, "Background colour"),
                    bgValue),
                h("div", { class: "swatches", role: "radiogroup", "aria-labelledby": "bgLabel" },
                    swatches,
                    h("label", { class: "swatch-custom", title: "Pick any colour" }, picker, h("span", {}, "Custom"))
                ),
                warning
            ),
            h("button", { type: "button", class: "link-btn reset-look", onclick: () => update({ ...DEFAULT_THEME }) }, "Reset to default")
        ),
        initialFocus: presetButtons.find((b) => b.dataset.preset === draft.preset),
        async onSubmit() {
            const result = await api.updateTheme(draft);
            saved = true;
            rememberTheme(result);
            toast("Your new look is saved");
        }
    });

    // Closed without saving: put the previous look back.
    m.dialog.addEventListener("close", () => {
        if (!saved) applyTheme(original);
    });

    render();
}
