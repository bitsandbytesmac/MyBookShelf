import pool from "../config/db.js";
import { isCalendarDate, readerToday } from "../utils/dates.js";

// GET - the user's latest reading sessions (journal entries), newest day first
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
                session_date,
                note,
                created_at
             FROM reading_activities
             WHERE user_id = $1
             ORDER BY session_date DESC, created_at DESC
             LIMIT 30`,
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
        // "Today" is the reader's own date (?today=YYYY-MM-DD) when it is plausible, not the server's UTC date.
        const day = readerToday(req.query.today);
        const statistics = await pool.query(
            `SELECT
                COALESCE(SUM(pages_read) FILTER (WHERE session_date = COALESCE($2::date, CURRENT_DATE)), 0) AS pages_today,
                COALESCE(SUM(pages_read) FILTER (WHERE session_date >= DATE_TRUNC('week', COALESCE($2::date, CURRENT_DATE))), 0) AS pages_this_week,
                COALESCE(SUM(pages_read) FILTER (WHERE session_date >= DATE_TRUNC('month', COALESCE($2::date, CURRENT_DATE))), 0) AS pages_this_month
             FROM reading_activities
             WHERE user_id = $1`,
            [req.user.id, day]
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

        // Every day with a session in the last ~13 months: the dashboard's streak and calendar.
        const days = await pool.query(
            `SELECT DISTINCT session_date
             FROM reading_activities
             WHERE user_id = $1 AND session_date >= COALESCE($2::date, CURRENT_DATE) - 400
             ORDER BY session_date DESC`,
            [req.user.id, day]
        );

        res.json({
            message: "Reading statistics retrieved successfully!",
            status: "success",
            data: {
                pagesToday: Number(statistics.rows[0].pages_today),
                pagesThisWeek: Number(statistics.rows[0].pages_this_week),
                pagesThisMonth: Number(statistics.rows[0].pages_this_month),
                mostReadBook: mostReadBook.rows[0] || null,
                readingDays: days.rows.map((r) => r.session_date)
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

// ---------- Reading Recap (Statistics page) ----------
// Both endpoints read the same reading_activities rows as the streak (readingDays above), so a day that
// counts toward the streak is always a day with entries in the recap, and the other way round.
// Every row is a snapshot of one session (title, pages before/after, the day it happened), so the history
// stays the same when the book's current progress changes later.

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

// GET /api/activities/recap?month=YYYY-MM - one row per day with entries in that month.
export async function getMonthRecap(req, res) {
    const m = MONTH_RE.exec(typeof req.query.month === "string" ? req.query.month : "");
    if (!m || Number(m[1]) < 1900 || Number(m[1]) > 2200) {
        return res.status(400).json({ message: "Month must look like YYYY-MM.", status: "error" });
    }
    const month = `${m[1]}-${m[2]}`;

    try {
        const [days, first] = await Promise.all([
            pool.query(
                `SELECT session_date,
                        COUNT(*)::int AS entries,
                        COALESCE(SUM(pages_read), 0)::int AS pages,
                        COUNT(DISTINCT book_id)::int AS books
                 FROM reading_activities
                 WHERE user_id = $1
                   AND session_date >= $2::date
                   AND session_date < ($2::date + INTERVAL '1 month')
                 GROUP BY session_date
                 ORDER BY session_date`,
                [req.user.id, `${month}-01`]
            ),
            pool.query("SELECT MIN(session_date) AS first_date FROM reading_activities WHERE user_id = $1", [req.user.id])
        ]);

        const list = days.rows.map((r) => ({ date: r.session_date, entries: r.entries, pages: r.pages, books: r.books }));
        res.json({
            message: "Reading recap retrieved successfully!",
            status: "success",
            data: {
                month,
                firstDate: first.rows[0]?.first_date || null,
                days: list,
                totals: {
                    days: list.length,
                    entries: list.reduce((s, d) => s + d.entries, 0),
                    pages: list.reduce((s, d) => s + d.pages, 0)
                }
            }
        });
    } catch (error) {
        console.error("Error retrieving the reading recap:", error);
        res.status(500).json({ message: "Failed to retrieve your reading recap.", status: "error" });
    }
}

// GET /api/activities/recap/:date - every entry logged for that day, oldest first, with the book's cover.
export async function getDayRecap(req, res) {
    const { date } = req.params;
    if (!isCalendarDate(date)) {
        return res.status(400).json({ message: "Date must be a real date like 2026-11-15.", status: "error" });
    }

    try {
        const result = await pool.query(
            `SELECT a.id, a.book_id, a.book_title, a.previous_page, a.current_page, a.pages_read,
                    a.session_date, a.note, a.created_at,
                    b.title AS title, b.author, b.cover_url, b.total_pages
             FROM reading_activities a
             LEFT JOIN books b ON b.id = a.book_id AND b.user_id = a.user_id
             WHERE a.user_id = $1 AND a.session_date = $2::date
             ORDER BY a.created_at ASC, a.id ASC`,
            [req.user.id, date]
        );

        const entries = result.rows.map((r) => ({
            id: String(r.id),
            bookId: r.book_id === null ? null : String(r.book_id),
            // The title as it is now; the snapshot taken at the time if the book is gone.
            title: r.title || r.book_title,
            author: r.author || "",
            coverUrl: r.cover_url || "",
            totalPages: r.total_pages === null || r.total_pages === undefined ? null : Number(r.total_pages),
            previousPage: r.previous_page,
            currentPage: r.current_page,
            pagesRead: r.pages_read || 0,
            sessionDate: r.session_date,
            note: r.note || "",
            createdAt: r.created_at
        }));

        res.json({
            message: "Reading recap retrieved successfully!",
            status: "success",
            data: { date, entries, pages: entries.reduce((s, e) => s + e.pagesRead, 0) }
        });
    } catch (error) {
        console.error("Error retrieving the day's reading:", error);
        res.status(500).json({ message: "Failed to retrieve that day's reading.", status: "error" });
    }
}

// ---------- Editing and deleting a journal note (book page, Reading progress) ----------

const NOTE_MAX = 20000; // same limit as a note written in "Log your reading"
const ENTRY_ID = /^\d{1,18}$/;

// PUT /api/activities/:id/note  { note } - change the note of one of the reader's own journal entries.
export async function updateEntryNote(req, res) {
    if (!ENTRY_ID.test(req.params.id)) return res.status(400).json({ message: "That journal entry doesn't exist.", status: "error" });
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
    if (!note) return res.status(400).json({ message: "Write a note, or delete it instead.", status: "error" });
    if (note.length > NOTE_MAX) return res.status(400).json({ message: `The note is too long (max ${NOTE_MAX} characters).`, status: "error" });

    try {
        const result = await pool.query(
            "UPDATE reading_activities SET note = $1 WHERE id = $2 AND user_id = $3 RETURNING id, note",
            [note, req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ message: "That journal entry doesn't exist.", status: "error" });
        res.json({ message: "Note updated.", status: "success", data: { id: String(result.rows[0].id), note: result.rows[0].note } });
    } catch (error) {
        console.error("Error updating a journal note:", error);
        res.status(500).json({ message: "Failed to update the note.", status: "error" });
    }
}

// DELETE /api/activities/:id/note - remove the note. An entry that also logged pages keeps them (they're
// reading history: the streak, the recap and the page totals count them); a note-only entry is removed.
export async function deleteEntryNote(req, res) {
    if (!ENTRY_ID.test(req.params.id)) return res.status(400).json({ message: "That journal entry doesn't exist.", status: "error" });
    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        const entry = await client.query(
            "SELECT pages_read FROM reading_activities WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [req.params.id, req.user.id]
        );
        if (!entry.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "That journal entry doesn't exist.", status: "error" });
        }
        const keepsPages = Number(entry.rows[0].pages_read) > 0;
        if (keepsPages) await client.query("UPDATE reading_activities SET note = NULL WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
        else await client.query("DELETE FROM reading_activities WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
        await client.query("COMMIT");
        res.json({ message: "Note deleted.", status: "success", data: { id: String(req.params.id), entryDeleted: !keepsPages } });
    } catch (error) {
        await client?.query("ROLLBACK").catch(() => {});
        console.error("Error deleting a journal note:", error);
        res.status(500).json({ message: "Failed to delete the note.", status: "error" });
    } finally {
        client?.release();
    }
}
