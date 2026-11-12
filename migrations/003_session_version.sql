-- Session version: every login token records the version it was issued under.
-- Bumping it (e.g. on password reset) signs the account out on all devices.
-- Existing tokens have no version and count as 0, so nobody is logged out by this migration.

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
