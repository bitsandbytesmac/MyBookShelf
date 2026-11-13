import express from "express";
import { registerUser, loginUser, logoutUser } from "../controllers/authController.js";
import { requestPasswordReset, resetPassword } from "../controllers/passwordResetController.js";
import { deleteAccount } from "../controllers/accountController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Register a new user
router.post("/register", registerUser);

// Login an existing user
router.post("/login", loginUser);

// Clear the session cookie
router.post("/logout", logoutUser);

// Email a password reset link
router.post("/forgot-password", requestPasswordReset);

// Set a new password using a reset link
router.post("/reset-password", resetPassword);

// Permanently delete the signed-in user's account
router.delete("/account", authenticateToken, deleteAccount);

export default router;
