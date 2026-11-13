import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { readSessionToken, clearSessionCookie } from "../utils/session.js";

function deny(res, message = "Invalid or expired token.") {
    clearSessionCookie(res);
    return res.status(401).json({ message, status: "error" });
}

// Verify the session cookie, and that it hasn't been revoked by a password reset.
export async function authenticateToken(req, res, next) {
    const token = readSessionToken(req);

    if (!token) return res.status(401).json({ message: "Access denied. No token provided.", status: "error" });

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return deny(res);
    }

    try {
        const result = await pool.query("SELECT token_version FROM users WHERE id = $1", [decoded.id]);

        // Account deleted, or the token was issued before the latest password reset.
        if (result.rows.length === 0 || (decoded.tv ?? 0) !== result.rows[0].token_version) {
            return deny(res, "Your session has ended. Please log in again.");
        }
    } catch (error) {
        console.error("Session check failed:", error);
        return res.status(500).json({ message: "Something went wrong.", status: "error" });
    }

    req.user = decoded;
    next();
}
