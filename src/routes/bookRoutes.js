
import express from "express";

import {
    getAllBooks,
    addBook,
    updateBook,
    deleteBook
} from "../controllers/bookController.js";

const router = express.Router();

// GET - Retrieve all books
router.get("/", getAllBooks);

// POST - Add a new book
router.post("/", addBook);

// PUT - Update an existing book
router.put("/:id", updateBook);

export default router;

// DELETE - Remove an existing book
router.delete("/:id", deleteBook);
