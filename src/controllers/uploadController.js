import cloudinary from "../config/cloudinary.js";
import { Readable } from "stream";

export async function uploadBookCover(req, res) {
    try {
        // Check if an image was uploaded
        if (!req.file) {
            return res.status(400).json({
                message: "Please select a book cover image.",
                status: "error"
            });
        }

        // Upload image to Cloudinary
        const uploadResult = await new Promise((resolve, reject) => {

            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: "mybookshelf/covers",
                    resource_type: "image"
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );

            Readable.from(req.file.buffer).pipe(uploadStream);
        });

        // Return the uploaded image URL
        res.status(201).json({
            message: "Book cover uploaded successfully!",
            status: "success",
            data: {
                coverUrl: uploadResult.secure_url
            }
        });

    } catch (error) {
        console.error("Book cover upload failed:", error);

        res.status(500).json({
            message: "Failed to upload book cover.",
            status: "error"
        });
    }
}