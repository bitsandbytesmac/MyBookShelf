import express from "express";
import { getReadingActivities, getReadingStatistics, getMonthRecap, getDayRecap, updateEntryNote, deleteEntryNote } from "../controllers/activityController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateToken, getReadingActivities);
router.get("/statistics", authenticateToken, getReadingStatistics);
router.get("/recap", authenticateToken, getMonthRecap);
router.get("/recap/:date", authenticateToken, getDayRecap);
router.put("/:id/note", authenticateToken, updateEntryNote);
router.delete("/:id/note", authenticateToken, deleteEntryNote);

export default router;