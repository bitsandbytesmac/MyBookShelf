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
