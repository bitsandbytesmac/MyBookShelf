
const books = [
    {
        id: 1,
        title: "The Silent Patient",
        author: "Alex Michaelides",
        genre: "Fiction",
        status: "Completed",
        totalPages: 336,
        currentPage: 336,
        completedAt: null
    },
    {
        id: 2,
        title: "Atomic Habits",
        author: "James Clear",
        genre: "Self-help",
        status: "Reading",
        totalPages: 320,
        currentPage: 100,
        completedAt: null
    }
];

// GET - Retrieve all books
export function getAllBooks(req, res) {
    res.json({
        message: "Books retrieved successfully!",
        status: "success",
        data: books
    });
}

// POST - Add a new book
export function addBook(req, res) {
    console.log("Request body:", req.body);

    const {
        title,
        author,
        genre,
        status,
        totalPages,
        currentPage
    } = req.body;

    // Basic validation
    if (!title || !author || !genre || !status) {
        return res.status(400).json({
            message: "Please provide all required book details.",
            status: "error"
        });
    }

    const newBook = {
        id: Date.now(),
        title,
        author,
        genre,
        status,
        totalPages: Number(totalPages) || 0,
        currentPage: Number(currentPage) || 0,
        completedAt: null
    };

    books.push(newBook);

    res.status(201).json({
        message: "Book added successfully!",
        status: "success",
        data: newBook
    });
}

// PUT - Update an existing book
export function updateBook(req, res) {
    const bookId = Number(req.params.id);

    const {
        title,
        author,
        genre,
        status,
        totalPages,
        currentPage,
        completedAt
    } = req.body;

    // Find the book
    const book = books.find(book => book.id === bookId);

    // Check if book exists
    if (!book) {
        return res.status(404).json({
            message: "Book not found.",
            status: "error"
        });
    }

    // Validate required fields
    if (!title || !author || !genre || !status) {
        return res.status(400).json({
            message: "Please provide all required book details.",
            status: "error"
        });
    }

    // Update book details
    book.title = title;
    book.author = author;
    book.genre = genre;
    book.status = status;
    book.totalPages = Number(totalPages) || 0;
    book.currentPage = Number(currentPage) || 0;
    book.completedAt = completedAt || null;

    res.json({
        message: "Book updated successfully!",
        status: "success",
        data: book
    });
}

// DELETE - Remove an existing book
export function deleteBook(req, res) {
    const bookId = Number(req.params.id);

    // Find the book index
    const bookIndex = books.findIndex(book => book.id === bookId);

    // Check if book exists
    if (bookIndex === -1) {
        return res.status(404).json({
            message: "Book not found.",
            status: "error"
        });
    }

    // Remove the book
    const deletedBook = books.splice(bookIndex, 1);

    res.json({
        message: "Book deleted successfully!",
        status: "success",
        data: deletedBook[0]
    });
}
