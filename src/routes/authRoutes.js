import express from "express";
import { registerUser, loginUser } from "../controllers/authController.js";
import { requestPasswordReset, resetPassword } from "../controllers/passwordResetController.js";

const router = express.Router();

// Register a new user
router.post("/register", registerUser);

// Login an existing user
router.post("/login", loginUser);

// Email a password reset link
router.post("/forgot-password", requestPasswordReset);

// Set a new password using a reset link
router.post("/reset-password", resetPassword);

export default router;
