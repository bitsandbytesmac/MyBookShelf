// ==================================
// CHECK USER AUTHENTICATION
// ==================================

if (!localStorage.getItem("token")) {
    window.location.href = "/login.html";
}

function editBook(id) {
    const book = books.find(book => book.id === id);

    if (!book) return;

    bookId.value = book.id;
    bookTitle.value = book.title;
    bookAuthor.value = book.author;
    bookGenre.value = book.genre;
    bookStatus.value = book.status;
    totalPages.value = book.totalPages || "";
    currentPage.value = book.currentPage || "";
    bookRating.value = book.rating || "";
    personalNotes.value = book.personalNotes || "";

    // Preserve the existing book cover
    bookForm.dataset.coverUrl = book.coverUrl || "";

    // Reset the manual upload input
    coverUpload.value = "";

    // Display the existing cover preview
    if (book.coverUrl) {
        coverPreview.src = book.coverUrl;
        coverPreviewContainer.classList.remove("hidden");
    } else {
        coverPreview.src = "";
        coverPreviewContainer.classList.add("hidden");
    }

    modalTitle.textContent = "Edit Book";

    bookModal.classList.remove("hidden");
}



// DELETE - Remove a book through Backend API
async function deleteBook(id) {
    const confirmDelete = confirm(
        "Are you sure you want to delete this book?"
    );

    if (!confirmDelete) return;

    try {

        const response = await fetch(`/api/books/${id}`, {
            method: "DELETE",
            headers: getAuthHeaders()
        });

        if (handleAuthError(response)) return;

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to delete book.");
        }

        // Remove the deleted book from the frontend array.
        const bookIndex = books.findIndex(book => book.id === id);

        if (bookIndex !== -1) {
            books.splice(bookIndex, 1);
        }

        // Refresh dashboard and bookshelf.
        updateStatistics();
        filterBooks();

        console.log("Book deleted successfully through API.");

    } catch (error) {
        console.error("Error deleting book:", error);
        alert(error.message);
    }
}

// ==================================
// TOGGLE BOOK FAVORITE STATUS
// ==================================

