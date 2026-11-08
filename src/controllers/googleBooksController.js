
export async function searchGoogleBooks(req, res) {
    try {
        const { q } = req.query;

        if (!q || !q.trim()) {
            return res.status(400).json({
                message: "Please provide a book title or author.",
                status: "error"
            });
        }

        const url = new URL(
            "https://www.googleapis.com/books/v1/volumes"
        );

        url.searchParams.set("q", q.trim());
        url.searchParams.set("maxResults", "10");
        url.searchParams.set(
            "key",
            process.env.GOOGLE_BOOKS_API_KEY
        );

        const response = await fetch(url);
        const result = await response.json();

        if (!response.ok) {
            console.error("Google Books API error:", result.error);

            return res.status(502).json({
                message: "Google Books search is currently unavailable.",
                status: "error"
            });
        }

        res.json({
            message: "Books retrieved successfully!",
            status: "success",
            totalItems: result.totalItems || 0,
            data: result.items || []
        });

    } catch (error) {
        console.error("Google Books search failed:", error);

        res.status(500).json({
            message: "Failed to search Google Books.",
            status: "error"
        });
    }
}
