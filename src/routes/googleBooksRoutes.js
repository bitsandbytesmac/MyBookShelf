
import express from "express";

import {
    searchGoogleBooks
} from "../controllers/googleBooksController.js";

const router = express.Router();

// Search Google Books
router.get("/search", searchGoogleBooks);

export default router;
