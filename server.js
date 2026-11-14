import express from 'express';
import dotenv from 'dotenv';
import bookRoutes from "./src/routes/bookRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import { authenticateToken } from "./src/middleware/authMiddleware.js";
import googleBooksRoutes from "./src/routes/googleBooksRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";
import activityRoutes from "./src/routes/activityRoutes.js";
import goalRoutes from "./src/routes/goalRoutes.js";
import themeRoutes from "./src/routes/themeRoutes.js";
import challengeRoutes from "./src/routes/challengeRoutes.js";
import nextUpRoutes from "./src/routes/nextUpRoutes.js";
import { sameOriginOnly } from "./src/utils/session.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Force HTTPS in production. Vercel handles TLS and tells us the original scheme in x-forwarded-proto.
// (Static pages get the same headers from vercel.json.)
app.disable("x-powered-by");
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    if (process.env.NODE_ENV === "production") {
        if (req.headers["x-forwarded-proto"] === "http") {
            return res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
        }
        // Tell browsers to only ever use HTTPS for this site (2 years).
        res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    }
    next();
});

// Middleware
app.use(express.json());

// Logins live in a cookie now, so refuse change requests that come from other websites.
app.use("/api", sameOriginOnly);

// Serve frontend files
app.use(express.static('public'));

// Serve the homepage when users visit the root URL
app.get("/", (req, res) => {
    res.redirect("/index.html");
});

// First API endpoint
app.get('/api/health', (req, res) => {
    res.json({
        message: 'MyBookShelf API is running!',
        status: 'success'
    });
});

// Protected test endpoint
app.get("/api/protected", authenticateToken, (req, res) => {
    res.json({
        message: "Access granted! You are authenticated.",
        status: "success",
        user: req.user
    });
});


//REOUTES
app.use("/api/books", bookRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/google-books", googleBooksRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/theme", themeRoutes);
app.use("/api/challenges", challengeRoutes);
app.use("/api/next-up", nextUpRoutes);

// Start server locally
if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`MyBookShelf running at http://localhost:${PORT}`);
    });
}

// Unknown API routes return JSON instead of an HTML page
app.use("/api", (req, res) => {
    res.status(404).json({ status: "error", message: "Route not found" });
});

// Central error handler (must come after all routes)
app.use((err, req, res, next) => {
    // Upload problems (too big, wrong type) are the user's to fix, not server errors.
    if (err.name === "MulterError") {
        const message = err.code === "LIMIT_FILE_SIZE" ? "That image is too large (max 4 MB)." : "That upload couldn't be read.";
        return res.status(400).json({ status: "error", message });
    }
    if (err.status !== 400) console.error(err);
    const status = err.status || 500;
    res.status(status).json({
        status: "error",
        message: status < 500 ? err.message : "Something went wrong"
    });
});

// Export Express app for Vercel
export default app;