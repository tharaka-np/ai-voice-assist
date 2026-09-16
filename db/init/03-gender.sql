-- Adds the `gender` column to `users`.
--
-- Runs automatically after 02-seed-users.sql on a fresh volume, and is written so
-- the same file can be replayed against an already-running database:
--
--   docker exec -i voice-extractor-db \
--     psql -U voice -d voice_extractor -v ON_ERROR_STOP=1 \
--     < db/init/03-gender.sql
--
-- Replay is safe because the file
--   * adds the column only if it is missing, and adds it nullable so the ALTER
--     succeeds against a table that already has rows,
--   * recreates the CHECK constraint rather than failing when it exists,
--   * backfills only rows where gender IS NULL, so a manual correction is never
--     overwritten,
--   * applies NOT NULL last, once every row has a value.
--
-- This file is the single source of the gender column. 01-schema.sql is left
-- alone on purpose: 02-seed-users.sql does not supply a gender, so declaring the
-- column NOT NULL at table-creation time would break the seed insert.
--
-- ---------------------------------------------------------------------------
-- On the backfill values
--
-- The directory is entirely synthetic, so the assignment below only has to be
-- self-consistent and reproducible. It is derived from first names rather than
-- randomised, for two reasons:
--
--   * `random()` produces a different directory on every replay, which makes a
--     gender-filtered search impossible to write a stable test against.
--   * A demo where "find the female Amanda Wilson" returns a male Amanda looks
--     like a broken feature rather than synthetic data.
--
-- To be explicit, because the two are easy to conflate: deriving gender from a
-- name is acceptable when *authoring fixture data*, and is forbidden in the
-- application. The extraction prompt states that gender must never be inferred
-- from a first name and is only ever populated when a speaker says it outright.
-- Nothing at runtime consults the list below.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS gender TEXT;

-- Dropped first so the file can be replayed; ADD CONSTRAINT alone would fail on
-- the second run.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_gender_check;
ALTER TABLE users
  ADD CONSTRAINT users_gender_check CHECK (gender IN ('male', 'female'));

-- Names treated as female for fixture purposes. Anything not listed is assigned
-- male, which keeps this list to roughly half the directory. Homophone variants
-- are included alongside their base spelling so a cluster stays internally
-- consistent: Amanda and Amandah should not disagree.
CREATE TEMP TABLE female_first_names (fname TEXT PRIMARY KEY) ON COMMIT DROP;

INSERT INTO female_first_names (fname) VALUES
  ('Aisha'), ('Amanda'), ('Amandah'), ('Anjali'), ('Anjuli'), ('Ayesha'),
  ('Catherine'), ('Claire'), ('Clara'), ('Clare'), ('Elana'), ('Elena'),
  ('Elisabeth'), ('Elizabet'), ('Elizabeth'), ('Erin'), ('Jamie'),
  ('Katherine'), ('Kathryn'), ('Lei'), ('Lucea'), ('Lucia'), ('Maria'),
  ('Mariah'), ('Neve'), ('Niamh'), ('Priyaal'), ('Priyal'), ('Priyanka'),
  ('Rachael'), ('Rachel'), ('Raquel'), ('Sadia'), ('Sadiya'), ('Shinade'),
  ('Sinead'), ('Sofia'), ('Sofie'), ('Sophia'), ('Tyla'), ('Yuki'),
  ('Zainab'), ('Zaynab');

UPDATE users AS u
SET gender = CASE
  WHEN EXISTS (
    SELECT 1 FROM female_first_names f
    WHERE lower(f.fname) = lower(u.fname)
  ) THEN 'female'
  ELSE 'male'
END
WHERE u.gender IS NULL;

ALTER TABLE users ALTER COLUMN gender SET NOT NULL;

COMMIT;
