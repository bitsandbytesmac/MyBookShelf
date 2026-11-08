import express from "express";
import upload from "../middleware/uploadMiddleware.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { uploadBookCover } from "../controllers/uploadController.js";

const router = express.Router();

// Upload a book cover
router.post(
    "/cover",
    authenticateToken,
    upload.single("cover"),
    uploadBookCover
);

export default router;