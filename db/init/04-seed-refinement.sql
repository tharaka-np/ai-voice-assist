-- Extra directory rows that make the conversational refinement flow reachable.
--
-- Runs after 03-gender.sql on a fresh volume, and is replayable the same way:
--
--   docker exec -i voice-extractor-db \
--     psql -U voice -d voice_extractor -v ON_ERROR_STOP=1 \
--     < db/init/04-seed-refinement.sql
--
-- ---------------------------------------------------------------------------
-- Why this file exists
--
-- 02-seed-users.sql is built around homophone clusters, which is the right shape
-- for testing *fuzzy scoring* but the wrong shape for testing *narrowing*: it
-- holds 97 distinct first names across 100 rows, so the largest number of people
-- sharing a first name is three. With MATCH_THRESHOLD at 5, a first-name search
-- always lands straight in selection mode and the refinement path never runs.
--
-- The rows below add one deliberately crowded cluster so the flow can actually
-- be demonstrated. They reproduce the specification's worked scenario:
--
--   "Find Tharaka"          -> 13 matches   (>= 5, so refinement stays active)
--   "He lives in Colombo"   ->  7 matches   (still >= 5)
--   "His last name is Perera" -> 2 matches  (below 5, selection offered)
--
-- Seven of the nine new rows are in Colombo and exactly two of those are named
-- Perera, which is what produces that sequence. The four Tharaka-alikes already
-- in 02-seed-users.sql (ids 3, 4, 17, 18) bring the first count to 13.
--
-- Addresses and phone numbers are fictional. Sri Lankan numbers use the +94 11
-- Colombo area code with the 555-01xx block reserved for fiction, and emails use
-- example.com, which RFC 2606 reserves and which cannot receive mail.
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TEMP TABLE refinement_users (
  fname        TEXT NOT NULL,
  lname        TEXT NOT NULL,
  street       TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email        TEXT NOT NULL PRIMARY KEY,
  gender       TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO refinement_users
  (fname, lname, street, city, state, phone_number, email, gender)
VALUES
  -- Colombo cluster: seven people, so the city filter alone still leaves the
  -- count at or above the threshold and a third detail is genuinely needed.
  ('Tharaka', 'Perera',          '14 Galle Road',          'Colombo', 'Western', '+94 (11) 555-0141', 'tharaka.perera@example.com',          'male'),
  ('Tharaka', 'Perera',          '221 Duplication Road',   'Colombo', 'Western', '+94 (11) 555-0142', 'tharaka.perera.2@example.com',        'male'),
  ('Tharaka', 'Silva',           '87 Baseline Road',       'Colombo', 'Western', '+94 (11) 555-0143', 'tharaka.silva@example.com',           'male'),
  ('Tharaka', 'Fernando',        '5 Marine Drive',         'Colombo', 'Western', '+94 (11) 555-0144', 'tharaka.fernando@example.com',        'male'),
  ('Tharaka', 'Jayasuriya',      '162 High Level Road',    'Colombo', 'Western', '+94 (11) 555-0145', 'tharaka.jayasuriya@example.com',      'male'),
  ('Tharaka', 'Bandara',         '39 Havelock Road',       'Colombo', 'Western', '+94 (11) 555-0146', 'tharaka.bandara@example.com',         'male'),
  ('Tharaka', 'Wickramasinghe',  '78 Nawala Road',         'Colombo', 'Western', '+94 (11) 555-0147', 'tharaka.wickramasinghe@example.com',  'male'),

  -- Outside Colombo, so the city filter has something to exclude.
  ('Tharaka', 'Gunasekara',      '23 Peradeniya Road',     'Kandy',   'Central', '+94 (81) 555-0148', 'tharaka.gunasekara@example.com',      'male'),
  ('Taraka',  'Mendis',          '11 Lighthouse Street',   'Galle',   'Southern','+94 (91) 555-0149', 'taraka.mendis@example.com',           'male');

-- Insert only what is missing, keyed on email, so a replay is a no-op.
INSERT INTO users (fname, lname, street, city, state, phone_number, email, gender)
SELECT r.fname, r.lname, r.street, r.city, r.state, r.phone_number, r.email, r.gender
FROM refinement_users AS r
WHERE NOT EXISTS (
  SELECT 1 FROM users AS u WHERE lower(u.email) = lower(r.email)
);

COMMIT;