async function toggleFavorite(id) {
    const book = books.find(book => book.id === id);

    if (!book) return;

    const newFavoriteStatus = !book.isFavorite;

    const updatedBook = {
        title: book.title,
        author: book.author,
        genre: book.genre,
        status: book.status,
        totalPages: book.totalPages,
        currentPage: book.currentPage,
        completedAt: book.completedAt || null,
        coverUrl: book.coverUrl || null,
        isFavorite: newFavoriteStatus
    };

    try {
        const response = await fetch(`/api/books/${id}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(updatedBook)
        });

        if (handleAuthError(response)) return;

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to update favorite.");
        }

        book.isFavorite = result.data.is_favorite;

        filterBooks();

    } catch (error) {
        console.error("Error updating favorite:", error);
        alert(error.message);
    }
}



// ==================================
// 1. BOOK DATA
// ==================================
const books = [];

// ==================================
// LOAD BOOKS FROM BACKEND API
// ==================================

// async function loadBooksFromAPI() {
//     try {
//         const response = await fetch("/api/books");

//         if (!response.ok) {
//             throw new Error("Failed to retrieve books.");
//         }

//         const result = await response.json();

//         // Replace sample/local books with backend books.
//         books.splice(
//             0,
//             books.length,
//             ...result.data.map(book => ({
//                 ...book,
//                 totalPages: book.totalPages || 0,
//                 currentPage: book.currentPage || 0,
//                 cover: book.cover || "cover-brown"
//             }))
//         );

//         // Refresh the dashboard and book list.
//         updateStatistics();
//         filterBooks();

//         console.log("Books loaded successfully from API.");

//     } catch (error) {
//         console.error("Error loading books:", error);
//         alert("Unable to load books from the server.");
//     }
// }


// ==================================
// 2. READING GOAL SETTINGS
// ==================================

const savedGoal = localStorage.getItem("readingGoal");

let readingGoal = savedGoal !== null
    ? Number(savedGoal)
    : 12;


// ==================================
// 3. GET HTML ELEMENTS
// ==================================

const bookContainer = document.querySelector("#bookContainer");

const totalBooks = document.querySelector("#totalBooks");
const readingBooks = document.querySelector("#readingBooks");
const completedBooks = document.querySelector("#completedBooks");
const wishlistBooks = document.querySelector("#wishlistBooks");

const searchInput = document.querySelector("#searchInput");
const genreFilter = document.querySelector("#genreFilter");

const addBookBtn = document.querySelector("#addBookBtn");
const navLinks = document.querySelectorAll(".nav-link");
const sectionTitle = document.querySelector("#sectionTitle");

const bookModal = document.querySelector("#bookModal");
const bookForm = document.querySelector("#bookForm");
const modalTitle = document.querySelector("#modalTitle");

const closeModalBtn = document.querySelector("#closeModalBtn");
const cancelBtn = document.querySelector("#cancelBtn");

const bookId = document.querySelector("#bookId");
const bookTitle = document.querySelector("#bookTitle");
const bookAuthor = document.querySelector("#bookAuthor");
const bookGenre = document.querySelector("#bookGenre");
const bookStatus = document.querySelector("#bookStatus");
const totalPages = document.querySelector("#totalPages");
const currentPage = document.querySelector("#currentPage");

const bookRating = document.querySelector("#bookRating");
const personalNotes = document.querySelector("#personalNotes");

const totalPagesRead = document.querySelector("#totalPagesRead");
const averageCompletion = document.querySelector("#averageCompletion");

const menuToggle = document.querySelector("#menuToggle");
const sidebarOverlay = document.querySelector("#sidebarOverlay");
const sidebar = document.querySelector(".sidebar");

// Reading Goal elements
const readingGoalYear = document.querySelector("#readingGoalYear");
const completedGoalBooks = document.querySelector("#completedGoalBooks");
const readingGoalTarget = document.querySelector("#readingGoalTarget");
const readingGoalFill = document.querySelector("#readingGoalFill");
const readingGoalPercentage = document.querySelector("#readingGoalPercentage");
const remainingGoalBooks = document.querySelector("#remainingGoalBooks");
const readingGoalInput = document.querySelector("#readingGoalInput");
const saveReadingGoalBtn = document.querySelector("#saveReadingGoalBtn");

// Progress Modal elements
const progressModal = document.querySelector("#progressModal");
const progressForm = document.querySelector("#progressForm");
const progressBookTitle = document.querySelector("#progressBookTitle");
const newCurrentPage = document.querySelector("#newCurrentPage");

const closeProgressModalBtn = document.querySelector("#closeProgressModalBtn");
const cancelProgressBtn = document.querySelector("#cancelProgressBtn");

// Google Books Search elements
const googleBookQuery = document.querySelector("#googleBookQuery");
const searchGoogleBooksBtn = document.querySelector("#searchGoogleBooksBtn");
const googleBooksMessage = document.querySelector("#googleBooksMessage");
const googleBooksResults = document.querySelector("#googleBooksResults");

const coverUpload = document.querySelector("#coverUpload");
const coverPreview = document.querySelector("#coverPreview");
const coverPreviewContainer = document.querySelector("#coverPreviewContainer");

// const totalPages = document.querySelector("#totalPages");
// const currentPage = document.querySelector("#currentPage");



// ==================================
// BOOK COVER IMAGE PREVIEW
// ==================================

coverUpload.addEventListener("change", function () {

    const file = coverUpload.files[0];

    if (!file) {
        coverPreviewContainer.classList.add("hidden");
        coverPreview.src = "";
        return;
    }

    // Check file size (5 MB maximum)
    if (file.size > 5 * 1024 * 1024) {
        alert("Image size must not exceed 5 MB.");
        coverUpload.value = "";
        coverPreviewContainer.classList.add("hidden");
        coverPreview.src = "";
        return;
    }

    // Preview selected image
    const imageUrl = URL.createObjectURL(file);

    coverPreview.src = imageUrl;
    coverPreviewContainer.classList.remove("hidden");
});


console.log("Google Books elements:", {
    googleBookQuery,
    searchGoogleBooksBtn,
    googleBooksMessage,
    googleBooksResults
});

// Track the currently selected book
let selectedBookId = null;

// Track the currently selected bookshelf filter
let currentStatus = "All";


// ==================================
// AUTHENTICATION HELPER
// ==================================

function getAuthHeaders() {
    const token = localStorage.getItem("token");

    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

// Prevent multiple session expiration alerts.
let isHandlingAuthError = false;

// Handle expired or invalid authentication sessions.
function handleAuthError(response) {
    if (response.status === 401 || response.status === 403) {

        if (isHandlingAuthError) {
            return true;
        }

        isHandlingAuthError = true;

        localStorage.removeItem("token");
        localStorage.removeItem("user");

        alert("Your session has expired. Please log in again.");

        window.location.href = "/login.html";

        return true;
    }

    return false;
}

// ==================================
// UPLOAD BOOK COVER TO CLOUDINARY
// ==================================

async function uploadBookCover(file) {

    const formData = new FormData();

    formData.append("cover", file);

    const response = await fetch("/api/uploads/cover", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: formData
    });

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to upload book cover.");
    }

    return result.data.coverUrl;
}



 // ==================================
 // GOOGLE BOOKS SEARCH
 // ==================================

async function searchGoogleBooks() {

    const query = googleBookQuery.value.trim();

    // Check if the search field is empty.
    if (!query) {
        googleBooksMessage.textContent = "Please enter a book title or author.";
        return;
    }

    // Display loading message.
    googleBooksMessage.textContent = "Searching for books...";
    googleBooksResults.innerHTML = "";

    try {

        const response = await fetch(
            `/api/google-books/search?q=${encodeURIComponent(query)}`
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to search Google Books.");
        }

        // Check if books were found.
        if (result.data.length === 0) {
            googleBooksMessage.textContent = "No books found. Try another search.";
            return;
        }

        googleBooksMessage.textContent =
            `Found ${result.totalItems} matching books.`;

        displayGoogleBooksResults(result.data);

    } catch (error) {

        console.error("Google Books search error:", error);

        googleBooksMessage.textContent = error.message;

    }
}



function displayGoogleBooksResults(books) {

    googleBooksResults.innerHTML = "";

    books.forEach(book => {

        const info = book.volumeInfo;

        const title = info.title || "Unknown Title";

        const authors = info.authors
            ? info.authors.join(", ")
            : "Unknown Author";

        const cover = info.imageLinks?.thumbnail || "";
        const coverUrl = cover.replace("http://", "https://");

        const resultCard = document.createElement("div");
        resultCard.classList.add("google-book-result");

        const coverContainer = document.createElement("div");
        coverContainer.classList.add("google-book-cover");

        if (cover) {
            const image = document.createElement("img");
            image.src = cover;
            image.alt = `${title} cover`;
            coverContainer.appendChild(image);
        } else {
            coverContainer.textContent = "📚";
        }

        const bookInfo = document.createElement("div");
        bookInfo.classList.add("google-book-info");

        const titleElement = document.createElement("h3");
        titleElement.textContent = title;

        const authorElement = document.createElement("p");
        authorElement.textContent = authors;

        const pagesElement = document.createElement("span");
        pagesElement.textContent =
            `${info.pageCount || "Unknown"} pages`;

        bookInfo.append(
            titleElement,
            authorElement,
            pagesElement
        );

        const selectButton = document.createElement("button");
        selectButton.type = "button";
        selectButton.classList.add("select-google-book");
        selectButton.textContent = "Select";

        selectButton.addEventListener("click", () => {

            document.querySelector("#bookTitle").value = title;
            document.querySelector("#bookAuthor").value = authors;

            if (info.pageCount) {
                document.querySelector("#totalPages").value =
                    info.pageCount;
            }
            
            document.querySelector("#bookForm").dataset.coverUrl = coverUrl;

            if (coverUrl) {
                coverPreview.src = coverUrl;
                coverPreviewContainer.classList.remove("hidden");
            } else {
                coverPreview.src = "";
                coverPreviewContainer.classList.add("hidden");
            }

            googleBooksMessage.textContent =
                "Book details selected! Please review the information.";
        });

        resultCard.append(
            coverContainer,
            bookInfo,
            selectButton
        );

        googleBooksResults.appendChild(resultCard);
    });
}


// ==================================
// 4. HELPER FUNCTIONS
// ==================================

function updateCompletionDate(book, previousStatus) {
    if (book.status === "Completed" && previousStatus !== "Completed") {
        book.completedAt = new Date().toISOString();
    } else if (book.status !== "Completed") {
        book.completedAt = null;
    }
}

function updateReadingGoal() {
    const currentYear = new Date().getFullYear();

    const completedThisYear = books.filter(book => {
        if (book.status !== "Completed" || !book.completedAt) {
            return false;
        }

        const completionYear = new Date(book.completedAt).getFullYear();

        return completionYear === currentYear;
    }).length;

    const percentage = Math.min(
        Math.round((completedThisYear / readingGoal) * 100),
        100
    );

    const remaining = Math.max(readingGoal - completedThisYear, 0);

    readingGoalYear.textContent = `${currentYear} Reading Goal`;
    completedGoalBooks.textContent = completedThisYear;
    readingGoalTarget.textContent = readingGoal;
    readingGoalPercentage.textContent = `${percentage}% completed`;
    remainingGoalBooks.textContent = `${remaining} books remaining`;

    readingGoalFill.style.width = `${percentage}%`;
    readingGoalInput.value = readingGoal;
}


// ==================================
// 5. DISPLAY BOOKS
// ==================================

function displayBooks(bookList) {
    bookContainer.innerHTML = "";

    if (bookList.length === 0) {
        bookContainer.innerHTML = `
            <div class="empty-message">
                <h3>No books found 📚</h3>
                <p>Try searching for another book.</p>
            </div>
        `;

        return;
    }

    bookList.forEach((book) => {
        const bookCard = document.createElement("article");
        bookCard.classList.add("book-card");

        console.log("Book rating:", book.title, book.rating);
        
        const cover = document.createElement("div");
        cover.classList.add("book-cover");

        if (book.coverUrl) {

            const coverImage = document.createElement("img");

            coverImage.src = book.coverUrl;
            coverImage.alt = `${book.title} cover`;

            cover.appendChild(coverImage);

        } else {

            cover.classList.add(book.cover || "cover-brown");
            cover.textContent = book.title;

        }


        const info = document.createElement("div");
        info.classList.add("book-info");

        const title = document.createElement("h3");
        title.textContent = book.title;

        const author = document.createElement("p");
        author.textContent = book.author;

        // Book rating
        const rating = document.createElement("p");
        rating.classList.add("book-rating");

        if (book.rating) {
            rating.textContent =
                "★".repeat(book.rating) +
                "☆".repeat(5 - book.rating);
        } else {
            rating.textContent = "Not rated yet";
            rating.classList.add("no-rating");
        }

        const status = document.createElement("span");
        status.classList.add("book-status");
        status.textContent = book.status;

        const actions = document.createElement("div");
        actions.classList.add("book-actions");

        const editButton = document.createElement("button");
        editButton.textContent = "Edit";
        editButton.classList.add("edit-button");

        editButton.addEventListener("click", () => {
            editBook(book.id);
        });

        // Favorite button
        const favoriteButton = document.createElement("button");

        favoriteButton.textContent = book.isFavorite
            ? "♥ Favorited"
            : "♡ Favorite";

        favoriteButton.classList.add("favorite-button");

        if (book.isFavorite) {
            favoriteButton.classList.add("active");
        }

        favoriteButton.addEventListener("click", () => {
            toggleFavorite(book.id);
        });

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.classList.add("delete-button");

        deleteButton.addEventListener("click", () => {
            deleteBook(book.id);
        });

        const progressButton = document.createElement("button");
        progressButton.textContent = "Update Progress";
        progressButton.classList.add("progress-button");

        progressButton.addEventListener("click", () => {
            updateProgress(book.id);
        });

        actions.append(
            editButton,
            favoriteButton,
            progressButton,
            deleteButton
        );

        if (book.totalPages > 0) {
            const percentage = Math.min(
                Math.round((book.currentPage / book.totalPages) * 100),
                100
            );

            const progressContainer = document.createElement("div");
            progressContainer.classList.add("progress-container");

            const progressText = document.createElement("p");
            progressText.textContent =
                `${book.currentPage} / ${book.totalPages} pages (${percentage}%)`;

            const progressBar = document.createElement("div");
            progressBar.classList.add("progress-bar");

            const progressFill = document.createElement("div");
            progressFill.classList.add("progress-fill");
            progressFill.style.width = `${percentage}%`;

            progressBar.appendChild(progressFill);
            progressContainer.append(progressText, progressBar);

            info.append(title, author, rating, status, progressContainer, actions);
        } else {
            info.append(title, author, rating, status, actions);
        }

        bookCard.append(cover, info);
        bookContainer.appendChild(bookCard);
    });
}


// ==================================
// 6. PROGRESS MODAL
// ==================================

function updateProgress(id) {
    const book = books.find(book => book.id === id);

    if (!book) return;

    selectedBookId = book.id;

    progressBookTitle.textContent = book.title;
    newCurrentPage.value = book.currentPage || 0;
    newCurrentPage.max = book.totalPages;

    progressModal.classList.remove("hidden");
}

function closeProgressModal() {
    progressModal.classList.add("hidden");
    selectedBookId = null;
}

closeProgressModalBtn.addEventListener("click", closeProgressModal);

cancelProgressBtn.addEventListener("click", closeProgressModal);



 // ==================================
 // 7. SAVE READING PROGRESS THROUGH API
 // ==================================

progressForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const book = books.find(book => book.id === selectedBookId);

    if (!book) return;

    const updatedPage = Number(newCurrentPage.value);

    // Validate page number.
    if (
        updatedPage < 0 ||
        updatedPage > book.totalPages ||
        !Number.isInteger(updatedPage)
    ) {
        alert("Please enter a valid page number.");
        return;
    }

    // Prepare updated book information.
    const updatedBook = {
        ...book,
        currentPage: updatedPage
    };
    console.log("Updated book data:", updatedBook);

    // Automatically update reading status.
    if (
        updatedBook.currentPage >= updatedBook.totalPages &&
        updatedBook.totalPages > 0
    ) {
        updatedBook.status = "Completed";
    } else if (updatedBook.currentPage > 0) {
        updatedBook.status = "Reading";
    } else {
        updatedBook.status = "Want to Read";
    }

    // Record or clear completion date.
    updateCompletionDate(updatedBook, book.status);

    // Send updated progress to backend.
    try {
        const response = await fetch(`/api/books/${book.id}`, {
            method: "PUT",
            headers: getAuthHeaders(),
            body: JSON.stringify(updatedBook)
        });

        if (handleAuthError(response)) return;

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Failed to update reading progress.");
        }

        // Update frontend using backend response.
        Object.assign(book, {
            id: Number(result.data.id),
            title: result.data.title,
            author: result.data.author,
            genre: result.data.genre,
            status: result.data.status,
            totalPages: result.data.total_pages,
            currentPage: result.data.current_page,
            completedAt: result.data.completed_at,
            cover: book.cover || "cover-brown"
        });

        // Refresh dashboard and bookshelf.
        updateStatistics();
        filterBooks();

        console.log("Reading progress updated successfully through API.");

        closeProgressModal();
        progressForm.reset();

    } catch (error) {
        console.error("Error updating reading progress:", error);
        alert(error.message);
    }
});



// ==================================
// 8. UPDATE DASHBOARD STATISTICS
// ==================================

function updateStatistics() {

    // Count books by status.
    totalBooks.textContent = books.length;

    readingBooks.textContent =
        books.filter(book => book.status === "Reading").length;

    completedBooks.textContent =
        books.filter(book => book.status === "Completed").length;

    wishlistBooks.textContent =
        books.filter(book => book.status === "Want to Read").length;


    // Calculate total pages read.
    const pagesRead = books.reduce((total, book) => {
        return total + (Number(book.currentPage) || 0);
    }, 0);

    totalPagesRead.textContent = pagesRead.toLocaleString();


    // Calculate average completion.
    const booksWithPages = books.filter(book => book.totalPages > 0);

    const average = booksWithPages.length > 0
        ? booksWithPages.reduce((total, book) => {
            const percentage =
                (book.currentPage / book.totalPages) * 100;

            return total + Math.min(percentage, 100);
        }, 0) / booksWithPages.length
        : 0;

    averageCompletion.textContent = `${Math.round(average)}%`;

    // Refresh yearly reading goal.
    updateReadingGoal();
}


// ==================================
// 9. SEARCH AND FILTER
// ==================================

function filterBooks() {

    const searchTerm = searchInput.value.toLowerCase();

    const selectedGenre = genreFilter.value;

    const filteredBooks = books.filter((book) => {

        const matchesSearch =
            book.title.toLowerCase().includes(searchTerm) ||
            book.author.toLowerCase().includes(searchTerm);

        const matchesGenre =
            selectedGenre === "All" ||
            book.genre === selectedGenre;

        const matchesStatus =
        currentStatus === "All" ||
        (currentStatus === "Favorites"
            ? book.isFavorite
            : book.status === currentStatus);

        return matchesSearch && matchesGenre && matchesStatus;
    });

    displayBooks(filteredBooks);
}


// ==================================
// 10. NAVIGATION EVENTS
// ==================================

navLinks.forEach((link) => {

    link.addEventListener("click", (event) => {

        event.preventDefault();

        navLinks.forEach((nav) => {
            nav.classList.remove("active");
        });

        link.classList.add("active");

        currentStatus = link.dataset.filter;

        sectionTitle.textContent =
            currentStatus === "All"
                ? "My Bookshelf"
                : currentStatus;

        filterBooks();

        // Close mobile sidebar after selecting a menu item
        sidebar.classList.remove("active");
        sidebarOverlay.classList.remove("active");

    });

});


// ==================================
// GOOGLE BOOKS SEARCH EVENT
// ==================================

// searchGoogleBooksBtn.addEventListener("click", searchGoogleBooks);

searchGoogleBooksBtn.addEventListener("click", () => {
    console.log("Google Books Search button clicked!");

    searchGoogleBooks();
});

// Allow pressing Enter to search.
googleBookQuery.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        searchGoogleBooks();
    }
});

// ==================================
// 11. SEARCH EVENTS
// ==================================

searchInput.addEventListener("input", () => {
    filterBooks();
});

genreFilter.addEventListener("change", () => {
    filterBooks();
});


// ==================================
// 12. OPEN ADD BOOK MODAL
// ==================================

addBookBtn.addEventListener("click", () => {

    bookForm.reset();

    // Clear previously selected Google Books cover
    bookForm.dataset.coverUrl = "";

    // Clear previous Google Books search
    googleBookQuery.value = "";
    googleBooksMessage.textContent = "";
    googleBooksResults.innerHTML = "";

    bookId.value = "";

    modalTitle.textContent = "Add a Book";

    bookModal.classList.remove("hidden");

});


// ==================================
// 13. CLOSE BOOK MODAL
// ==================================

function closeModal() {
    bookModal.classList.add("hidden");
}

closeModalBtn.addEventListener("click", closeModal);

cancelBtn.addEventListener("click", closeModal);

// ==================================
// 14. SAVE BOOK (ADD / EDIT)
// ==================================

bookForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    const id = Number(bookId.value);

    if (id) {

        // UPDATE EXISTING BOOK THROUGH BACKEND API

        const book = books.find(book => book.id === id);

        if (!book) return;

        const previousStatus = book.status;

        // Prepare updated book details
        let coverUrl = bookForm.dataset.coverUrl || null;

        // Upload replacement cover if a new image was selected
        if (coverUpload.files.length > 0) {
            coverUrl = await uploadBookCover(coverUpload.files[0]);
        }

        const updatedBook = {
            title: bookTitle.value.trim(),
            author: bookAuthor.value.trim(),
            genre: bookGenre.value,
            status: bookStatus.value,
            totalPages: Number(totalPages.value) || 0,
            currentPage: Number(currentPage.value) || 0,
            coverUrl: bookForm.dataset.coverUrl || null,
            rating: bookRating.value ? Number(bookRating.value) : null,
            personalNotes: personalNotes.value.trim() || null
        };

        // Automatically update reading status
        if (
            updatedBook.currentPage >= updatedBook.totalPages &&
            updatedBook.totalPages > 0
        ) {
            updatedBook.status = "Completed";
        } else if (updatedBook.currentPage > 0) {
            updatedBook.status = "Reading";
        }

        // Apply updated values temporarily
        Object.assign(book, updatedBook);

        // Record or clear completion date
        updateCompletionDate(book, previousStatus);

        // Send updated details to backend
        try {
            const response = await fetch(`/api/books/${id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    ...updatedBook,
                    completedAt: book.completedAt || null,
                    coverUrl: updatedBook.coverUrl
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || "Failed to update book.");
            }

            // Update local book using backend response
            Object.assign(book, {
                id: Number(result.data.id),
                title: result.data.title,
                author: result.data.author,
                genre: result.data.genre,
                status: result.data.status,
                totalPages: result.data.total_pages,
                currentPage: result.data.current_page,
                completedAt: result.data.completed_at,
                coverUrl: result.data.cover_url,
                isFavorite: result.data.is_favorite,
                rating: result.data.rating,
                personalNotes: result.data.personal_notes,
                cover: book.cover || "cover-brown"
            });

            console.log("Book updated successfully through API.");

        } catch (error) {
            console.error("Error updating book:", error);
            alert(error.message);
            return;
        }
    }

    else {

    // CREATE NEW BOOK THROUGH BACKEND API

try {

    let coverUrl = bookForm.dataset.coverUrl || null;

    // Upload manually selected cover to Cloudinary
    if (coverUpload.files.length > 0) {

        coverUrl = await uploadBookCover(coverUpload.files[0]);

    }

    const newBook = {
        title: bookTitle.value.trim(),
        author: bookAuthor.value.trim(),
        genre: bookGenre.value,
        status: bookStatus.value,
        totalPages: Number(totalPages.value) || 0,
        currentPage: Number(currentPage.value) || 0,
        coverUrl: coverUrl,
        rating: bookRating.value ? Number(bookRating.value) : null,
        personalNotes: personalNotes.value.trim() || null
    };
    console.log("New book data:", newBook);

    const response = await fetch("/api/books", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(newBook)
    });

    if (handleAuthError(response)) return;

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to add book.");
    }

    // Add the book returned by the backend
    books.push({
        id: Number(result.data.id),
        title: result.data.title,
        author: result.data.author,
        genre: result.data.genre,
        status: result.data.status,
        totalPages: result.data.total_pages,
        currentPage: result.data.current_page,
        completedAt: result.data.completed_at,
        coverUrl: result.data.cover_url,
        isFavorite: result.data.is_favorite,
        rating: result.data.rating,
        personalNotes: result.data.personal_notes,
        cover: "cover-brown"
    });

    console.log("Book added successfully through API.");

    } catch (error) {
        console.error("Error adding book:", error);
        alert(error.message);
        return;
    }

    }
    // Refresh dashboard.
    updateStatistics();
    filterBooks();

    closeModal();
    bookForm.reset();

});


