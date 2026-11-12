import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getGoals, updateGoals } from "../controllers/goalController.js";

const router = express.Router();

router.get("/", authenticateToken, getGoals);
router.put("/", authenticateToken, updateGoals);

export default router;
