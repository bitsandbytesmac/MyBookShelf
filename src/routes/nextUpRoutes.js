import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getNextUp, updateNextUp } from "../controllers/nextUpController.js";

const router = express.Router();

router.get("/", authenticateToken, getNextUp);
router.put("/", authenticateToken, updateNextUp);

export default router;