// Initial dashboard render.
// IMPORTANT: Keep these two calls.
// updateStatistics();
// filterBooks();

// Load books from backend when the page opens.
async function loadBooksFromAPI() {
    try {
        const response = await fetch("/api/books", {
            method: "GET",
            headers: getAuthHeaders()
        });

        if (handleAuthError(response)) return;

        if (!response.ok) {
            throw new Error("Failed to retrieve books.");
        }

        const result = await response.json();

        books.splice(
            0,
            books.length,
            ...result.data.map(book => ({
                ...book,
                id: Number(book.id),
                totalPages: book.total_pages || 0,
                currentPage: book.current_page || 0,
                completedAt: book.completed_at,
                coverUrl: book.cover_url,
                isFavorite: book.is_favorite,
                rating: book.rating,
                personalNotes: book.personal_notes,
                cover: book.cover || "cover-brown"
            }))
        );

        updateStatistics();
        filterBooks();

        console.log("Books loaded successfully from API.");

    } catch (error) {
        console.error("Error loading books:", error);
        alert("Unable to load books from the server.");
    }
}

// Load reading activities from backend.
async function loadActivitiesFromAPI() {
    try {
        const response = await fetch("/api/activities", {
            method: "GET",
            headers: getAuthHeaders()
        });

        if (handleAuthError(response)) return;

        if (!response.ok) {
            throw new Error("Failed to retrieve reading activities.");
        }

        const result = await response.json();

        displayActivities(result.data);

        console.log("Reading activities loaded successfully:", result.data);

    } catch (error) {
        console.error("Error loading reading activities:", error);
    }
}

