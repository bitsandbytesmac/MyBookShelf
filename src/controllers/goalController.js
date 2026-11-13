import pool from "../config/db.js";

// GET - the user's monthly and yearly reading goals
export async function getGoals(req, res) {
    try {
        const result = await pool.query(
            "SELECT monthly_goal, yearly_goal FROM users WHERE id = $1",
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "User not found.", status: "error" });
        }

        res.json({
            status: "success",
            data: {
                monthlyGoal: result.rows[0].monthly_goal,
                yearlyGoal: result.rows[0].yearly_goal
            }
        });
    } catch (error) {
        console.error("Error retrieving goals:", error);
        res.status(500).json({ message: "Failed to retrieve reading goals.", status: "error" });
    }
}

// PUT - update monthly and/or yearly goal
export async function updateGoals(req, res) {
    const { monthlyGoal, yearlyGoal } = req.body || {};

    const valid = (n, max) => Number.isInteger(n) && n >= 1 && n <= max;

    if (monthlyGoal !== undefined && !valid(monthlyGoal, 100)) {
        return res.status(400).json({ message: "Monthly goal must be between 1 and 100 books.", status: "error" });
    }
    if (yearlyGoal !== undefined && !valid(yearlyGoal, 1000)) {
        return res.status(400).json({ message: "Yearly goal must be between 1 and 1000 books.", status: "error" });
    }

    try {
        const result = await pool.query(
            `UPDATE users
             SET monthly_goal = COALESCE($1, monthly_goal),
                 yearly_goal  = COALESCE($2, yearly_goal)
             WHERE id = $3
             RETURNING monthly_goal, yearly_goal`,
            [monthlyGoal ?? null, yearlyGoal ?? null, req.user.id]
        );

        res.json({
            status: "success",
            data: {
                monthlyGoal: result.rows[0].monthly_goal,
                yearlyGoal: result.rows[0].yearly_goal
            }
        });
    } catch (error) {
        console.error("Error updating goals:", error);
        res.status(500).json({ message: "Failed to update reading goals.", status: "error" });
    }
}

// ---------- Custom goals ("read 5 classics this year", "3,000 pages this month") ----------

const GOAL_METRICS = ["books", "pages"];
const GOAL_PERIODS = ["month", "year"];
const GOAL_FILTERS = ["genre", "format", "age"];
const MAX_CUSTOM_GOALS = 30;

function toCustomGoal(row) {
    return {
        id: String(row.id),
        title: row.title || "",
        metric: row.metric,
        period: row.period,
        target: row.target,
        filterType: row.filter_type || null,
        filterValue: row.filter_value || null
    };
}

// Returns { values: [title, metric, period, target, filterType, filterValue] } or { error }.
function parseCustomGoal(body = {}) {
    const { metric, period, target } = body;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const filterType = body.filterType || null;
    const filterValue = typeof body.filterValue === "string" ? body.filterValue.trim() : "";

    if (title.length > 100) return { error: "Goal name is too long (max 100 characters)." };
    if (!GOAL_METRICS.includes(metric)) return { error: "Choose books or pages." };
    if (!GOAL_PERIODS.includes(period)) return { error: "Choose this month or this year." };
    const max = metric === "pages" ? 1000000 : 1000;
    if (!Number.isInteger(target) || target < 1 || target > max) {
        return { error: `Target must be a whole number from 1 to ${max.toLocaleString("en-US")}.` };
    }
    if (filterType !== null && !GOAL_FILTERS.includes(filterType)) return { error: "That filter isn't supported." };
    if (filterType && !filterValue) return { error: "Pick which one to count." };
    if (filterValue.length > 60) return { error: "Filter is too long (max 60 characters)." };

    return { values: [title || null, metric, period, target, filterType, filterType ? filterValue : null] };
}

const fail = (res, status, message) => res.status(status).json({ message, status: "error" });

export async function listCustomGoals(req, res) {
    try {
        const result = await pool.query("SELECT * FROM reading_goals WHERE user_id = $1 ORDER BY id", [req.user.id]);
        res.json({ status: "success", data: result.rows.map(toCustomGoal) });
    } catch (error) {
        console.error("Error retrieving custom goals:", error);
        fail(res, 500, "Failed to retrieve your goals.");
    }
}

export async function createCustomGoal(req, res) {
    const { values, error } = parseCustomGoal(req.body);
    if (error) return fail(res, 400, error);

    try {
        const count = await pool.query("SELECT COUNT(*)::int AS n FROM reading_goals WHERE user_id = $1", [req.user.id]);
        if (count.rows[0].n >= MAX_CUSTOM_GOALS) return fail(res, 400, `You can have up to ${MAX_CUSTOM_GOALS} goals.`);

        const result = await pool.query(
            `INSERT INTO reading_goals (user_id, title, metric, period, target, filter_type, filter_value)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user.id, ...values]
        );
        res.status(201).json({ status: "success", data: toCustomGoal(result.rows[0]) });
    } catch (err) {
        console.error("Error creating custom goal:", err);
        fail(res, 500, "Failed to save the goal.");
    }
}

export async function updateCustomGoal(req, res) {
    const { values, error } = parseCustomGoal(req.body);
    if (error) return fail(res, 400, error);

    try {
        const result = await pool.query(
            `UPDATE reading_goals
             SET title = $1, metric = $2, period = $3, target = $4, filter_type = $5, filter_value = $6
             WHERE id = $7 AND user_id = $8 RETURNING *`,
            [...values, req.params.id, req.user.id]
        );
        if (!result.rows.length) return fail(res, 404, "Goal not found.");
        res.json({ status: "success", data: toCustomGoal(result.rows[0]) });
    } catch (err) {
        console.error("Error updating custom goal:", err);
        fail(res, 500, "Failed to save the goal.");
    }
}

export async function deleteCustomGoal(req, res) {
    try {
        const result = await pool.query("DELETE FROM reading_goals WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.user.id]);
        if (!result.rows.length) return fail(res, 404, "Goal not found.");
        res.json({ status: "success", data: { id: String(result.rows[0].id) } });
    } catch (err) {
        console.error("Error deleting custom goal:", err);
        fail(res, 500, "Failed to delete the goal.");
    }
}
