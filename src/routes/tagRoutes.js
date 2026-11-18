import express from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { getHiddenTags, updateHiddenTags } from "../controllers/tagController.js";

const router = express.Router();

router.get("/hidden", authenticateToken, getHiddenTags);
router.put("/hidden", authenticateToken, updateHiddenTags);

export default router;