// Display recent reading activities on the dashboard.
function displayActivities(activities) {
    const activityContainer = document.getElementById("activityContainer");

    activityContainer.innerHTML = "";

    if (activities.length === 0) {
        activityContainer.innerHTML = `
            <p class="empty-activity">
                No reading activity yet. Start reading a book!
            </p>
        `;
        return;
    }

    activities.forEach(activity => {
        const activityItem = document.createElement("div");
        activityItem.classList.add("activity-item");

        const activityDate = new Date(activity.created_at);

        const formattedDate = activityDate.toLocaleString("en-PH", {
            dateStyle: "medium",
            timeStyle: "short"
        });

        activityItem.innerHTML = `
            <div class="activity-details">
                <h3>${activity.book_title}</h3>
                <p>
                    Pages ${activity.previous_page} → ${activity.current_page}
                </p>
                <span>${formattedDate}</span>
            </div>

            <div class="activity-pages">
                +${activity.pages_read} pages
            </div>
        `;

        activityContainer.appendChild(activityItem);
    });
}

// Display reading statistics on the dashboard.
function displayReadingStatistics(statistics) {
    document.getElementById("pagesToday").textContent =
        Number(statistics.pagesToday).toLocaleString("en-PH");

    document.getElementById("pagesThisWeek").textContent =
        Number(statistics.pagesThisWeek).toLocaleString("en-PH");

    document.getElementById("pagesThisMonth").textContent =
        Number(statistics.pagesThisMonth).toLocaleString("en-PH");

    const mostReadBook = document.getElementById("mostReadBook");
    const mostReadBookPages = document.getElementById("mostReadBookPages");

    if (statistics.mostReadBook) {
        mostReadBook.textContent = statistics.mostReadBook.book_title;

        mostReadBookPages.textContent =
            `${Number(statistics.mostReadBook.total_pages_read).toLocaleString("en-PH")} pages recorded`;
    } else {
        mostReadBook.textContent = "—";
        mostReadBookPages.textContent = "No reading activity yet";
    }
}

