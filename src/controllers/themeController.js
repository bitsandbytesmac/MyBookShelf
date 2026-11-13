import pool from "../config/db.js";

// Keep in sync with the [data-theme] blocks in public/css/style.css.
export const PRESETS = ["cream", "blush", "sage", "lavender", "night"];
const DEFAULT_THEME = { preset: "cream", background: null };
const HEX = /^#[0-9a-f]{6}$/i;

// Accept only known values, so nothing unexpected is ever stored or sent back to the page.
export function cleanTheme(value) {
    const preset = PRESETS.includes(value?.preset) ? value.preset : DEFAULT_THEME.preset;
    const background = typeof value?.background === "string" && HEX.test(value.background)
        ? value.background.toLowerCase()
        : null;
    return { preset, background };
}

// GET /api/theme
export async function getTheme(req, res) {
    try {
        const result = await pool.query("SELECT theme FROM users WHERE id = $1", [req.user.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found.", status: "error" });
        }
        res.json({ status: "success", data: cleanTheme(result.rows[0].theme) });
    } catch (error) {
        console.error("Error retrieving theme:", error);
        res.status(500).json({ message: "Failed to load your theme.", status: "error" });
    }
}

// PUT /api/theme  { preset, background }
export async function updateTheme(req, res) {
    const { preset, background = null } = req.body || {};

    if (!PRESETS.includes(preset)) {
        return res.status(400).json({ message: "Please choose one of the available themes.", status: "error" });
    }
    if (background !== null && !(typeof background === "string" && HEX.test(background))) {
        return res.status(400).json({ message: "Background must be a colour like #FFF9D6.", status: "error" });
    }

    const theme = cleanTheme({ preset, background });

    try {
        await pool.query("UPDATE users SET theme = $1 WHERE id = $2", [JSON.stringify(theme), req.user.id]);
        res.json({ message: "Theme saved.", status: "success", data: theme });
    } catch (error) {
        console.error("Error saving theme:", error);
        res.status(500).json({ message: "Failed to save your theme.", status: "error" });
    }
}
