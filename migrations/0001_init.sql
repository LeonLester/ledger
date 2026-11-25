-- Baseline schema. Safe to run on the existing production database: every statement is IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'athlete', coach_id TEXT, invite TEXT UNIQUE, created INTEGER NOT NULL, google_sub TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS users_gsub ON users (google_sub);
CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS docs (user_id TEXT NOT NULL, kind TEXT NOT NULL, doc_id TEXT NOT NULL, data TEXT, ts INTEGER NOT NULL, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, kind, doc_id));
CREATE INDEX IF NOT EXISTS docs_upd ON docs (user_id, updated);
CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, client_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, note TEXT, state TEXT NOT NULL DEFAULT 'sent', created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS asg_client ON assignments (client_id);
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, coach_id TEXT NOT NULL, client_id TEXT NOT NULL, session_id TEXT, body TEXT NOT NULL, created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cmt_client ON comments (client_id, created);
CREATE TABLE IF NOT EXISTS invites (id TEXT PRIMARY KEY, token TEXT NOT NULL UNIQUE, role TEXT NOT NULL, email TEXT, note TEXT, created_by TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL, used_by TEXT, used INTEGER);
CREATE TABLE IF NOT EXISTS coach_requests (user_id TEXT PRIMARY KEY, note TEXT, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rl (k TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, exp INTEGER NOT NULL, PRIMARY KEY (k, w));