// Load reading statistics from the backend.
async function loadReadingStatisticsFromAPI() {
    try {
        const response = await fetch("/api/activities/statistics", {
            method: "GET",
            headers: getAuthHeaders()
        });

        if (handleAuthError(response)) return;

        if (!response.ok) {
            throw new Error("Failed to retrieve reading statistics.");
        }

        const result = await response.json();

        displayReadingStatistics(result.data);

        console.log("Reading statistics loaded successfully:", result.data);

    } catch (error) {
        console.error("Error loading reading statistics:", error);
    }
}
// Load books from PostgreSQL when the page opens.
loadBooksFromAPI();
loadActivitiesFromAPI();
loadReadingStatisticsFromAPI();

// ==================================
// MOBILE SIDEBAR
// ==================================

console.log("Menu toggle:", menuToggle);
console.log("Sidebar overlay:", sidebarOverlay);
console.log("Sidebar:", sidebar);

menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("active");
    sidebarOverlay.classList.toggle("active");
});

sidebarOverlay.addEventListener("click", () => {
    sidebar.classList.remove("active");
    sidebarOverlay.classList.remove("active");
});

sidebar.classList.remove("active");
sidebarOverlay.classList.remove("active");

// ==================================
// LOGOUT
// ==================================

const logoutBtn = document.querySelector("#logoutBtn");

logoutBtn.addEventListener("click", () => {

    // Remove authentication data
    localStorage.removeItem("token");
    localStorage.removeItem("user");

    // Redirect to login page
    window.location.href = "/login.html";

});