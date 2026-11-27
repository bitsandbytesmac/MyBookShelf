-- Chapters (November 2026): a book can have a number of chapters (Edit details), and a journal entry
-- written in "Log your reading" can be filed under one of them. Chapters are numbered 1..chapter_count.
ALTER TABLE books ADD COLUMN IF NOT EXISTS chapter_count INTEGER;
ALTER TABLE books DROP CONSTRAINT IF EXISTS books_chapter_count_check;
ALTER TABLE books ADD CONSTRAINT books_chapter_count_check CHECK (chapter_count IS NULL OR chapter_count BETWEEN 1 AND 999);

ALTER TABLE reading_activities ADD COLUMN IF NOT EXISTS chapter INTEGER;
ALTER TABLE reading_activities DROP CONSTRAINT IF EXISTS reading_activities_chapter_check;
ALTER TABLE reading_activities ADD CONSTRAINT reading_activities_chapter_check CHECK (chapter IS NULL OR chapter BETWEEN 1 AND 999);

-- The book page lists a book's chapter notes.
CREATE INDEX IF NOT EXISTS reading_activities_book_chapter_idx ON reading_activities (book_id, chapter) WHERE chapter IS NOT NULL;
