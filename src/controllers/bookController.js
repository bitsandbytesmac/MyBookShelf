import pool from "../config/db.js";
import { readerToday } from "../utils/dates.js";
import { deleteUnusedCovers } from "../services/coverStorage.js";

export const BOOK_STATUSES = ["To Be Read", "Reading", "Read", "DNF", "Paused"];
export const BOOK_FORMATS = ["Paperback", "Hardbound", "E-book", "Audiobook"];
export const BOOK_OWNERSHIP = ["Owned", "Borrowed", "Gifted"];
// "Age Demo" (several per book). The app offers the last three; Children and Middle Grade are still
// accepted because older books may have them.
export const AGE_DEMOS = ["Children", "Middle Grade", "Young Adult", "New Adult", "Adult"];

const LIMITS = { text: 300, summary: 10000, longText: 20000, tags: 20, labels: 40, tag: 60, quotes: 100, quote: 2000 };

// ---------- Validation ----------

function optionalText(value, max, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "string") return { error: `${label} must be text.` };
    const trimmed = value.trim();
    if (trimmed.length > max) return { error: `${label} is too long (max ${max} characters).` };
    return { value: trimmed || null };
}

function stringList(value, maxItems, maxLength, label) {
    if (value === undefined || value === null) return { value: [] };
    if (!Array.isArray(value)) return { error: `${label} must be a list.` };
    const cleaned = [...new Set(value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean))];
    if (cleaned.length > maxItems) return { error: `Too many ${label.toLowerCase()} (max ${maxItems}).` };
    if (cleaned.some((v) => v.length > maxLength)) return { error: `Each ${label.toLowerCase().replace(/s$/, "")} must be under ${maxLength} characters.` };
    return { value: cleaned };
}

function optionalChoice(value, choices, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (!choices.includes(value)) return { error: `${label} must be one of: ${choices.join(", ")}.` };
    return { value };
}

function choiceList(value, choices, label) {
    const r = stringList(value, choices.length, 60, label);
    if (r.error) return r;
    if (r.value.some((v) => !choices.includes(v))) return { error: `${label} must be from: ${choices.join(", ")}.` };
    return r;
}

// A Goodreads page, e.g. https://www.goodreads.com/review/show/123. "goodreads.com/..." gets https:// added.
// Only http(s) links on goodreads.com are kept, so the link on the book page is always safe to open.
function goodreadsUrl(value) {
    if (value === undefined || value === null || String(value).trim() === "") return { value: null };
    if (typeof value !== "string" || value.trim().length > 500) return { error: "The Goodreads link is too long." };
    const text = value.trim();
    let url;
    try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return { error: "The Goodreads link must be a web address, like https://www.goodreads.com/review/show/…" };
    }
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || !(host === "goodreads.com" || host.endsWith(".goodreads.com"))) {
        return { error: "That isn't a Goodreads link. It should start with https://www.goodreads.com/" };
    }
    return { value: url.href };
}

// How many chapters the book has (1-999), or none. Chapters are numbered 1..chapterCount.
function chapterNumber(value, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 999) return { error: `${label} must be a whole number from 1 to 999.` };
    return { value: n };
}

function optionalScore(value, label) {
    if (value === undefined || value === null || value === "" || value === 0) return { value: null };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) return { error: `${label} must be between 1 and 5.` };
    return { value: n };
}

function optionalDate(value, label) {
    if (value === undefined || value === null || value === "") return { value: null };
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
        return { error: `${label} must be a valid date.` };
    }
    return { value };
}

// Position in a series: positive, up to 2 decimals (1.5 for a novella between books 1 and 2).
function seriesNumber(value) {
    if (value === undefined || value === null || value === "") return { value: null };
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > 9999 || Math.abs(Math.round(n * 100) - n * 100) > 1e-6) {
        return { error: "Series number must be a positive number like 1, 2 or 1.5." };
    }
    return { value: n };
}

// How many books the whole series has (1-999), so progress can read "1 of 6".
function seriesTotal(value) {
    if (value === undefined || value === null || value === "") return { value: null };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 999) return { error: "Books in series must be a whole number from 1 to 999." };
    return { value: n };
}

