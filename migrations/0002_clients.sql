-- Email verification, consent, notifications, client replies, coach archive, device list.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN consent INTEGER;
ALTER TABLE users ADD COLUMN notify INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN coach_archived INTEGER NOT NULL DEFAULT 0;
UPDATE users SET email_verified = 1 WHERE google_sub IS NOT NULL;
ALTER TABLE tokens ADD COLUMN label TEXT;
ALTER TABLE tokens ADD COLUMN created INTEGER;
ALTER TABLE comments ADD COLUMN from_client INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN unseen INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS mail_tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS mail_user ON mail_tokens (user_id, kind);
