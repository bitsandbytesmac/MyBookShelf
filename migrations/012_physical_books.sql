-- Physical Bookshelf: a book the reader owns as a printed copy ("Physical book" checkbox in Add/Edit details).
ALTER TABLE books ADD COLUMN IF NOT EXISTS is_physical BOOLEAN NOT NULL DEFAULT false;
