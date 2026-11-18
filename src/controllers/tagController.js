import pool from "../config/db.js";

// The categories a reader deleted from her own lists of choices (users.hidden_tags). Deleting one only
// takes it off the list: books that already have it keep it, and typing it again brings it back.
export const TAG_KINDS = ["genres", "subgenres", "tropes", "contentWarnings"];
const MAX_PER_KIND = 500;
const MAX_LENGTH = 60;

// Only known kinds and short, unique strings are stored or sent back.
export function cleanHidden(value) {
    const out = {};
    for (const kind of TAG_KINDS) {
        const list = Array.isArray(value?.[kind]) ? value[kind] : [];
        out[kind] = [...new Set(list.filter((v) => typeof v === "string").map((v) => v.trim()).filter((v) => v && v.length <= MAX_LENGTH))]
            .slice(0, MAX_PER_KIND);
    }
    return out;
}

// GET /api/tags/hidden
export async function getHiddenTags(req, res) {
    try {
        const result = await pool.query("SELECT hidden_tags FROM users WHERE id = $1", [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "User not found.", status: "error" });
        res.json({ status: "success", data: cleanHidden(result.rows[0].hidden_tags) });
    } catch (error) {
        console.error("Error retrieving hidden categories:", error);
        res.status(500).json({ message: "Failed to load your categories.", status: "error" });
    }
}

// PUT /api/tags/hidden  { genres: [...], subgenres: [...], tropes: [...], contentWarnings: [...] }
export async function updateHiddenTags(req, res) {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return res.status(400).json({ message: "Send the lists of deleted categories.", status: "error" });
    }
    for (const kind of TAG_KINDS) {
        const list = body[kind];
        if (list === undefined) continue;
        if (!Array.isArray(list) || list.length > MAX_PER_KIND || list.some((v) => typeof v !== "string" || v.trim().length > MAX_LENGTH)) {
            return res.status(400).json({ message: "That list of categories isn't valid.", status: "error" });
        }
    }
    const hidden = cleanHidden(body);
    try {
        await pool.query("UPDATE users SET hidden_tags = $1 WHERE id = $2", [JSON.stringify(hidden), req.user.id]);
        res.json({ status: "success", data: hidden });
    } catch (error) {
        console.error("Error saving hidden categories:", error);
        res.status(500).json({ message: "Failed to save your categories.", status: "error" });
    }
}
