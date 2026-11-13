import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import {
    getGoals, updateGoals,
    listCustomGoals, createCustomGoal, updateCustomGoal, deleteCustomGoal
} from "../controllers/goalController.js";

const router = express.Router();

router.get("/", authenticateToken, getGoals);
router.put("/", authenticateToken, updateGoals);

router.get("/custom", authenticateToken, listCustomGoals);
router.post("/custom", authenticateToken, createCustomGoal);
router.put("/custom/:id", authenticateToken, updateCustomGoal);
router.delete("/custom/:id", authenticateToken, deleteCustomGoal);

export default router;
