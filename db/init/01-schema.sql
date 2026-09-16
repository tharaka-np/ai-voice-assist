-- Schema for the voice extractor.
--
-- Executed automatically by the postgres image on the first start of an empty
-- volume, before 02-seed-users.sql (the image runs files in filename order).
-- It does NOT re-run on later starts: use `docker compose down -v` to reset.
--
-- Seed data lives in 02-seed-users.sql, which is written to be replayable
-- against an already-running database so directory changes do not require
-- dropping the volume.

-- Trigram similarity, used to rank fuzzy name matches.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Name normalisation
--
-- Mirrored exactly by `normalizeName` in lib/matching/name-match.ts. Both sides
-- must agree or an exact match will be scored as fuzzy. Declared IMMUTABLE so
-- it can be used in the trigram index below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_name(value TEXT)
RETURNS TEXT AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  );
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Contact columns are NOT NULL like everything else here: every seeded row
-- carries a full address, so the constraint costs nothing and keeps the reader
-- from having to reason about missing values. If real imports later arrive with
-- partial contact details, relax the specific column rather than all of them.
CREATE TABLE users (
  id           SERIAL PRIMARY KEY,
  fname        TEXT NOT NULL,
  lname        TEXT NOT NULL,
  street       TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email        TEXT NOT NULL
);

CREATE TABLE meetings (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users (id),
  -- "date" and "time" are quoted throughout: both are SQL keywords, and
  -- quoting removes any doubt about how they parse.
  "date"      DATE NOT NULL,
  "time"      TIME NOT NULL,
  description TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Matches the expression used by the candidate search query, so trigram
-- filtering stays index-backed rather than scanning every row.
CREATE INDEX users_full_name_trgm_idx
  ON users
  USING gin (normalize_name(fname || ' ' || lname) gin_trgm_ops);

-- Email is the stable identity of a seeded row: 02-seed-users.sql uses it to
-- decide insert-vs-skip, so that lookup should not scan the table.
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE INDEX meetings_user_id_idx ON meetings (user_id);
CREATE INDEX meetings_date_idx ON meetings ("date");
