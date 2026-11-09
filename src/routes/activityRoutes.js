import express from "express";
import { getReadingActivities,getReadingStatistics} from "../controllers/activityController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", authenticateToken, getReadingActivities);
router.get("/statistics", authenticateToken, getReadingStatistics);

export default router;