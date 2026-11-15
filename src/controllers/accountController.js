import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { clearSessionCookie } from "../utils/session.js";
import { deleteUnusedCovers } from "../services/coverStorage.js";

// DELETE /api/auth/account  { password }
// Permanently removes the signed-in user, their books, activity, reset links and uploaded covers.
export async function deleteAccount(req, res) {
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!password) {
        return res.status(400).json({ message: "Enter your password to confirm.", status: "error" });
    }

    const userId = req.user.id;
    let client;
    let coverUrls = [];

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const userResult = await client.query("SELECT password FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (userResult.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Account not found.", status: "error" });
        }

        // 400, not 401: a 401 would make the app log the user out.
        if (!(await bcrypt.compare(password, userResult.rows[0].password))) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "That password isn't right.", status: "error" });
        }

        // Foreign keys cascade, but delete explicitly so this never depends on them.
        await client.query("DELETE FROM reading_activities WHERE user_id = $1", [userId]);
        const books = await client.query("DELETE FROM books WHERE user_id = $1 RETURNING cover_url", [userId]);
        coverUrls = books.rows.map((r) => r.cover_url);
        await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM reading_goals WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM challenges WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        await client.query("COMMIT");
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Account deletion failed:", error);
        return res.status(500).json({ message: "Couldn't delete your account. Please try again.", status: "error" });
    } finally {
        client?.release();
    }

    // Delete the uploaded covers the books used. Deleting is free on Vercel Blob; listing the user's
    // folder instead would cost a paid "advanced operation" on every account deletion. Never throws.
    await deleteUnusedCovers(coverUrls, userId);

    clearSessionCookie(res);
    res.json({ message: "Your account and everything in it has been deleted.", status: "success" });
}
