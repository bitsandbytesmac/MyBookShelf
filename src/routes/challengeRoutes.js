import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { listChallenges, createChallenge, updateChallenge, deleteChallenge } from "../controllers/challengeController.js";

const router = express.Router();

router.get("/", authenticateToken, listChallenges);
router.post("/", authenticateToken, createChallenge);
router.put("/:id", authenticateToken, updateChallenge);
router.delete("/:id", authenticateToken, deleteChallenge);

export default router;
