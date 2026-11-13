import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { clearSessionCookie } from "../utils/session.js";
import { deleteAllCoversForUser } from "../services/coverStorage.js";

// DELETE /api/auth/account  { password }
// Permanently removes the signed-in user, their books, activity, reset links and uploaded covers.
export async function deleteAccount(req, res) {
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!password) {
        return res.status(400).json({ message: "Enter your password to confirm.", status: "error" });
    }

    const userId = req.user.id;
    let client;

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
        await client.query("DELETE FROM books WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM password_resets WHERE user_id = $1", [userId]);
        await client.query("DELETE FROM users WHERE id = $1", [userId]);

        await client.query("COMMIT");
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Account deletion failed:", error);
        return res.status(500).json({ message: "Couldn't delete your account. Please try again.", status: "error" });
    } finally {
        client?.release();
    }

    // The account is gone either way; a leftover image shouldn't fail the request.
    try {
        await deleteAllCoversForUser(userId);
    } catch (error) {
        console.error("Account deleted, but removing cover images failed:", error);
    }

    clearSessionCookie(res);
    res.json({ message: "Your account and everything in it has been deleted.", status: "success" });
}
