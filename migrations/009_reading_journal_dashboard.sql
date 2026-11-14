-- New dashboard: "Log your reading" journal entries, a reading streak, and a "Next Up" list.

-- Each reading session (journal entry) gets the day it happened (the reader can pick it) and an optional note.
ALTER TABLE reading_activities
    ADD COLUMN IF NOT EXISTS session_date DATE,
    ADD COLUMN IF NOT EXISTS note         TEXT;

UPDATE reading_activities SET session_date = created_at::date WHERE session_date IS NULL;
ALTER TABLE reading_activities ALTER COLUMN session_date SET DEFAULT CURRENT_DATE;
ALTER TABLE reading_activities ALTER COLUMN session_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS reading_activities_user_day_idx ON reading_activities (user_id, session_date DESC);

-- Up to 3 To Be Read books the reader has picked to read next, in order.
ALTER TABLE users ADD COLUMN IF NOT EXISTS next_up BIGINT[] NOT NULL DEFAULT '{}';
