import pool from "../config/db.js";

// "Next Up" on the dashboard: up to 3 of the user's To Be Read books, in the order they'll read them.
// Stored on users.next_up as book ids.

const MAX_NEXT_UP = 3;
const fail = (res, status, message) => res.status(status).json({ message, status: "error" });

export async function getNextUp(req, res) {
    try {
        const result = await pool.query("SELECT next_up FROM users WHERE id = $1", [req.user.id]);
        if (!result.rows.length) return fail(res, 404, "User not found.");
        res.json({ status: "success", data: { bookIds: (result.rows[0].next_up || []).map(String) } });
    } catch (error) {
        console.error("Error retrieving next up:", error);
        fail(res, 500, "Failed to retrieve your Next Up list.");
    }
}

// PUT { bookIds: ["123", ...] } replaces the list. Only the user's own books are kept.
export async function updateNextUp(req, res) {
    const raw = req.body?.bookIds;
    if (!Array.isArray(raw)) return fail(res, 400, "bookIds must be a list.");
    const ids = [...new Set(raw.map(String))];
    if (ids.length > MAX_NEXT_UP) return fail(res, 400, `Next Up holds up to ${MAX_NEXT_UP} books.`);
    if (ids.some((id) => !/^\d{1,19}$/.test(id))) return fail(res, 400, "That book link isn't valid.");

    try {
        const owned = ids.length
            ? new Set((await pool.query("SELECT id::text AS id FROM books WHERE user_id = $1 AND id = ANY($2::bigint[])", [req.user.id, ids])).rows.map((r) => r.id))
            : new Set();
        const kept = ids.filter((id) => owned.has(id));

        await pool.query("UPDATE users SET next_up = $1::bigint[] WHERE id = $2", [kept, req.user.id]);
        res.json({ status: "success", data: { bookIds: kept } });
    } catch (error) {
        console.error("Error updating next up:", error);
        fail(res, 500, "Failed to save your Next Up list.");
    }
}
