import { saveCover, blobConfigured } from "../services/coverStorage.js";

// POST /api/uploads/cover  (multipart, field "cover")
// The browser already shrinks the image; here we check it's a real image and store it on Vercel Blob.
export async function uploadBookCover(req, res) {
    if (!req.file) {
        return res.status(400).json({ message: "Please select a book cover image.", status: "error" });
    }
    if (!blobConfigured()) {
        console.error("Cover upload failed: BLOB_READ_WRITE_TOKEN is not set.");
        return res.status(500).json({ message: "Cover uploads aren't set up yet.", status: "error" });
    }

    try {
        const coverUrl = await saveCover(req.user.id, req.file.buffer);
        res.status(201).json({ message: "Book cover uploaded successfully!", status: "success", data: { coverUrl } });
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message, status: "error" });
        console.error("Book cover upload failed:", error);
        res.status(500).json({ message: "Failed to upload book cover.", status: "error" });
    }
}
