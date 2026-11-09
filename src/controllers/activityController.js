import pool from "../config/db.js";

// GET - Retrieve reading activities belonging to the authenticated user
export async function getReadingActivities(req, res) {
    try {
        const activities = await pool.query(
            `SELECT
                id,
                book_id,
                book_title,
                previous_page,
                current_page,
                pages_read,
                created_at
             FROM reading_activities
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 20`,
            [req.user.id]
        );

        res.json({
            message: "Reading activities retrieved successfully!",
            status: "success",
            data: activities.rows
        });

    } catch (error) {
        console.error("Error retrieving reading activities:", error);

        res.status(500).json({
            message: "Failed to retrieve reading activities.",
            status: "error"
        });
    }
}

// GET - Retrieve reading statistics belonging to the authenticated user
export async function getReadingStatistics(req, res) {
    try {
        const statistics = await pool.query(
            `SELECT
                COALESCE(SUM(pages_read) FILTER (
                    WHERE created_at >= CURRENT_DATE
                    AND created_at < CURRENT_DATE + INTERVAL '1 day'
                ), 0) AS pages_today,

                COALESCE(SUM(pages_read) FILTER (
                    WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)
                ), 0) AS pages_this_week,

                COALESCE(SUM(pages_read) FILTER (
                    WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
                ), 0) AS pages_this_month

             FROM reading_activities
             WHERE user_id = $1`,
            [req.user.id]
        );

        const mostReadBook = await pool.query(
            `SELECT
                book_title,
                SUM(pages_read) AS total_pages_read
             FROM reading_activities
             WHERE user_id = $1
             GROUP BY book_title
             ORDER BY total_pages_read DESC
             LIMIT 1`,
            [req.user.id]
        );

        res.json({
            message: "Reading statistics retrieved successfully!",
            status: "success",
            data: {
                pagesToday: Number(statistics.rows[0].pages_today),
                pagesThisWeek: Number(statistics.rows[0].pages_this_week),
                pagesThisMonth: Number(statistics.rows[0].pages_this_month),
                mostReadBook: mostReadBook.rows[0] || null
            }
        });

    } catch (error) {
        console.error("Error retrieving reading statistics:", error);

        res.status(500).json({
            message: "Failed to retrieve reading statistics.",
            status: "error"
        });
    }
}