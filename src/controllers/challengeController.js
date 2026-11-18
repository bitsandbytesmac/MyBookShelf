import pool from "../config/db.js";

// Reader-made reading challenges. A challenge has a name, a description ("what kind of challenge"),
// an optional date window, and a list of spots (prompts). Each spot can carry matching rules
// ("criteria") that the client-side matcher (public/js/challengeMatch.js) checks books against,
// and holds at most one book. Progress is derived on the client: a spot counts once its book is Read.

const LIMITS = { name: 120, description: 1000, items: 200, label: 200, tags: 20, tag: 60, author: 120 };
const MAX_CHALLENGES = 50;
const LIST_FIELDS = ["genres", "tropes", "themes", "settings", "characters"];
// Spot rules on "Age Demo" (the field is still called ageCategory in the rules). Older rules may use all five.
const AGE_CATEGORIES = ["Children", "Middle Grade", "Young Adult", "New Adult", "Adult"];
const FORMATS = ["Paperback", "Hardbound", "E-book", "Audiobook"];
const TITLE_MODES = ["startsWith", "contains"];

function toChallenge(row) {
    return {
        id: String(row.id),
        name: row.name,
        description: row.description || "",
        startsOn: row.starts_on || null,
        endsOn: row.ends_on || null,
        autoMatch: row.auto_match !== false,
        items: Array.isArray(row.items) ? row.items : [],
        createdAt: row.created_at
    };
}

function tagList(value, label) {
    if (value === undefined || value === null) return { value: [] };
    if (!Array.isArray(value)) return { error: `${label} must be a list.` };
    const cleaned = [...new Set(value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean))];
    if (cleaned.length > LIMITS.tags) return { error: `Too many ${label.toLowerCase()} in one spot (max ${LIMITS.tags}).` };
    if (cleaned.some((v) => v.length > LIMITS.tag)) return { error: `Each ${label.toLowerCase()} entry must be under ${LIMITS.tag} characters.` };
    return { value: cleaned };
}

function optionalInt(value, min, max, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) return { error: `${label} must be a whole number from ${min} to ${max}.` };
    return { value: n };
}

// A spot's matching rules. Unknown keys are dropped; an empty object means "choose books by hand".
function parseCriteria(raw) {
    if (raw === undefined || raw === null) return { value: null };
    if (typeof raw !== "object" || Array.isArray(raw)) return { error: "Spot rules must be an object." };

    const out = {};
    for (const field of LIST_FIELDS) {
        const r = tagList(raw[field], field[0].toUpperCase() + field.slice(1));
        if (r.error) return r;
        if (r.value.length) out[field] = r.value;
    }

    const choice = (field, allowed, label) => {
        const r = tagList(raw[field], label);
        if (r.error) return r;
        if (r.value.some((v) => !allowed.includes(v))) return { error: `${label} must be one of: ${allowed.join(", ")}.` };
        if (r.value.length) out[field] = r.value;
        return {};
    };
    for (const [field, allowed, label] of [["ageCategory", AGE_CATEGORIES, "Age Demo"], ["format", FORMATS, "Format"]]) {
        const r = choice(field, allowed, label);
        if (r.error) return r;
    }

    if (raw.title) {
        const mode = raw.title.mode;
        const value = typeof raw.title.value === "string" ? raw.title.value.trim() : "";
        if (!TITLE_MODES.includes(mode)) return { error: "Title rule must be 'starts with' or 'contains'." };
        if (value) {
            if (value.length > LIMITS.tag) return { error: `Title rule must be under ${LIMITS.tag} characters.` };
            out.title = { mode, value, ignoreArticles: raw.title.ignoreArticles !== false };
        }
    }

    if (raw.author !== undefined && raw.author !== null && raw.author !== "") {
        if (typeof raw.author !== "string" || raw.author.trim().length > LIMITS.author) return { error: "Author rule is too long." };
        if (raw.author.trim()) out.author = raw.author.trim();
    }

    for (const [field, min, max, label] of [
        ["minPages", 1, 100000, "Minimum pages"], ["maxPages", 1, 100000, "Maximum pages"],
        ["yearFrom", 0, 2200, "Published from"], ["yearTo", 0, 2200, "Published to"]
    ]) {
        const r = optionalInt(raw[field], min, max, label);
        if (r.error) return r;
        if (r.value !== null) out[field] = r.value;
    }
    if (out.minPages && out.maxPages && out.maxPages < out.minPages) return { error: "Maximum pages can't be less than minimum pages." };
    if (out.yearFrom !== undefined && out.yearTo !== undefined && out.yearTo < out.yearFrom) return { error: "'Published to' can't be before 'Published from'." };

    return { value: out };
}

