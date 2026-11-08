
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";

import {
    getAllBooks,
    addBook,
    updateBook,
    deleteBook
} from "../controllers/bookController.js";

const router = express.Router();

// Get all books
router.get("/", authenticateToken, getAllBooks);

// Add a book
router.post("/", authenticateToken, addBook);

// Update a book
router.put("/:id", authenticateToken, updateBook);

// Delete a book
router.delete("/:id", authenticateToken, deleteBook);

export default router;
