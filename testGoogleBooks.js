
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GOOGLE_BOOKS_API_KEY;

if (!apiKey) {
    console.log("Google Books API key not found!");
    process.exit(1);
}

const url = new URL(
    "https://www.googleapis.com/books/v1/volumes"
);

url.searchParams.set("q", "Atomic Habits");
url.searchParams.set("key", apiKey);

const response = await fetch(url);
const result = await response.json();

console.log("HTTP Status:", response.status);

if (!response.ok) {
    console.log("API Error:", result.error?.message);
} else {
    console.log("Books found:", result.totalItems);
    console.log(
        "First book:",
        result.items?.[0]?.volumeInfo?.title
    );
}
