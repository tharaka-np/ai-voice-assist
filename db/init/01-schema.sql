-- Schema and seed data for the voice extractor.
--
-- Executed automatically by the postgres image on the first start of an empty
-- volume. It does NOT re-run on later starts: use `docker compose down -v` to
-- reset, or add a migration step if the schema starts changing often.

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
CREATE TABLE users (
  id    SERIAL PRIMARY KEY,
  fname TEXT NOT NULL,
  lname TEXT NOT NULL
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

CREATE INDEX meetings_user_id_idx ON meetings (user_id);
CREATE INDEX meetings_date_idx ON meetings ("date");

-- ---------------------------------------------------------------------------
-- Seed data
--
-- Chosen to exercise the hard cases, not just the happy path:
--   * Amanda Wilson appears twice        -> forces the disambiguation picker
--   * Tharaka / Taraka Pathirana         -> near-miss spellings, the exact
--                                           failure a misheard name produces
--   * Remaining rows give fuzzy matching realistic competition
-- ---------------------------------------------------------------------------
INSERT INTO users (fname, lname) VALUES
  ('Amanda',    'Wilson'),
  ('Amanda',    'Wilson'),
  ('Tharaka',   'Pathirana'),
  ('Taraka',    'Pathirana'),
  ('Eric',      'Poe'),
  ('Rachel',    'Taylor'),
  ('John',      'Doe'),
  ('James',     'Smith'),
  ('Elizabeth', 'Martinez'),
  ('Tyler',     'Harris'),
  ('Sadia',     'Test'),
  ('Kevin',     'Iaracey'),
  ('Carlos',    'Hernandez'),
  ('Priyal',    'Fernando');
