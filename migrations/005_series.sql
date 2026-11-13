-- Series tracking: which series a book belongs to, and its position (decimals allowed for novellas, e.g. 1.5).

ALTER TABLE books ADD COLUMN IF NOT EXISTS series TEXT;
ALTER TABLE books ADD COLUMN IF NOT EXISTS series_number NUMERIC(6, 2);

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_series_number_check;
ALTER TABLE books ADD CONSTRAINT books_series_number_check
    CHECK (series_number IS NULL OR (series_number > 0 AND series IS NOT NULL));

CREATE INDEX IF NOT EXISTS books_user_series_idx ON books (user_id, LOWER(series)) WHERE series IS NOT NULL;
