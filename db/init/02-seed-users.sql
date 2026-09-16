-- Seed data for the `users` directory.
--
-- Runs automatically after 01-schema.sql on a fresh volume, and is written so
-- the same file can be replayed against an already-running database:
--
--   docker exec -i voice-extractor-db \
--     psql -U voice -d voice_extractor -v ON_ERROR_STOP=1 \
--     < db/init/02-seed-users.sql
--
-- Replay is safe because the file
--   * adds the contact columns only if they are missing,
--   * backfills the original 14 rows in place rather than re-inserting them,
--   * inserts a row only when its email is not already present,
--   * applies NOT NULL last, once every row has values.
--
-- Nothing here depends on the volume being empty, so directory changes no
-- longer require `docker compose down -v` and the loss of saved meetings.
--
-- ---------------------------------------------------------------------------
-- Why these names
--
-- The directory is deliberately full of near-homophones, because that is the
-- failure mode speech-to-text actually produces: the engine hears the right
-- sound and writes the wrong spelling. Every cluster below is a set of
-- distinct people whose names are pronounced almost identically.
--
--   Amanda Wilson x2, Amanda Willson, Amandah Wilsen
--   Tharaka / Taraka / Dharaka Pathirana / Pathirane
--   Eric Poe, Erik Po, Erick Powe
--   Sean Brady, Shaun Bradey, Shawn Bradie
--   Catherine Lee, Katherine Lea, Kathryn Leigh
--   Sofia Andersson, Sophia Anderson, Sofie Andersen
--   Claire Bennett, Clare Benet, Clara Bennet
--   ... and around twenty more pairs
--
-- The two identical `Amanda Wilson` rows still force the disambiguation
-- picker; the homophone clusters give trigram scoring realistic competition,
-- so a capped fuzzy match has something to lose against.
--
-- Addresses, phone numbers and emails are fictional. Phone numbers use the
-- 555-01xx block reserved for fiction, and emails use example.com, which is
-- reserved by RFC 2606 and cannot receive mail.
-- ---------------------------------------------------------------------------

BEGIN;

-- Guards for volumes created before these columns existed. Added nullable so
-- the ALTER succeeds against a table that already has rows; tightened at the
-- bottom of this file once the backfill has run. No-ops on a fresh volume,
-- where 01-schema.sql already declared them NOT NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS street       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email        TEXT;

