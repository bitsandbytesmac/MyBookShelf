import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cleanTheme } from "./themeController.js";
import { setSessionCookie, clearSessionCookie } from "../utils/session.js";

// Log out on this device: drop the session cookie.
export function logoutUser(req, res) {
    clearSessionCookie(res);
    res.json({ message: "Logged out.", status: "success" });
}

// Register a new user
export async function registerUser(req, res) {
    try {
        const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
        // Emails are stored lower-case so "Ana@x.com" and "ana@x.com" are the same account.
        const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";

        // Check required fields
        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Please provide username, email, and password.",
                status: "error"
            });
        }
        if (password.length < 8 || password.length > 200) {
            return res.status(400).json({ message: "Password must be 8 to 200 characters.", status: "error" });
        }
        if (username.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Please enter a valid name and email address.", status: "error" });
        }

        const existing = await pool.query("SELECT 1 FROM users WHERE LOWER(email) = $1 LIMIT 1", [email]);
        if (existing.rows.length) {
            return res.status(409).json({ message: "Email already exists. Please use another email.", status: "error" });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user in PostgreSQL (the id comes from users_id_seq, see migration 008)
        const newUser = await pool.query(
            `INSERT INTO users (username, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, username, email, created_at`,
            [
                username,
                email,
                hashedPassword
            ]
        );

        res.status(201).json({
            message: "User registered successfully!",
            status: "success",
            data: newUser.rows[0]
        });

    } catch (error) {

    // Handle duplicate username or email. Any other clash is a server problem, not the user's,
    // so it falls through to the 500 below instead of a misleading "already exists".
    const DUPLICATE_MESSAGES = {
        users_username_key: "Username already exists. Please choose another.",
        users_email_key: "Email already exists. Please use another email."
    };
    if (error.code === "23505" && DUPLICATE_MESSAGES[error.constraint]) {
        return res.status(409).json({
            message: DUPLICATE_MESSAGES[error.constraint],
            status: "error"
        });
    }

    console.error("Registration error:", error);

    return res.status(500).json({
        message: "Failed to register user.",
        status: "error"
    });
}

}

// Login an existing user
export async function loginUser(req, res) {
    try {
        const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password.",
                status: "error"
            });
        }

        // Find user by email
        const result = await pool.query(
            // Case-insensitive: phones often capitalise the first letter of the email.
            "SELECT * FROM users WHERE LOWER(email) = LOWER($1) ORDER BY id LIMIT 1",
            [email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password.",
                status: "error"
            });
        }

        const user = result.rows[0];

        // Compare entered password with stored hash
        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                message: "Invalid email or password.",
                status: "error"
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                tv: user.token_version ?? 0   // session version; see authMiddleware
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        // The token goes in an HttpOnly cookie, never in the response body.
        setSessionCookie(res, token);

        res.json({
            message: "Login successful!",
            status: "success",
            data: {
                id: user.id,
                username: user.username,
                email: user.email,
                theme: cleanTheme(user.theme)  // so the app opens in the user's look straight away
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Failed to login.",
            status: "error"
        });
    }
}