// Year of publication (from Google Books or the reader).
function publishedYear(value) {
    if (value === undefined || value === null || value === "") return { value: null };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 2200) return { error: "Published year must be a year like 1999." };
    return { value: n };
}

function pageNumber(value, label) {
    if (value === undefined || value === null || value === "") return { value: 0 };
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 100000) return { error: `${label} must be a whole number.` };
    return { value: n };
}

// Turns a request body into column values, or returns the first validation error.
function parseBook(body = {}) {
    const values = {};
    const checks = {
        title: optionalText(body.title, LIMITS.text, "Title"),
        author: optionalText(body.author, LIMITS.text, "Author"),
        summary: optionalText(body.summary, LIMITS.summary, "Summary"),
        cover_url: optionalText(body.coverUrl, 2000, "Cover URL"),
        series: optionalText(body.series, 200, "Series"),
        series_number: seriesNumber(body.seriesNumber),
        series_total: seriesTotal(body.seriesTotal),
        genres: stringList(body.genres, LIMITS.tags, LIMITS.tag, "Genres"),
        subgenres: stringList(body.subgenres, LIMITS.tags, LIMITS.tag, "Sub-genres"),
        format: optionalChoice(body.format, BOOK_FORMATS, "Format"),
        ownership: optionalChoice(body.ownership, BOOK_OWNERSHIP, "Ownership"),
        age_demos: choiceList(body.ageDemos, AGE_DEMOS, "Age Demo"),
        setting: optionalText(body.setting, 1000, "Setting"),
        goodreads_url: goodreadsUrl(body.goodreadsUrl),
        tropes: stringList(body.tropes, LIMITS.labels, LIMITS.tag, "Tropes"),
        content_warnings: stringList(body.contentWarnings, LIMITS.labels, LIMITS.tag, "Content warnings"),
        published_year: publishedYear(body.publishedYear),
        chapter_count: chapterNumber(body.chapterCount, "Chapters"),
        status: optionalChoice(body.status || "To Be Read", BOOK_STATUSES, "Book status"),
        total_pages: pageNumber(body.totalPages, "Total pages"),
        current_page: pageNumber(body.currentPage, "Current page"),
        rating: optionalScore(body.rating, "Rating"),
        spice: optionalScore(body.spice, "Spice"),
        quotes: stringList(body.quotes, LIMITS.quotes, LIMITS.quote, "Quotes"),
        review: optionalText(body.review, LIMITS.longText, "Review"),
        personal_notes: optionalText(body.notes, LIMITS.longText, "Notes"),
        date_started: optionalDate(body.dateStarted, "Date started"),
        date_finished: optionalDate(body.dateFinished, "Date finished")
    };

    for (const [column, result] of Object.entries(checks)) {
        if (result.error) return { error: result.error };
        values[column] = result.value;
    }

    if (!values.title) return { error: "Please provide a title." };
    if (!values.author) return { error: "Please provide an author." };
    if (values.series_number !== null && !values.series) return { error: "Add the series name for this book number." };
    if (values.series_total !== null && !values.series) return { error: "Add the series name for the number of books in it." };

    if (values.total_pages > 0 && values.current_page > values.total_pages) {
        return { error: "Current page cannot exceed total pages." };
    }
    if (values.date_started && values.date_finished && values.date_finished < values.date_started) {
        return { error: "Date finished can't be before date started." };
    }

    values.is_favorite = Boolean(body.isFavorite);
    values.reviewed = Boolean(body.reviewed);
    values.journaled = Boolean(body.journaled);
    values.is_physical = Boolean(body.isPhysical);              // shown in Physical Books
    values.is_reread = Boolean(body.isReread);
    values.age_category = values.age_demos[0] || null;          // legacy single-value column
    values.genre = values.genres[0] || "";                     // legacy single-genre column
    values.completed_at = values.date_finished;                 // legacy completion column

    return { values };
}

