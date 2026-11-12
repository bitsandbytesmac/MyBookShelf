-- Reading journal fields: summary, multi-genres, format, ownership, review, spice,
-- quotes, start/finish dates, new status names, and per-user reading goals.

ALTER TABLE books
    ADD COLUMN IF NOT EXISTS summary       TEXT,
    ADD COLUMN IF NOT EXISTS genres        TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS subgenres     TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS format        VARCHAR(20),
    ADD COLUMN IF NOT EXISTS ownership     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS spice         SMALLINT,
    ADD COLUMN IF NOT EXISTS quotes        TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS review        TEXT,
    ADD COLUMN IF NOT EXISTS date_started  DATE,
    ADD COLUMN IF NOT EXISTS date_finished DATE;

-- Single genre becomes the first entry of the genres list.
ALTER TABLE books ALTER COLUMN genre DROP NOT NULL;
UPDATE books SET genres = ARRAY[genre] WHERE cardinality(genres) = 0 AND COALESCE(genre, '') <> '';

-- New status names.
UPDATE books SET status = 'To Be Read' WHERE status = 'Want to Read';
UPDATE books SET status = 'Read'       WHERE status = 'Completed';

-- Carry over completion dates.
UPDATE books SET date_finished = completed_at::date WHERE date_finished IS NULL AND completed_at IS NOT NULL;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_status_check;
ALTER TABLE books ADD CONSTRAINT books_status_check
    CHECK (status IN ('To Be Read', 'Reading', 'Read', 'DNF', 'Paused'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_format_check;
ALTER TABLE books ADD CONSTRAINT books_format_check
    CHECK (format IS NULL OR format IN ('Paperback', 'Hardbound', 'E-book', 'Audiobook'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_ownership_check;
ALTER TABLE books ADD CONSTRAINT books_ownership_check
    CHECK (ownership IS NULL OR ownership IN ('Owned', 'Borrowed', 'Gifted'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_spice_check;
ALTER TABLE books ADD CONSTRAINT books_spice_check
    CHECK (spice IS NULL OR spice BETWEEN 1 AND 5);

-- Reading goals live on the user so they follow you across devices.
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS yearly_goal  INTEGER NOT NULL DEFAULT 12,
    ADD COLUMN IF NOT EXISTS monthly_goal INTEGER NOT NULL DEFAULT 2;
