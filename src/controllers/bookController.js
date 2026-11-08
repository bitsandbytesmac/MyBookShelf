
import pool from "../config/db.js";

// Validate book page information
function validatePageDetails(totalPages, currentPage) {
    const total = Number(totalPages);
    const current = Number(currentPage);

    if (!Number.isInteger(total) || total < 0) {
        return "Total pages must be a valid non-negative number.";
    }

    if (!Number.isInteger(current) || current < 0) {
        return "Current page must be a valid non-negative number.";
    }

    if (current > total) {
        return "Current page cannot exceed total pages.";
    }

    return null;
}

// GET - Retrieve all books belonging to the authenticated user
export async function getAllBooks(req, res) {
    try {
        const result = await pool.query(
            "SELECT * FROM books WHERE user_id = $1 ORDER BY id ASC",
            [req.user.id]
        );

        res.json({
            message: "Books retrieved successfully!",
            status: "success",
            data: result.rows
        });

    } catch (error) {
        console.error("Error retrieving books:", error);

        res.status(500).json({
            message: "Failed to retrieve books.",
            status: "error"
        });
    }
}

// POST - Add a new book
export async function addBook(req, res) {
    try {
        const {
            title,
            author,
            genre,
            status,
            totalPages,
            currentPage,
            completedAt
        } = req.body;

        if (!title || !author || !genre || !status) {
            return res.status(400).json({
                message: "Please provide all required book details.",
                status: "error"
            });
        }

        const pageError = validatePageDetails(totalPages, currentPage);

        if (pageError) {
            return res.status(400).json({
                message: pageError,
                status: "error"
            });
        }

        const result = await pool.query(
            `INSERT INTO books (
                id, title, author, genre, status,
                total_pages, current_page, completed_at, user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *`,
            [
                Date.now(),
                title,
                author,
                genre,
                status,
                Number(totalPages),
                Number(currentPage),
                completedAt || null,
                req.user.id
            ]
        );

        res.status(201).json({
            message: "Book added successfully!",
            status: "success",
            data: result.rows[0]
        });

    } catch (error) {
        console.error("Error adding book:", error);

        res.status(500).json({
            message: "Failed to add book.",
            status: "error"
        });
    }
}

// PUT - Update a book belonging to the authenticated user
export async function updateBook(req, res) {
    try {
        const bookId = req.params.id;

        const {
            title,
            author,
            genre,
            status,
            totalPages,
            currentPage,
            completedAt
        } = req.body;

        if (!title || !author || !genre || !status) {
            return res.status(400).json({
                message: "Please provide all required book details.",
                status: "error"
            });
        }

        const pageError = validatePageDetails(totalPages, currentPage);

        if (pageError) {
            return res.status(400).json({
                message: pageError,
                status: "error"
            });
        }

        const updatedBook = await pool.query(
            `UPDATE books
             SET
                title = $1,
                author = $2,
                genre = $3,
                status = $4,
                total_pages = $5,
                current_page = $6,
                completed_at = $7
             WHERE id = $8 AND user_id = $9
             RETURNING *`,
            [
                title,
                author,
                genre,
                status,
                Number(totalPages),
                Number(currentPage),
                completedAt || null,
                bookId,
                req.user.id
            ]
        );

        if (updatedBook.rows.length === 0) {
            return res.status(404).json({
                message: "Book not found.",
                status: "error"
            });
        }

        res.json({
            message: "Book updated successfully!",
            status: "success",
            data: updatedBook.rows[0]
        });

    } catch (error) {
        console.error("Error updating book:", error);

        res.status(500).json({
            message: "Failed to update book.",
            status: "error"
        });
    }
}

// DELETE - Remove a book belonging to the authenticated user
export async function deleteBook(req, res) {
    try {
        const bookId = req.params.id;

        const deletedBook = await pool.query(
            "DELETE FROM books WHERE id = $1 AND user_id = $2 RETURNING *",
            [bookId, req.user.id]
        );

        if (deletedBook.rows.length === 0) {
            return res.status(404).json({
                message: "Book not found.",
                status: "error"
            });
        }

        res.json({
            message: "Book deleted successfully!",
            status: "success",
            data: deletedBook.rows[0]
        });

    } catch (error) {
        console.error("Error deleting book:", error);

        res.status(500).json({
            message: "Failed to delete book.",
            status: "error"
        });
    }
}
