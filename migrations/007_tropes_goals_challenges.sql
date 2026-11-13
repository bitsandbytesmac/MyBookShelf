-- Book extras: tropes, content warnings, age category, "review written" / "in my reading journal"
-- checkboxes, and how many books the whole series has (so the series page can show 1 of 6).
-- Plus custom reading goals and reading challenges (e.g. an A to Z challenge).

ALTER TABLE books
    ADD COLUMN IF NOT EXISTS tropes           TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS content_warnings TEXT[]   NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS age_category     VARCHAR(20),
    ADD COLUMN IF NOT EXISTS reviewed         BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS journaled        BOOLEAN  NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS series_total     SMALLINT;

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_age_category_check;
ALTER TABLE books ADD CONSTRAINT books_age_category_check
    CHECK (age_category IS NULL OR age_category IN ('Children', 'Middle Grade', 'Young Adult', 'New Adult', 'Adult'));

ALTER TABLE books DROP CONSTRAINT IF EXISTS books_series_total_check;
ALTER TABLE books ADD CONSTRAINT books_series_total_check
    CHECK (series_total IS NULL OR (series_total BETWEEN 1 AND 999 AND series IS NOT NULL));

-- Extra goals on top of the monthly/yearly ones on users.
-- metric: count finished books or their pages. period: this month or this year.
-- filter_type/filter_value optionally narrow it, e.g. ('genre', 'Classics') or ('format', 'Audiobook').
CREATE TABLE IF NOT EXISTS reading_goals (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT,
    metric       VARCHAR(10) NOT NULL CHECK (metric IN ('books', 'pages')),
    period       VARCHAR(10) NOT NULL CHECK (period IN ('month', 'year')),
    target       INTEGER     NOT NULL CHECK (target BETWEEN 1 AND 1000000),
    filter_type  VARCHAR(20) CHECK (filter_type IS NULL OR filter_type IN ('genre', 'format', 'age')),
    filter_value TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((filter_type IS NULL) = (filter_value IS NULL))
);

CREATE INDEX IF NOT EXISTS reading_goals_user_id_idx ON reading_goals (user_id);

-- Reader-made challenges. items is a list of prompts: [{ "label": "A", "bookId": "123" | null, "done": false }].
CREATE TABLE IF NOT EXISTS challenges (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    description TEXT,
    items       JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS challenges_user_id_idx ON challenges (user_id);
