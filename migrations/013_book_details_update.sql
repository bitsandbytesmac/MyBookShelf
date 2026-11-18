-- Edit details update (November 2026):
--  - Goodreads review link and a "Re-read" checkbox on each book.
--  - "Age Demo" replaces the single age category with a multiple choice (age_category stays as a legacy
--    copy of the first value, like genre/genres).
--  - Setting becomes free text instead of tags. The old tags are kept in `settings` (no longer written).
--  - Readers can delete categories from their own lists of genres, sub-genres, tropes and content warnings.
-- Nothing is deleted: themes, characters and settings keep their data.

ALTER TABLE books
    ADD COLUMN IF NOT EXISTS goodreads_url TEXT,
    ADD COLUMN IF NOT EXISTS is_reread     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS age_demos     TEXT[]  NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS setting       TEXT;

UPDATE books SET age_demos = ARRAY[age_category]
WHERE age_category IS NOT NULL AND age_category <> '' AND age_demos = '{}';

UPDATE books SET setting = array_to_string(settings, ', ')
WHERE setting IS NULL AND cardinality(settings) > 0;

-- { "genres": [...], "subgenres": [...], "tropes": [...], "contentWarnings": [...] }: choices the reader deleted.
ALTER TABLE users ADD COLUMN IF NOT EXISTS hidden_tags JSONB NOT NULL DEFAULT '{}'::jsonb;
