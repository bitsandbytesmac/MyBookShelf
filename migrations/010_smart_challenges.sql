-- Smart challenges: books get the details the matcher needs, and challenges get a date window.

-- Themes & keywords, setting/location, and character descriptions are tags the reader sets (or confirms);
-- the challenge matcher treats them as "confirmed" facts about the book. published_year comes from
-- Google Books or the reader.
ALTER TABLE books
    ADD COLUMN IF NOT EXISTS themes         TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS settings       TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS characters     TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS published_year SMALLINT;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_published_year_check;
ALTER TABLE books ADD CONSTRAINT books_published_year_check
    CHECK (published_year IS NULL OR published_year BETWEEN 0 AND 2200);

-- A challenge can run between two dates (e.g. a yearly challenge). Books only count automatically when
-- they were finished inside the window. auto_match turns the "you unlocked spots" prompt on/off.
-- Each item in challenges.items may now carry "criteria" (the spot's matching rules) and "assignedAt".
ALTER TABLE challenges
    ADD COLUMN IF NOT EXISTS starts_on  DATE,
    ADD COLUMN IF NOT EXISTS ends_on    DATE,
    ADD COLUMN IF NOT EXISTS auto_match BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_dates_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_dates_check
    CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);
