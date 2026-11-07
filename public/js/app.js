
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

    modalTitle.textContent = "Edit Book";

    bookModal.classList.remove("hidden");
}



function deleteBook(id) {
    const confirmDelete = confirm(
        "Are you sure you want to delete this book?"
    );

    if (!confirmDelete) return;

    const bookIndex = books.findIndex(book => book.id === id);

    if (bookIndex === -1) return;

    books.splice(bookIndex, 1);

    saveBooks();
    updateStatistics();
    filterBooks();
}


// ==================================
// 1. SAMPLE BOOK DATA
// ==================================

const savedBooks = localStorage.getItem("myBooks");

const books = savedBooks
    ? JSON.parse(savedBooks)
    : [
        {
            id: 1,
            title: "The Silent Patient",
            author: "Alex Michaelides",
            genre: "Fiction",
            status: "Completed",
            cover: "cover-brown"
        },
        {
            id: 2,
            title: "Atomic Habits",
            author: "James Clear",
            genre: "Self-help",
            status: "Reading",
            cover: "cover-green"
        },
        {
            id: 3,
            title: "It Ends With Us",
            author: "Colleen Hoover",
            genre: "Romance",
            status: "Want to Read",
            cover: "cover-pink"
        },
        {
            id: 4,
            title: "The Hobbit",
            author: "J.R.R. Tolkien",
            genre: "Fantasy",
            status: "Completed",
            cover: "cover-blue"
        }
    ];

function saveBooks() {
    localStorage.setItem("myBooks", JSON.stringify(books));
}


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


// Track the currently selected book
let selectedBookId = null;

// Track the currently selected bookshelf filter
let currentStatus = "All";


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

        const cover = document.createElement("div");
        cover.classList.add("book-cover", book.cover);
        cover.textContent = book.title;

        const info = document.createElement("div");
        info.classList.add("book-info");

        const title = document.createElement("h3");
        title.textContent = book.title;

        const author = document.createElement("p");
        author.textContent = book.author;

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

        actions.append(editButton, progressButton, deleteButton);

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

            info.append(title, author, status, progressContainer, actions);
        } else {
            info.append(title, author, status, actions);
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
// 7. SAVE READING PROGRESS
// ==================================

progressForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const book = books.find(book => book.id === selectedBookId);

    if (!book) return;

    const previousStatus = book.status;
    const updatedPage = Number(newCurrentPage.value);

    if (
        updatedPage < 0 ||
        updatedPage > book.totalPages ||
        !Number.isInteger(updatedPage)
    ) {
        alert("Please enter a valid page number.");
        return;
    }

    book.currentPage = updatedPage;

    // Automatically update the book status.
    if (book.currentPage >= book.totalPages && book.totalPages > 0) {
        book.status = "Completed";
    } else if (book.currentPage > 0) {
        book.status = "Reading";
    } else {
        book.status = "Want to Read";
    }

    // Record the completion date before saving.
    updateCompletionDate(book, previousStatus);

    // Save changes and refresh dashboard.
    saveBooks();
    updateStatistics();
    filterBooks();

    closeProgressModal();
    progressForm.reset();
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
            book.status === currentStatus;

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

bookForm.addEventListener("submit", (event) => {

    event.preventDefault();

    const id = Number(bookId.value);

    if (id) {

        // UPDATE EXISTING BOOK
        const book = books.find(book => book.id === id);

        if (!book) return;

        const previousStatus = book.status;

        book.title = bookTitle.value.trim();
        book.author = bookAuthor.value.trim();
        book.genre = bookGenre.value;
        book.status = bookStatus.value;
        book.totalPages = Number(totalPages.value) || 0;
        book.currentPage = Number(currentPage.value) || 0;

        if (book.currentPage >= book.totalPages && book.totalPages > 0) {
            book.status = "Completed";
        } else if (book.currentPage > 0) {
            book.status = "Reading";
        }

        // Record or clear completion date.
        updateCompletionDate(book, previousStatus);

    } else {

        // CREATE NEW BOOK
        const newBook = {
            id: Date.now(),
            title: bookTitle.value.trim(),
            author: bookAuthor.value.trim(),
            genre: bookGenre.value,
            status: bookStatus.value,
            totalPages: Number(totalPages.value) || 0,
            currentPage: Number(currentPage.value) || 0,
            cover: "cover-brown"
        };

        if (newBook.currentPage >= newBook.totalPages && newBook.totalPages > 0) {
            newBook.status = "Completed";
        } else if (newBook.currentPage > 0) {
            newBook.status = "Reading";
        }

        // Record completion date for a newly completed book.
        updateCompletionDate(newBook, null);

        books.push(newBook);
    }

    // Save changes to localStorage.
    saveBooks();

    // Refresh dashboard.
    updateStatistics();
    filterBooks();

    closeModal();
    bookForm.reset();

});

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
// 7. SAVE READING PROGRESS
// ==================================

progressForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const book = books.find(book => book.id === selectedBookId);

    if (!book) return;

    const previousStatus = book.status;
    const updatedPage = Number(newCurrentPage.value);

    if (
        updatedPage < 0 ||
        updatedPage > book.totalPages ||
        !Number.isInteger(updatedPage)
    ) {
        alert("Please enter a valid page number.");
        return;
    }

    book.currentPage = updatedPage;

    // Automatically update the book status.
    if (book.currentPage >= book.totalPages && book.totalPages > 0) {
        book.status = "Completed";
    } else if (book.currentPage > 0) {
        book.status = "Reading";
    } else {
        book.status = "Want to Read";
    }

    // Record the completion date before saving.
    updateCompletionDate(book, previousStatus);

    // Save changes and refresh dashboard.
    saveBooks();
    updateStatistics();
    filterBooks();

    closeProgressModal();
    progressForm.reset();
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
            book.status === currentStatus;

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
    });
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

bookForm.addEventListener("submit", (event) => {

    event.preventDefault();

    const id = Number(bookId.value);

    if (id) {

        // UPDATE EXISTING BOOK
        const book = books.find(book => book.id === id);

        if (!book) return;

        const previousStatus = book.status;

        book.title = bookTitle.value.trim();
        book.author = bookAuthor.value.trim();
        book.genre = bookGenre.value;
        book.status = bookStatus.value;
        book.totalPages = Number(totalPages.value) || 0;
        book.currentPage = Number(currentPage.value) || 0;

        if (book.currentPage >= book.totalPages && book.totalPages > 0) {
            book.status = "Completed";
        } else if (book.currentPage > 0) {
            book.status = "Reading";
        }

        // Record or clear completion date.
        updateCompletionDate(book, previousStatus);

    } else {

        // CREATE NEW BOOK
        const newBook = {
            id: Date.now(),
            title: bookTitle.value.trim(),
            author: bookAuthor.value.trim(),
            genre: bookGenre.value,
            status: bookStatus.value,
            totalPages: Number(totalPages.value) || 0,
            currentPage: Number(currentPage.value) || 0,
            cover: "cover-brown"
        };

        if (newBook.currentPage >= newBook.totalPages && newBook.totalPages > 0) {
            newBook.status = "Completed";
        } else if (newBook.currentPage > 0) {
            newBook.status = "Reading";
        }

        // Record completion date for a newly completed book.
        updateCompletionDate(newBook, null);

        books.push(newBook);
    }

    // Save changes to localStorage.
    saveBooks();

    closeModal();
    bookForm.reset();

});

    // Refresh dashboard.
    updateStatistics();
    filterBooks();


// MOBILE SIDEBAR


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