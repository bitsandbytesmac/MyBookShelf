import jwt from "jsonwebtoken";

// Verify user authentication
export function authenticateToken(req, res, next) {
    try {
        // Get token from request header
        const authHeader = req.headers.authorization;

        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                message: "Access denied. No token provided.",
                status: "error"
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Attach authenticated user to request
        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token.",
            status: "error"
        });
    }
}