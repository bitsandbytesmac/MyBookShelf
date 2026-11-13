import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getTheme, updateTheme } from "../controllers/themeController.js";

const router = express.Router();

router.get("/", authenticateToken, getTheme);
router.put("/", authenticateToken, updateTheme);

export default router;