const COLUMNS = [
    "title", "author", "summary", "cover_url", "series", "series_number", "series_total", "genres", "subgenres",
    "format", "ownership", "age_category", "age_demos", "tropes", "content_warnings", "setting", "goodreads_url", "published_year", "status",
    "total_pages", "current_page", "rating", "spice", "quotes", "review", "personal_notes",
    "chapter_count", "date_started", "date_finished", "is_favorite", "reviewed", "journaled", "is_physical", "is_reread", "genre", "completed_at"
];

// The series total belongs to the whole series, so copy it to the user's other books in the same series.
async function syncSeriesTotal(db, userId, values) {
    if (!values.series) return;
    await db.query(
        `UPDATE books SET series_total = $1
         WHERE user_id = $2 AND LOWER(series) = LOWER($3) AND series_total IS DISTINCT FROM $1`,
        [values.series_total, userId, values.series]
    );
}

function sendError(res, status, message) {
    return res.status(status).json({ message, status: "error" });
}

// ---------- Handlers ----------

// GET - all books belonging to the authenticated user
export async function getAllBooks(req, res) {
    try {
        const result = await pool.query(
            "SELECT * FROM books WHERE user_id = $1 ORDER BY id DESC",
            [req.user.id]
        );
        res.json({ message: "Books retrieved successfully!", status: "success", data: result.rows });
    } catch (error) {
        console.error("Error retrieving books:", error);
        sendError(res, 500, "Failed to retrieve books.");
    }
}

// POST - add a new book
export async function addBook(req, res) {
    const { values, error } = parseBook(req.body);
    if (error) return sendError(res, 400, error);

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        // The id comes from books_id_seq (migration 008).
        const columns = ["user_id", ...COLUMNS];
        const params = [req.user.id, ...COLUMNS.map((c) => values[c])];
        const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");

        const result = await client.query(
            `INSERT INTO books (${columns.join(", ")}) VALUES (${placeholders}) RETURNING *`,
            params
        );
        await syncSeriesTotal(client, req.user.id, values);

        await client.query("COMMIT");
        res.status(201).json({ message: "Book added successfully!", status: "success", data: result.rows[0] });
    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Error adding book:", err);
        sendError(res, 500, "Failed to add book.");
    } finally {
        client?.release();
    }
}

// Optional journal entry sent with a book update by "Log your reading": the day it happened and a note.
// Returns { date, note } (both may be null) or { error }.
function parseSession(body = {}) {
    const date = optionalDate(body.sessionDate, "Session date");
    if (date.error) return { error: date.error };
    // A day of slack for time zones ahead of the server.
    const latest = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
    if (date.value && date.value > latest) return { error: "The reading date can't be in the future." };
    const note = optionalText(body.sessionNote, LIMITS.longText, "Note");
    if (note.error) return { error: note.error };
    const chapter = chapterNumber(body.sessionChapter, "Chapter");
    if (chapter.error) return { error: chapter.error };
    // The reader's own date, used when no session date was picked (see utils/dates.js).
    return { date: date.value, note: note.value, chapter: chapter.value, today: readerToday(body.localDate) };
}

