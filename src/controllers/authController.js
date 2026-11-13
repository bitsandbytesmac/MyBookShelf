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
        const { username, email, password } = req.body;

        // Check required fields
        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Please provide username, email, and password.",
                status: "error"
            });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Save user in PostgreSQL
        const newUser = await pool.query(
            `INSERT INTO users (id, username, email, password)
             VALUES ($1, $2, $3, $4)
             RETURNING id, username, email, created_at`,
            [
                Date.now(),
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

    // Handle duplicate username or email.
    if (error.code === "23505") {

        let message = "Username or email already exists.";

        if (error.constraint === "users_username_key") {
            message = "Username already exists. Please choose another.";
        }

        if (error.constraint === "users_email_key") {
            message = "Email already exists. Please use another email.";
        }

        return res.status(409).json({
            message,
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
        const { email, password } = req.body;

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password.",
                status: "error"
            });
        }

        // Find user by email
        const result = await pool.query(
            "SELECT * FROM users WHERE email = $1",
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