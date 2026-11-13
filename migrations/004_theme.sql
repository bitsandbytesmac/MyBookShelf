-- Each user's chosen look: { "preset": "cream" | "blush" | ..., "background": "#rrggbb" | null }.
-- NULL means the default theme, so existing users see no change.

ALTER TABLE users ADD COLUMN IF NOT EXISTS theme JSONB;