-- The seed list, held in a temp table so the backfill and the insert below can
-- be separate statements. A single statement with data-modifying CTEs would
-- not work here: the insert's "does this email exist" check would run against
-- the pre-backfill snapshot and duplicate the original rows.
--
-- `ord` is the intended id. Rows 1-14 match the ids the original seed created,
-- which is what lets the backfill find them.
CREATE TEMP TABLE seed_users (
  ord          INTEGER PRIMARY KEY,
  fname        TEXT NOT NULL,
  lname        TEXT NOT NULL,
  street       TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email        TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO seed_users
  (ord, fname, lname, street, city, state, phone_number, email)
VALUES
  -- The original 14. Ids preserved: docs, notes and manual test steps refer to
  -- "the second Amanda Wilson" as id 2 and to Tharaka as id 3.
  (  1, 'Amanda',    'Wilson',     '1420 Maple Street',        'Austin',         'TX', '+1 (512) 555-0101', 'amanda.wilson@example.com'),
  (  2, 'Amanda',    'Wilson',     '88 Cedar Lane',            'Dallas',         'TX', '+1 (214) 555-0102', 'amanda.wilson.2@example.com'),
  (  3, 'Tharaka',   'Pathirana',  '305 Birch Avenue',         'Houston',        'TX', '+1 (713) 555-0103', 'tharaka.pathirana@example.com'),
  (  4, 'Taraka',    'Pathirana',  '762 Willow Court',         'San Francisco',  'CA', '+1 (415) 555-0104', 'taraka.pathirana@example.com'),
  (  5, 'Eric',      'Poe',        '19 Harbor Road',           'San Jose',       'CA', '+1 (408) 555-0105', 'eric.poe@example.com'),
  (  6, 'Rachel',    'Taylor',     '2210 Sunset Boulevard',    'Los Angeles',    'CA', '+1 (213) 555-0106', 'rachel.taylor@example.com'),
  (  7, 'John',      'Doe',        '47 Pine Street',           'San Diego',      'CA', '+1 (619) 555-0107', 'john.doe@example.com'),
  (  8, 'James',     'Smith',      '1533 Union Avenue',        'Seattle',        'WA', '+1 (206) 555-0108', 'james.smith@example.com'),
  (  9, 'Elizabeth', 'Martinez',   '604 Alder Way',            'Portland',       'OR', '+1 (503) 555-0109', 'elizabeth.martinez@example.com'),
  ( 10, 'Tyler',     'Harris',     '91 Larimer Street',        'Denver',         'CO', '+1 (303) 555-0110', 'tyler.harris@example.com'),
  ( 11, 'Sadia',     'Test',       '3300 Camelback Road',      'Phoenix',        'AZ', '+1 (602) 555-0111', 'sadia.test@example.com'),
  ( 12, 'Kevin',     'Iaracey',    '780 Fremont Street',       'Las Vegas',      'NV', '+1 (702) 555-0112', 'kevin.iaracey@example.com'),
  ( 13, 'Carlos',    'Hernandez',  '125 Wacker Drive',         'Chicago',        'IL', '+1 (312) 555-0113', 'carlos.hernandez@example.com'),
  ( 14, 'Priyal',    'Fernando',   '56 Woodward Avenue',       'Detroit',        'MI', '+1 (313) 555-0114', 'priyal.fernando@example.com'),

  -- Homophones of the original 14. These are the rows that make a misheard
  -- spelling land on a real, wrong person instead of on nothing.
  ( 15, 'Amanda',    'Willson',    '4102 Hennepin Avenue',     'Minneapolis',    'MN', '+1 (612) 555-0115', 'amanda.willson@example.com'),
  ( 16, 'Amandah',   'Wilsen',     '218 High Street',          'Columbus',       'OH', '+1 (614) 555-0116', 'amandah.wilsen@example.com'),
  ( 17, 'Tharaka',   'Pathirane',  '970 Meridian Street',      'Indianapolis',   'IN', '+1 (317) 555-0117', 'tharaka.pathirane@example.com'),
  ( 18, 'Dharaka',   'Pathirana',  '331 Grand Boulevard',      'Kansas City',    'MO', '+1 (816) 555-0118', 'dharaka.pathirana@example.com'),
  ( 19, 'Erik',      'Po',         '1487 Olive Street',        'St. Louis',      'MO', '+1 (314) 555-0119', 'erik.po@example.com'),
  ( 20, 'Erick',     'Powe',       '62 Broadway',              'Nashville',      'TN', '+1 (615) 555-0120', 'erick.powe@example.com'),
  ( 21, 'Rachael',   'Tayler',     '809 Poplar Avenue',        'Memphis',        'TN', '+1 (901) 555-0121', 'rachael.tayler@example.com'),
  ( 22, 'Raquel',    'Taylour',    '275 Peachtree Street',     'Atlanta',        'GA', '+1 (404) 555-0122', 'raquel.taylour@example.com'),
  ( 23, 'Jon',       'Doh',        '1190 Tryon Street',        'Charlotte',      'NC', '+1 (704) 555-0123', 'jon.doh@example.com'),
  ( 24, 'Johne',     'Dough',      '44 Hillsborough Street',   'Raleigh',        'NC', '+1 (919) 555-0124', 'johne.dough@example.com'),
  ( 25, 'Jaimes',    'Smyth',      '2500 Brickell Avenue',     'Miami',          'FL', '+1 (305) 555-0125', 'jaimes.smyth@example.com'),
  ( 26, 'Jamie',     'Smithe',     '137 Orange Avenue',        'Orlando',        'FL', '+1 (407) 555-0126', 'jamie.smithe@example.com'),
  ( 27, 'Elisabeth', 'Martines',   '688 Kennedy Boulevard',    'Tampa',          'FL', '+1 (813) 555-0127', 'elisabeth.martines@example.com'),
  ( 28, 'Elizabet',  'Martinaz',   '25 Canal Street',          'New Orleans',    'LA', '+1 (504) 555-0128', 'elizabet.martinaz@example.com'),
  ( 29, 'Tylor',     'Harriss',    '411 Beacon Street',        'Boston',         'MA', '+1 (617) 555-0129', 'tylor.harriss@example.com'),
  ( 30, 'Tyla',      'Harrise',    '76 Westminster Street',    'Providence',     'RI', '+1 (401) 555-0130', 'tyla.harrise@example.com'),
  ( 31, 'Sadiya',    'Tesst',      '902 Asylum Avenue',        'Hartford',       'CT', '+1 (860) 555-0131', 'sadiya.tesst@example.com'),
  ( 32, 'Kevan',     'Iarasey',    '350 Fifth Avenue',         'New York',       'NY', '+1 (212) 555-0132', 'kevan.iarasey@example.com'),
  ( 33, 'Karlos',    'Hernandes',  '118 Bedford Avenue',       'Brooklyn',       'NY', '+1 (718) 555-0133', 'karlos.hernandes@example.com'),
  ( 34, 'Carlo',     'Hernandaz',  '57 Elmwood Avenue',        'Buffalo',        'NY', '+1 (716) 555-0134', 'carlo.hernandaz@example.com'),
  ( 35, 'Priyaal',   'Fernandu',   '240 Market Street',        'Newark',         'NJ', '+1 (973) 555-0135', 'priyaal.fernandu@example.com'),
  ( 36, 'Priyanka',  'Fernandes',  '1616 Walnut Street',       'Philadelphia',   'PA', '+1 (215) 555-0136', 'priyanka.fernandes@example.com'),

  -- New homophone clusters, so the hard cases are not all variations of the
  -- same fourteen names.
  ( 37, 'Sean',      'Brady',      '505 Liberty Avenue',       'Pittsburgh',     'PA', '+1 (412) 555-0137', 'sean.brady@example.com'),
  ( 38, 'Shaun',     'Bradey',     '39 Charles Street',        'Baltimore',      'MD', '+1 (410) 555-0138', 'shaun.bradey@example.com'),
  ( 39, 'Shawn',     'Bradie',     '1204 Cary Street',         'Richmond',       'VA', '+1 (804) 555-0139', 'shawn.bradie@example.com'),
  ( 40, 'Catherine', 'Lee',        '87 State Street',          'Salt Lake City', 'UT', '+1 (801) 555-0140', 'catherine.lee@example.com'),
  ( 41, 'Katherine', 'Lea',        '1330 Idaho Street',        'Boise',          'ID', '+1 (208) 555-0141', 'katherine.lea@example.com'),
  ( 42, 'Kathryn',   'Leigh',      '620 Farnam Street',        'Omaha',          'NE', '+1 (402) 555-0142', 'kathryn.leigh@example.com'),
  ( 43, 'Erin',      'Marshall',   '15 Gorham Street',         'Madison',        'WI', '+1 (608) 555-0143', 'erin.marshall@example.com'),
  ( 44, 'Aaron',     'Marshal',    '2140 Kilbourn Avenue',     'Milwaukee',      'WI', '+1 (414) 555-0144', 'aaron.marshal@example.com'),
  ( 45, 'Stephen',   'Clark',      '733 Central Avenue',       'Albuquerque',    'NM', '+1 (505) 555-0145', 'stephen.clark@example.com'),
  ( 46, 'Steven',    'Clarke',     '96 Reno Avenue',           'Oklahoma City',  'OK', '+1 (405) 555-0146', 'steven.clarke@example.com'),
  ( 47, 'Brian',     'Kelly',      '1802 Cantrell Road',       'Little Rock',    'AR', '+1 (501) 555-0147', 'brian.kelly@example.com'),
  ( 48, 'Bryan',     'Kelley',     '210 Morris Avenue',        'Birmingham',     'AL', '+1 (205) 555-0148', 'bryan.kelley@example.com'),
  ( 49, 'Dilhan',    'Perera',     '1455 Bardstown Road',      'Louisville',     'KY', '+1 (502) 555-0149', 'dilhan.perera@example.com'),
  ( 50, 'Dilan',     'Pereira',    '68 Ingersoll Avenue',      'Des Moines',     'IA', '+1 (515) 555-0150', 'dilan.pereira@example.com'),
  ( 51, 'Nuwan',     'Silva',      '2033 Congress Avenue',     'Austin',         'TX', '+1 (512) 555-0151', 'nuwan.silva@example.com'),
  ( 52, 'Nawan',     'Silwa',      '940 Elm Street',           'Dallas',         'TX', '+1 (214) 555-0152', 'nawan.silwa@example.com'),
  ( 53, 'Sanjay',    'Kumar',      '77 Westheimer Road',       'Houston',        'TX', '+1 (713) 555-0153', 'sanjay.kumar@example.com'),
  ( 54, 'Sanjai',    'Kumaar',     '1265 Mission Street',      'San Francisco',  'CA', '+1 (415) 555-0154', 'sanjai.kumaar@example.com'),
  ( 55, 'Aisha',     'Rahman',     '388 Almaden Boulevard',    'San Jose',       'CA', '+1 (408) 555-0155', 'aisha.rahman@example.com'),
  ( 56, 'Ayesha',    'Rehman',     '5120 Wilshire Boulevard',  'Los Angeles',    'CA', '+1 (213) 555-0156', 'ayesha.rehman@example.com'),
  ( 57, 'Mohamed',   'Ali',        '233 Garnet Avenue',        'San Diego',      'CA', '+1 (619) 555-0157', 'mohamed.ali@example.com'),
  ( 58, 'Muhammad',  'Alie',       '1109 Pike Street',         'Seattle',        'WA', '+1 (206) 555-0158', 'muhammad.alie@example.com'),
  ( 59, 'Maria',     'Gonzalez',   '415 Burnside Street',      'Portland',       'OR', '+1 (503) 555-0159', 'maria.gonzalez@example.com'),
  ( 60, 'Mariah',    'Gonzales',   '82 Blake Street',          'Denver',         'CO', '+1 (303) 555-0160', 'mariah.gonzales@example.com'),
  ( 61, 'Jose',      'Ramirez',    '2701 Van Buren Street',    'Phoenix',        'AZ', '+1 (602) 555-0161', 'jose.ramirez@example.com'),
  ( 62, 'Josue',     'Ramires',    '640 Paradise Road',        'Las Vegas',      'NV', '+1 (702) 555-0162', 'josue.ramires@example.com'),
  ( 63, 'Lucia',     'Rossi',      '1470 Halsted Street',      'Chicago',        'IL', '+1 (312) 555-0163', 'lucia.rossi@example.com'),
  ( 64, 'Lucea',     'Rosi',       '305 Cass Avenue',          'Detroit',        'MI', '+1 (313) 555-0164', 'lucea.rosi@example.com'),
  ( 65, 'Elena',     'Petrova',    '921 Lyndale Avenue',       'Minneapolis',    'MN', '+1 (612) 555-0165', 'elena.petrova@example.com'),
  ( 66, 'Elana',     'Petrov',     '148 Front Street',         'Columbus',       'OH', '+1 (614) 555-0166', 'elana.petrov@example.com'),
  ( 67, 'Wei',       'Chen',       '3060 College Avenue',      'Indianapolis',   'IN', '+1 (317) 555-0167', 'wei.chen@example.com'),
  ( 68, 'Wai',       'Chin',       '512 Walnut Street',        'Kansas City',    'MO', '+1 (816) 555-0168', 'wai.chin@example.com'),
  ( 69, 'Lee',       'Wong',       '1899 Locust Street',       'St. Louis',      'MO', '+1 (314) 555-0169', 'lee.wong@example.com'),
  ( 70, 'Lei',       'Wang',       '244 Demonbreun Street',    'Nashville',      'TN', '+1 (615) 555-0170', 'lei.wang@example.com'),
  ( 71, 'Hiroshi',   'Tanaka',     '1035 Union Avenue',        'Memphis',        'TN', '+1 (901) 555-0171', 'hiroshi.tanaka@example.com'),
  ( 72, 'Hiroshe',   'Tanaca',     '590 Ponce de Leon Avenue', 'Atlanta',        'GA', '+1 (404) 555-0172', 'hiroshe.tanaca@example.com'),
  ( 73, 'Yuki',      'Sato',       '76 Morehead Street',       'Charlotte',      'NC', '+1 (704) 555-0173', 'yuki.sato@example.com'),
  ( 74, 'Yuuki',     'Satou',      '1408 Glenwood Avenue',     'Raleigh',        'NC', '+1 (919) 555-0174', 'yuuki.satou@example.com'),
  ( 75, 'Sofia',     'Andersson',  '330 Collins Avenue',       'Miami',          'FL', '+1 (305) 555-0175', 'sofia.andersson@example.com'),
  ( 76, 'Sophia',    'Anderson',   '1122 Colonial Drive',      'Orlando',        'FL', '+1 (407) 555-0176', 'sophia.anderson@example.com'),
  ( 77, 'Sofie',     'Andersen',   '47 Dale Mabry Highway',    'Tampa',          'FL', '+1 (813) 555-0177', 'sofie.andersen@example.com'),
  ( 78, 'Claire',    'Bennett',    '812 Magazine Street',      'New Orleans',    'LA', '+1 (504) 555-0178', 'claire.bennett@example.com'),
  ( 79, 'Clare',     'Benet',      '260 Newbury Street',       'Boston',         'MA', '+1 (617) 555-0179', 'clare.benet@example.com'),
  ( 80, 'Clara',     'Bennet',     '91 Thayer Street',         'Providence',     'RI', '+1 (401) 555-0180', 'clara.bennet@example.com'),
  ( 81, 'Neil',      'Patterson',  '1560 Farmington Avenue',   'Hartford',       'CT', '+1 (860) 555-0181', 'neil.patterson@example.com'),
  ( 82, 'Neal',      'Paterson',   '18 Lexington Avenue',      'New York',       'NY', '+1 (212) 555-0182', 'neal.paterson@example.com'),
  ( 83, 'Marcus',    'Reed',       '705 Flatbush Avenue',      'Brooklyn',       'NY', '+1 (718) 555-0183', 'marcus.reed@example.com'),
  ( 84, 'Markus',    'Reid',       '1237 Delaware Avenue',     'Buffalo',        'NY', '+1 (716) 555-0184', 'markus.reid@example.com'),
  ( 85, 'Alan',      'Wright',     '66 Broad Street',          'Newark',         'NJ', '+1 (973) 555-0185', 'alan.wright@example.com'),
  ( 86, 'Allen',     'Write',      '2044 Chestnut Street',     'Philadelphia',   'PA', '+1 (215) 555-0186', 'allen.write@example.com'),
  ( 87, 'Farhan',    'Iqbal',      '519 Forbes Avenue',        'Pittsburgh',     'PA', '+1 (412) 555-0187', 'farhan.iqbal@example.com'),
  ( 88, 'Farhaan',   'Ikbal',      '1380 Light Street',        'Baltimore',      'MD', '+1 (410) 555-0188', 'farhaan.ikbal@example.com'),
  ( 89, 'Zainab',    'Khan',       '274 Broad Street',         'Richmond',       'VA', '+1 (804) 555-0189', 'zainab.khan@example.com'),
  ( 90, 'Zaynab',    'Kaan',       '1701 Foothill Drive',      'Salt Lake City', 'UT', '+1 (801) 555-0190', 'zaynab.kaan@example.com'),
  ( 91, 'Ravi',      'Shankar',    '58 Warm Springs Avenue',   'Boise',          'ID', '+1 (208) 555-0191', 'ravi.shankar@example.com'),
  ( 92, 'Ravee',     'Shankher',   '1195 Dodge Street',        'Omaha',          'NE', '+1 (402) 555-0192', 'ravee.shankher@example.com'),
  ( 93, 'Anjali',    'Nair',       '430 Monroe Street',        'Madison',        'WI', '+1 (608) 555-0193', 'anjali.nair@example.com'),
  ( 94, 'Anjuli',    'Naire',      '2612 Wells Street',        'Milwaukee',      'WI', '+1 (414) 555-0194', 'anjuli.naire@example.com'),
  ( 95, 'Karthik',   'Iyer',       '145 Lomas Boulevard',      'Albuquerque',    'NM', '+1 (505) 555-0195', 'karthik.iyer@example.com'),
  ( 96, 'Kartick',   'Ayer',       '907 Classen Boulevard',    'Oklahoma City',  'OK', '+1 (405) 555-0196', 'kartick.ayer@example.com'),
  ( 97, 'Niamh',     'Walsh',      '1622 Kavanaugh Boulevard', 'Little Rock',    'AR', '+1 (501) 555-0197', 'niamh.walsh@example.com'),
  ( 98, 'Neve',      'Walshe',     '384 Highland Avenue',      'Birmingham',     'AL', '+1 (205) 555-0198', 'neve.walshe@example.com'),
  ( 99, 'Sinead',    'Murphy',     '1044 Frankfort Avenue',    'Louisville',     'KY', '+1 (502) 555-0199', 'sinead.murphy@example.com'),
  (100, 'Shinade',   'Murphey',    '217 Grand Avenue',         'Des Moines',     'IA', '+1 (515) 555-0200', 'shinade.murphey@example.com');

-- Backfill rows that already exist. Matching on id *and* name means a row that
-- has since been edited or replaced is left alone rather than overwritten with
-- someone else's address.
UPDATE users AS u
SET street       = s.street,
    city         = s.city,
    state        = s.state,
    phone_number = s.phone_number,
    email        = s.email
FROM seed_users AS s
WHERE u.id = s.ord
  AND u.fname = s.fname
  AND u.lname = s.lname;

-- Insert whatever is still missing. Email is the identity check, so a replay
-- adds nothing. ORDER BY ord makes the assigned ids follow the list on a fresh
-- volume, which is what keeps "Amanda Wilson is 1 and 2" true.
INSERT INTO users (fname, lname, street, city, state, phone_number, email)
SELECT s.fname, s.lname, s.street, s.city, s.state, s.phone_number, s.email
FROM seed_users AS s
WHERE NOT EXISTS (
  SELECT 1 FROM users AS u WHERE lower(u.email) = lower(s.email)
)
ORDER BY s.ord;

-- Guard for volumes created before 01-schema.sql declared this index. Created
-- after the backfill, because it cannot be built while emails are still null.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

-- Tighten the contact columns now that every row has values. No-ops on a fresh
-- volume. On an existing volume these will fail loudly if some hand-added row
-- was left without contact details, which is the intended outcome: fix the row
-- rather than weaken the table.
ALTER TABLE users ALTER COLUMN street       SET NOT NULL;
ALTER TABLE users ALTER COLUMN city         SET NOT NULL;
ALTER TABLE users ALTER COLUMN state        SET NOT NULL;
ALTER TABLE users ALTER COLUMN phone_number SET NOT NULL;
ALTER TABLE users ALTER COLUMN email        SET NOT NULL;

COMMIT;
