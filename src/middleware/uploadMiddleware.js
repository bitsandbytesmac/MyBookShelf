import multer from "multer";
import { MAX_COVER_BYTES } from "../services/coverStorage.js";

// Store uploaded images temporarily in memory
const storage = multer.memoryStorage();

// Allow only supported image formats
function fileFilter(req, file, callback) {

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
        callback(null, true);
    } else {
        const error = new Error("Only JPG, PNG, and WEBP images are allowed.");
        error.status = 400;
        callback(error);
    }
}

// Configure Multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: MAX_COVER_BYTES,
        files: 1
    }
});

export default upload;