// PUT - replace a book's details (the client always sends the full book)
export async function updateBook(req, res) {
    const { values, error } = parseBook(req.body);
    if (error) return sendError(res, 400, error);
    const session = parseSession(req.body);
    if (session.error) return sendError(res, 400, session.error);

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const existing = await client.query(
            "SELECT current_page, cover_url, status FROM books WHERE id = $1 AND user_id = $2 FOR UPDATE",
            [req.params.id, req.user.id]
        );

        if (existing.rows.length === 0) {
            await client.query("ROLLBACK");
            return sendError(res, 404, "Book not found.");
        }

        const previousPage = Number(existing.rows[0].current_page) || 0;
        const previousStatus = existing.rows[0].status;

        // Chapters: a chapter with notes can't disappear, and a note can only go under a chapter the book has.
        const noted = await client.query(
            "SELECT MAX(chapter) AS max FROM reading_activities WHERE book_id = $1 AND user_id = $2 AND note IS NOT NULL",
            [req.params.id, req.user.id]
        );
        const highest = Number(noted.rows[0].max) || 0;
        if (highest && (values.chapter_count === null || values.chapter_count < highest)) {
            await client.query("ROLLBACK");
            return sendError(res, 400, `Chapter ${highest} has notes, so the book needs at least ${highest} chapters.`);
        }
        if (session.chapter && (values.chapter_count === null || session.chapter > values.chapter_count)) {
            await client.query("ROLLBACK");
            return sendError(res, 400, values.chapter_count ? `This book has ${values.chapter_count} chapters.` : "Add the number of chapters in Edit details first.");
        }
        const assignments = COLUMNS.map((c, i) => `${c} = $${i + 1}`).join(", ");
        const params = [...COLUMNS.map((c) => values[c]), req.params.id, req.user.id];

        const updated = await client.query(
            `UPDATE books SET ${assignments}
             WHERE id = $${COLUMNS.length + 1} AND user_id = $${COLUMNS.length + 2}
             RETURNING *`,
            params
        );

        // Log a reading session (journal entry) whenever the page count goes up, or a note was written.
        // Exception: marking a never-started (To Be Read) book as Read just records a book read in the past
        // (e.g. one added after finishing it). Its page jumps to the end, but that isn't reading done today,
        // so it must not create an entry or count toward the streak. An explicit "Log your reading" still does.
        const finishedBefore = previousStatus === "To Be Read" && values.status === "Read" && !session.date && !session.note;
        if ((values.current_page > previousPage && !finishedBefore) || session.note) {
            await client.query(
                `INSERT INTO reading_activities (user_id, book_id, book_title, previous_page, current_page, pages_read, session_date, note, chapter)
                 VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::date, $9::date, CURRENT_DATE), $8, $10)`,
                [req.user.id, req.params.id, values.title, previousPage, values.current_page,
                    Math.max(0, values.current_page - previousPage), session.date, session.note, session.today,
                    // A chapter only goes with a note (it says what the note is about).
                    session.note ? session.chapter : null]
            );
        }

        await syncSeriesTotal(client, req.user.id, values);

        await client.query("COMMIT");

        // Cover replaced or removed: delete the old image file (only ever this user's own uploads).
        const oldCover = existing.rows[0].cover_url;
        if (oldCover && oldCover !== values.cover_url) await deleteUnusedCovers([oldCover], req.user.id);

        res.json({ message: "Book updated successfully!", status: "success", data: updated.rows[0] });
    } catch (err) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Error updating book:", err);
        sendError(res, 500, "Failed to update book.");
    } finally {
        client?.release();
    }
}

// DELETE - remove a book
export async function deleteBook(req, res) {
    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");

        // Its journal entries go too (the foreign key would only blank their book link, so they'd linger in
        // Most Recent Entries and keep counting toward the streak).
        await client.query("DELETE FROM reading_activities WHERE book_id = $1 AND user_id = $2", [req.params.id, req.user.id]);

        const deleted = await client.query(
            "DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING id, cover_url",
            [req.params.id, req.user.id]
        );
        if (deleted.rows.length === 0) {
            await client.query("ROLLBACK");
            return sendError(res, 404, "Book not found.");
        }

        const { cover_url: cover, ...data } = deleted.rows[0];

        // Free any challenge spot this book filled (the spot stays, empty).
        await client.query(
            `UPDATE challenges
             SET items = (
                 SELECT COALESCE(jsonb_agg(
                     CASE WHEN item->>'bookId' = $1 THEN item || '{"bookId": null}'::jsonb ELSE item END
                     ORDER BY ord), '[]'::jsonb)
                 FROM jsonb_array_elements(items) WITH ORDINALITY AS t(item, ord)),
                 updated_at = NOW()
             WHERE user_id = $2 AND items @> jsonb_build_array(jsonb_build_object('bookId', $1::text))`,
            [String(data.id), req.user.id]
        );

        await client.query("COMMIT");

        await deleteUnusedCovers([cover], req.user.id);
        res.json({ message: "Book deleted successfully!", status: "success", data });
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Error deleting book:", error);
        sendError(res, 500, "Failed to delete book.");
    } finally {
        client?.release();
    }
}
