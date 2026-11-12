import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pool from "../config/db.js";
import { sendMail } from "../services/mailer.js";

const TOKEN_TTL_MINUTES = 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MIN_PASSWORD_LENGTH = 8;

const GENERIC_MESSAGE = "If an account exists for that email, we've sent a link to reset your password.";

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Base URL used in emailed links. Never derived from the request's Host header,
// which an attacker could spoof to point the link at their own site.
function appUrl() {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    return `http://localhost:${process.env.PORT || 3000}`;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function resetEmail(username, link) {
    const name = username || "there";
    const text = [
        `Hi ${name},`,
        "",
        "We received a request to reset your MyBookShelf password.",
        `Open this link to choose a new one (it expires in ${TOKEN_TTL_MINUTES} minutes):`,
        "",
        link,
        "",
        "If you didn't ask for this, you can ignore this email; your password won't change."
    ].join("\n");

    const html = `
<div style="background:#FFF9D6;padding:32px 16px;font-family:Nunito,Segoe UI,Arial,sans-serif;color:#463232">
  <div style="max-width:480px;margin:0 auto;background:#fffdf4;border:1px solid #eedfc0;border-radius:16px;padding:32px">
    <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 16px">Reset your password</h1>
    <p style="margin:0 0 12px">Hi ${escapeHtml(name)},</p>
    <p style="margin:0 0 24px">We received a request to reset your MyBookShelf password. This link expires in ${TOKEN_TTL_MINUTES} minutes.</p>
    <p style="margin:0 0 24px;text-align:center">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#D8A2A2;color:#3d2626;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:999px">Choose a new password</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#6f5656">Or copy this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#9c5858">${escapeHtml(link)}</p>
    <p style="margin:0;font-size:13px;color:#6f5656">If you didn't ask for this, you can ignore this email; your password won't change.</p>
  </div>
</div>`;

    return { text, html };
}

// POST /api/auth/forgot-password  { email }
// Always answers the same way so it can't be used to discover registered emails.
export async function requestPasswordReset(req, res) {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

    if (!email) {
        return res.status(400).json({ message: "Please enter your email address.", status: "error" });
    }

    try {
        const userResult = await pool.query(
            "SELECT id, username, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
            [email]
        );
        const user = userResult.rows[0];

        if (user) {
            // Throttle repeat requests for the same account.
            const recent = await pool.query(
                `SELECT 1 FROM password_resets
                 WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)
                 LIMIT 1`,
                [user.id, RESEND_COOLDOWN_SECONDS]
            );

            if (recent.rows.length === 0) {
                const token = crypto.randomBytes(32).toString("hex");

                // A new link replaces any earlier unused ones.
                await pool.query("DELETE FROM password_resets WHERE user_id = $1", [user.id]);
                await pool.query(
                    `INSERT INTO password_resets (user_id, token_hash, expires_at)
                     VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
                    [user.id, hashToken(token), TOKEN_TTL_MINUTES]
                );

                const link = `${appUrl()}/reset-password.html?token=${token}`;
                const { text, html } = resetEmail(user.username, link);

                await sendMail({ to: user.email, subject: "Reset your MyBookShelf password", text, html });
            }
        }

        res.json({ message: GENERIC_MESSAGE, status: "success" });
    } catch (error) {
        console.error("Password reset request failed:", error);
        res.status(500).json({ message: "We couldn't send the reset email. Please try again later.", status: "error" });
    }
}

// POST /api/auth/reset-password  { token, password }
export async function resetPassword(req, res) {
    const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!/^[a-f0-9]{64}$/.test(token)) {
        return res.status(400).json({ message: "This reset link is invalid. Please request a new one.", status: "error" });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, status: "error" });
    }
    if (password.length > 200) {
        return res.status(400).json({ message: "Password is too long.", status: "error" });
    }

    let client;

    try {
        client = await pool.connect();
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT id, user_id FROM password_resets
             WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
             FOR UPDATE`,
            [hashToken(token)]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "This reset link has expired or was already used. Please request a new one.", status: "error" });
        }

        const { id, user_id: userId } = result.rows[0];
        const hashedPassword = await bcrypt.hash(password, 10);

        // Bumping token_version signs the account out on every device.
        await client.query(
            "UPDATE users SET password = $1, token_version = token_version + 1 WHERE id = $2",
            [hashedPassword, userId]
        );
        await client.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [id]);
        await client.query("DELETE FROM password_resets WHERE user_id = $1 AND id <> $2", [userId, id]);

        await client.query("COMMIT");

        res.json({ message: "Your password has been updated and you've been signed out everywhere. You can log in now.", status: "success" });
    } catch (error) {
        if (client) await client.query("ROLLBACK").catch(() => {});
        console.error("Password reset failed:", error);
        res.status(500).json({ message: "Failed to reset password. Please try again.", status: "error" });
    } finally {
        client?.release();
    }
}
