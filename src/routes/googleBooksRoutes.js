
import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";

import {
    searchGoogleBooks
} from "../controllers/googleBooksController.js";

const router = express.Router();

// Search Google Books. Requires login: the server adds our API key to every search,
// so an open endpoint would let anyone spend the key's quota.
router.get("/search", authenticateToken, searchGoogleBooks);

export default router;