function optionalDate(value, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return { error: `${label} must be a valid date.` };
    }
    return { value };
}

// Returns { values: { name, description, startsOn, endsOn, autoMatch, items } } or { error }.
function parseChallenge(body = {}) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";

    if (!name) return { error: "Give your challenge a name." };
    if (name.length > LIMITS.name) return { error: `Name is too long (max ${LIMITS.name} characters).` };
    if (description.length > LIMITS.description) return { error: `Description is too long (max ${LIMITS.description} characters).` };

    const startsOn = optionalDate(body.startsOn, "Start date");
    if (startsOn.error) return { error: startsOn.error };
    const endsOn = optionalDate(body.endsOn, "End date");
    if (endsOn.error) return { error: endsOn.error };
    if (startsOn.value && endsOn.value && endsOn.value < startsOn.value) return { error: "The end date can't be before the start date." };

    if (!Array.isArray(body.items)) return { error: "Spots must be a list." };
    if (!body.items.length) return { error: "Add at least one spot." };
    if (body.items.length > LIMITS.items) return { error: `Too many spots (max ${LIMITS.items}).` };

    const items = [];
    for (const raw of body.items) {
        const label = typeof raw?.label === "string" ? raw.label.trim() : "";
        if (!label) return { error: "Every spot needs a prompt." };
        if (label.length > LIMITS.label) return { error: `Each prompt must be under ${LIMITS.label} characters.` };
        const bookId = raw.bookId === null || raw.bookId === undefined || raw.bookId === "" ? null : String(raw.bookId);
        if (bookId !== null && !/^\d{1,19}$/.test(bookId)) return { error: "That book link isn't valid." };
        const criteria = parseCriteria(raw.criteria);
        if (criteria.error) return { error: `“${label}”: ${criteria.error}` };
        const assignedAt = typeof raw.assignedAt === "string" && !Number.isNaN(Date.parse(raw.assignedAt)) ? raw.assignedAt : null;

        const item = { label, bookId, done: Boolean(raw.done) };
        if (criteria.value) item.criteria = criteria.value;
        if (bookId && assignedAt) item.assignedAt = assignedAt;
        items.push(item);
    }

    return {
        values: {
            name, description: description || null,
            startsOn: startsOn.value, endsOn: endsOn.value,
            autoMatch: body.autoMatch !== false,
            items
        }
    };
}

// Only keep links to books this user owns.
async function dropForeignBooks(userId, items) {
    const ids = [...new Set(items.map((i) => i.bookId).filter(Boolean))];
    if (!ids.length) return items;
    const result = await pool.query("SELECT id::text AS id FROM books WHERE user_id = $1 AND id = ANY($2::bigint[])", [userId, ids]);
    const owned = new Set(result.rows.map((r) => r.id));
    return items.map((i) => {
        if (!i.bookId || owned.has(i.bookId)) return i;
        const { assignedAt, ...rest } = i;
        void assignedAt;
        return { ...rest, bookId: null };
    });
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
            `INSERT INTO challenges (user_id, name, description, starts_on, ends_on, auto_match, items)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user.id, values.name, values.description, values.startsOn, values.endsOn, values.autoMatch, JSON.stringify(items)]
        );
        res.status(201).json({ status: "success", data: toChallenge(result.rows[0]) });
    } catch (err) {
        console.error("Error creating challenge:", err);
        fail(res, 500, "Failed to save the challenge.");
    }
}

// PUT is a full replacement: the client sends every field and every spot.
export async function updateChallenge(req, res) {
    const { values, error } = parseChallenge(req.body);
    if (error) return fail(res, 400, error);

    try {
        const items = await dropForeignBooks(req.user.id, values.items);
        const result = await pool.query(
            `UPDATE challenges
             SET name = $1, description = $2, starts_on = $3, ends_on = $4, auto_match = $5, items = $6, updated_at = NOW()
             WHERE id = $7 AND user_id = $8 RETURNING *`,
            [values.name, values.description, values.startsOn, values.endsOn, values.autoMatch, JSON.stringify(items), req.params.id, req.user.id]
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
