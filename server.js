import express from 'express';
import dotenv from 'dotenv';
import bookRoutes from "./src/routes/bookRoutes.js";
import authRoutes from "./src/routes/authRoutes.js";
import { authenticateToken } from "./src/middleware/authMiddleware.js";
import googleBooksRoutes from "./src/routes/googleBooksRoutes.js";
import uploadRoutes from "./src/routes/uploadRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve frontend files
app.use(express.static('public'));

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

// Start server
app.listen(PORT, () => {
    console.log(`MyBookShelf running at http://localhost:${PORT}`);
});