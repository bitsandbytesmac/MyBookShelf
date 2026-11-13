import pool from "../config/db.js";

// Reader-made reading challenges, e.g. "A to Z": a name, an optional description,
// and a list of prompts. Each prompt can be ticked off and/or linked to a book on the shelf.

const LIMITS = { name: 120, description: 1000, items: 200, label: 200 };
const MAX_CHALLENGES = 50;

function toChallenge(row) {
    return {
        id: String(row.id),
        name: row.name,
        description: row.description || "",
        items: Array.isArray(row.items) ? row.items : [],
        createdAt: row.created_at
    };
}

// Returns { values: { name, description, items } } or { error }.
function parseChallenge(body = {}) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!name) return { error: "Give your challenge a name." };
    if (name.length > LIMITS.name) return { error: `Name is too long (max ${LIMITS.name} characters).` };
    if (description.length > LIMITS.description) return { error: `Description is too long (max ${LIMITS.description} characters).` };
    if (!Array.isArray(body.items)) return { error: "Prompts must be a list." };
    if (!body.items.length) return { error: "Add at least one prompt." };
    if (body.items.length > LIMITS.items) return { error: `Too many prompts (max ${LIMITS.items}).` };

    const items = [];
    for (const raw of body.items) {
        const label = typeof raw?.label === "string" ? raw.label.trim() : "";
        if (!label) return { error: "Every prompt needs some text." };
        if (label.length > LIMITS.label) return { error: `Each prompt must be under ${LIMITS.label} characters.` };
        const bookId = raw.bookId === null || raw.bookId === undefined || raw.bookId === "" ? null : String(raw.bookId);
        if (bookId !== null && !/^\d{1,19}$/.test(bookId)) return { error: "That book link isn't valid." };
        items.push({ label, bookId, done: Boolean(raw.done) });
    }

    return { values: { name, description: description || null, items } };
}

// Only keep links to books this user owns.
async function dropForeignBooks(userId, items) {
    const ids = [...new Set(items.map((i) => i.bookId).filter(Boolean))];
    if (!ids.length) return items;
    const result = await pool.query("SELECT id::text AS id FROM books WHERE user_id = $1 AND id = ANY($2::bigint[])", [userId, ids]);
    const owned = new Set(result.rows.map((r) => r.id));
    return items.map((i) => (i.bookId && !owned.has(i.bookId) ? { ...i, bookId: null } : i));
}

const fail = (res, status, message) => res.status(status).json({ message, status: "error" });

export async function listChallenges(req, res) {
    try {
        const result = await pool.query("SELECT * FROM challenges WHERE user_id = $1 ORDER BY id DESC", [req.user.id]);
        res.json({ status: "success", data: result.rows.map(toChallenge) });
    } catch (error) {
        console.error("Error retrieving challenges:", error);
        fail(res, 500, "Failed to retrieve your challenges.");
    }
}

export async function createChallenge(req, res) {
    const { values, error } = parseChallenge(req.body);
    if (error) return fail(res, 400, error);

    try {
        const count = await pool.query("SELECT COUNT(*)::int AS n FROM challenges WHERE user_id = $1", [req.user.id]);
        if (count.rows[0].n >= MAX_CHALLENGES) return fail(res, 400, `You can have up to ${MAX_CHALLENGES} challenges.`);

        const items = await dropForeignBooks(req.user.id, values.items);
        const result = await pool.query(
            "INSERT INTO challenges (user_id, name, description, items) VALUES ($1, $2, $3, $4) RETURNING *",
            [req.user.id, values.name, values.description, JSON.stringify(items)]
        );
        res.status(201).json({ status: "success", data: toChallenge(result.rows[0]) });
    } catch (err) {
        console.error("Error creating challenge:", err);
        fail(res, 500, "Failed to save the challenge.");
    }
}

// PUT is a full replacement: the client sends the name, description and every prompt.
export async function updateChallenge(req, res) {
    const { values, error } = parseChallenge(req.body);
    if (error) return fail(res, 400, error);

    try {
        const items = await dropForeignBooks(req.user.id, values.items);
        const result = await pool.query(
            `UPDATE challenges SET name = $1, description = $2, items = $3, updated_at = NOW()
             WHERE id = $4 AND user_id = $5 RETURNING *`,
            [values.name, values.description, JSON.stringify(items), req.params.id, req.user.id]
        );
        if (!result.rows.length) return fail(res, 404, "Challenge not found.");
        res.json({ status: "success", data: toChallenge(result.rows[0]) });
    } catch (err) {
        console.error("Error updating challenge:", err);
        fail(res, 500, "Failed to save the challenge.");
    }
}

export async function deleteChallenge(req, res) {
    try {
        const result = await pool.query("DELETE FROM challenges WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.user.id]);
        if (!result.rows.length) return fail(res, 404, "Challenge not found.");
        res.json({ status: "success", data: { id: String(result.rows[0].id) } });
    } catch (err) {
        console.error("Error deleting challenge:", err);
        fail(res, 500, "Failed to delete the challenge.");
    }
}
