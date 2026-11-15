import express from "express";
import { getReadingActivities, getReadingStatistics, getMonthRecap, getDayRecap } from "../controllers/activityController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateToken, getReadingActivities);
router.get("/statistics", authenticateToken, getReadingStatistics);
router.get("/recap", authenticateToken, getMonthRecap);
router.get("/recap/:date", authenticateToken, getDayRecap);

export default router;