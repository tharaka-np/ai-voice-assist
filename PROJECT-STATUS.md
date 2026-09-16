# Project Status — Handoff Summary

Written to carry context into a new session. Reference it with `#File` and the
next session can pick up without re-deriving anything.

**Workspace:** `/Users/tharakapathirana/Desktop/projects/spice-crm-work`
**Last verified:** typecheck 0, lint 0, 223 tests across 8 files, build 0

---

## 1. What this project is

Two related things live in this workspace.

**A design document** — `SpiceCRM_Core_Voice_Assistant_Technical_Design_v1.1.pdf`
(16 pages, dated 1 September 2026). It specifies a push-to-talk voice assistant
for SpiceCRM Core: speak a meeting update, review an editable confirmation card,
explicitly save. Its governing principle is *AI proposes; SpiceCRM resolves,
validates, confirms and writes*. Target stack is Angular frontend + PHP backend.

**A working Next.js app** — built in this workspace as a standalone prototype of
that idea. It is **not** SpiceCRM code and none of it ports directly (different
language and framework), but it implements the same pipeline and the same safety
boundaries.

Also present: `voice-assistant-how-it-works.md`, six Mermaid diagrams explaining
the design to non-technical stakeholders.

---

## 2. What the app does

```text
Record audio (browser)
   ↓
POST /api/process-audio
   ├── validate           size, container, timezone, timestamp, provider id
   ├── transcribe         OpenAI or Deepgram, chosen per request
   ├── extract            OpenAI Structured Outputs, strict JSON Schema
   ├── normalise + Zod    repair formatting, then validate independently
   └── resolve name       rank matches from the Postgres users table
   ↓
Confirmation form         pick the person, edit date / time / description
   ↓
POST /api/meetings        the only write path
   ↓
Row in the meetings table
```

The boundary that matters: **the AI returns a name string; only Postgres resolves
it to an id.** No row is written that a person has not confirmed.

---

## 3. Stack (exact installed versions)

| Package | Version |
|---|---|
| next | 16.3.4 |
| react / react-dom | 19.2.8 |
| typescript | ^5 (strict) |
| tailwindcss | v4 (`@import "tailwindcss"`, `@tailwindcss/postcss`) |
| openai | 6.49.0 |
| zod | 4.5.4 |
| pg | 8.23.0 |
| @types/pg | 8.23.1 |
| server-only | 0.0.1 |
| vitest | 4.1.11 |
| eslint | ^9 (flat config, script is `eslint` not `next lint`) |

No ORM, no component library, no state manager, no HTTP client, no date library.
Path alias `@/*` → `./*`. No `src/` directory. **No git repo at root** — this was
deliberate, not an oversight.

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`.

---

## 4. Running it

```bash
npm install
docker compose up -d      # Postgres, seeded on first start
npm run dev
```

`.env.local` already exists with `OPENAI_API_KEY` and `DATABASE_URL` set.

| Variable | Status |
|---|---|
| `OPENAI_API_KEY` | **set** — required, used for extraction and OpenAI transcription |
| `DATABASE_URL` | **set** — `postgres://voice:localdevpassword@localhost:5432/voice_extractor` |
| `DEEPGRAM_API_KEY` | **not set** — Deepgram shows in the UI but disabled |
| `TRANSCRIPTION_PROVIDER` | optional, defaults `openai` |
| `TRANSCRIPTION_KEYTERMS` | optional, defaults to two demo names |
| `OPENAI_TRANSCRIBE_MODEL` | optional, defaults `gpt-4o-transcribe` |
| `DEEPGRAM_MODEL` | optional, defaults `nova-3` |
| `OPENAI_EXTRACTION_MODEL` | optional, defaults `gpt-4.1-mini` |

---

## 5. Database

Postgres 16 in Docker, container `voice-extractor-db`, bound to `127.0.0.1:5432`
only.

```sql
users     (id SERIAL, fname TEXT, lname TEXT,
           street TEXT, city TEXT, state TEXT, phone_number TEXT, email TEXT)
meetings  (id SERIAL, user_id INT FK, "date" DATE, "time" TIME,
           description TEXT, created_at TIMESTAMPTZ DEFAULT now())
```

All columns `NOT NULL`. `"date"` and `"time"` are **quoted everywhere** — both are
SQL keywords.

Also created: `pg_trgm` extension, an `IMMUTABLE normalize_name()` function, a GIN
trigram index on `normalize_name(fname || ' ' || lname)`, and a unique index on
`lower(email)` (the seed uses email as a row's identity).

The five contact columns carry no application code yet — nothing reads them, and
`SELECT id, fname, lname` in `lib/db/users.ts` is unchanged. They exist so the
directory looks like a real one and so a future contact card has data to show.

**Seed data — 100 users**, in `db/init/02-seed-users.sql`:
- ids 1 and 2 are both `Amanda Wilson` → forces the disambiguation picker
- the rest is built from clusters of **near-homophones**: distinct people whose
  names sound nearly identical, which is the failure speech-to-text actually
  produces. `Tharaka / Taraka / Dharaka Pathirana|Pathirane`, `Sean Brady /
  Shaun Bradey / Shawn Bradie`, `Catherine Lee / Katherine Lea / Kathryn Leigh`,
  `Sofia Andersson / Sophia Anderson / Sofie Andersen`, and roughly twenty more
- ids 1–14 are the original fourteen, ids and order preserved, now backfilled
  with contact details
- addresses are fictional; phones use the `555-01xx` fiction block, emails use
  `example.com` (RFC 2606, cannot receive mail)

`meetings` has **2 rows** from manual UI testing.

**Important:** `01-schema.sql` only runs on an empty volume. `02-seed-users.sql`
is deliberately **replayable** — it adds columns only if missing, backfills in
place, inserts only unseen emails, and sets `NOT NULL` last:

```bash
docker exec -i voice-extractor-db \
  psql -U voice -d voice_extractor -v ON_ERROR_STOP=1 \
  < db/init/02-seed-users.sql
```

That is how the 100-user set was applied without `down -v`, keeping the saved
meetings. Running it twice is a no-op (verified).

---

## 6. File map

```text
app/
├── api/process-audio/route.ts    transcribe → extract → resolve name
├── api/users/search/route.ts     GET ?q=  manual directory lookup
├── api/meetings/route.ts         POST     the only write path
├── page.tsx                      Server Component shell
├── layout.tsx
└── globals.css

components/
├── voice-extractor.tsx           the single "use client" state owner
├── provider-selector.tsx         transcription engine radio group
├── audio-recorder.tsx            capture controls (presentational)
├── audio-player.tsx
├── transcript-card.tsx           transcript + engine/model/latency badge
├── meeting-form.tsx              editable confirmation step
├── user-picker.tsx               candidate list + directory search
├── saved-meeting.tsx             terminal success state
├── extraction-result.tsx         "what the AI proposed", for reference
├── raw-json.tsx                  collapsible payload + Copy JSON
└── ui/                           button, card, alert

hooks/use-audio-recorder.ts       MediaRecorder lifecycle

lib/
├── audio/formats.ts              format policy shared by client and server
├── audio/validation.ts           request validation
├── cn.ts, errors.ts, format.ts
├── db/client.ts                  pool on globalThis, query() wrapper
├── db/users.ts                   candidate search, user lookup
├── db/meetings.ts                insert, recent meetings
├── matching/name-match.ts        pure normalising, scoring, resolution policy
├── transcription/types.ts        provider contract (client-safe)
├── transcription/transcript.ts   shared empty-transcript guard
├── transcription/vocabulary.ts   keyterm hint set + budgeting
├── transcription/registry.ts     provider lookup, availability, default
├── deepgram/{client,request,response,transcribe}.ts
└── openai/{client,transcribe,extract-structured,extract-meeting-info}.ts

schemas/
├── extraction-schema.ts          swappable descriptor contract
├── meeting.ts                    what the AI proposed (nulls allowed)
├── meeting-submission.ts         what a human approved (no nulls)
└── user.ts                       Zod row schemas

types/api.ts, types/server-only.d.ts
tests/                            8 files, 223 tests
db/init/01-schema.sql             tables, pg_trgm, normalize_name, indexes
db/init/02-seed-users.sql         100 users, replayable against a live volume
docker-compose.yml
vitest.config.mts                 .mts extension avoids a Vite CJS warning
```

---

## 7. Design decisions already made (don't re-litigate)

**Transcription is an adapter.** `lib/transcription/types.ts` defines a
four-member interface: `id`, `getModel()`, `isConfigured()`, `transcribe()`, plus
`supportsKeyterms`. `registry.ts` is the only file that knows which engines exist.
The route resolves by id and imports neither vendor. Adding a third engine is one
implementation plus one registry entry.

**Extraction stays on OpenAI.** It depends on strict JSON Schema Structured
Outputs, which Deepgram does not provide. Only transcription is switchable.

**Name scoring is tiered, and Postgres owns the raw numbers.** SQL returns three
exact-match booleans plus `pg_trgm` `similarity()`. TypeScript applies the tiers:
1.0 exact full name, 0.9 reversed, 0.8 first-or-last only, else `min(0.79,
trigram)`. Fuzzy is capped below every exact tier so a close spelling can never
outrank a real match. Thresholds: `MIN_TRIGRAM_SIMILARITY` 0.35,
`AUTO_SELECT_SCORE` 0.95, `MAX_CANDIDATES` 8. Outcomes: `resolved` (one candidate
≥ 0.95, preselected but changeable), `ambiguous` (user must choose),
`unresolved` (search box offered). **This was explicitly verified as non-AI** —
the AI's strict schema has only four fields and cannot return an id or a score.

**Normalisation is duplicated on purpose.** `normalizeName` in TypeScript and
`normalize_name` in SQL must behave identically or an exact match scores as fuzzy.
The trigram index is built on the SQL function so searches stay index-backed
(measured at 5–8 ms).

**Two meeting schemas.** `MeetingInfoSchema` allows null everywhere (what the
model proposed). `MeetingSubmissionSchema` allows null nowhere (what a human
approved), because `date` and `time` are `NOT NULL`. A recording that never stated
a time must be completed on the form.

**Dates and times are cast to text in SQL** via `to_char`, not left to the driver.
`pg` returns `DATE` as a JS `Date` at local midnight, which renders as the
previous day west of UTC. Tests assert a raw `14:00:00` or a `Date` object is
rejected.

**The pool lives on `globalThis`.** Next.js re-evaluates modules on every save in
dev; a module-level pool would leak sockets until Postgres refused connections.
This is why `lib/db/client.ts` differs from `lib/openai/client.ts`.

**`server-only` is enforcement, not convention.** All of `lib/openai/*`,
`lib/deepgram/*` and `lib/db/*` import it. This was *proven* by temporarily
importing `getOpenAIClient` into a client component — the build failed with an
import trace, then was reverted.

**Wall-clock storage, no timezone conversion.** `meetings` has no timezone column;
what is saved is exactly what the user confirmed.

---

## 8. User decisions on record

| Question | Answer |
|---|---|
| ORM or raw driver? | Postgres + raw `pg` |
| Must date and time be filled before submit? | Yes, `NOT NULL` |
| Wall-clock storage with no timezone? | Fine |
| Add `created_at`? | Yes |
| Wire keyterms to the users table? | Not yet |

---

## 9. Known gaps, roughly by priority

1. **No authentication on `POST /api/meetings`.** It writes to the database and is
   open to anyone who can reach the server. The most important gap.
2. **No duplicate-submit protection.** The Save button disables during a request,
   but that is usability, not a guarantee — a network retry can create two rows.
   The design doc's idempotency key is the durable fix.
3. **No rate limiting** ahead of the paid provider calls.
4. **Deepgram has never been tested against the live API** — no key available. The
   request we construct is asserted by a test that pins the exact URL, but the
   response path is unproven.
5. **The provider benchmark is uneven.** Keyterms run on Deepgram only; OpenAI's
   `prompt` hints are not wired, so `supportsKeyterms` is false there. Fine if
   labelled, but not a fair engine comparison. The design doc's 97% name-accuracy
   gate assumes hints on both sides.
6. **Keyterms are hardcoded** to `Amanda Wilson` and `Tharaka Pathirana`. Sourcing
   them from the `users` table is a small change with high demo value.
7. **The upload path is unreachable.** The user commented out the upload button in
   `audio-recorder.tsx`; the hidden file input and `onSelectFile` prop are still
   wired but nothing triggers them. `remainingSeconds` and `maxDuration` are
   commented out to match.

---

## 10. Alignment with the design document

The app now covers all five responsibilities from §1 of the PDF in simplified
form — browser capture, speech-to-text, structured extraction, record resolution
and controlled writes.

What it does **not** cover: idempotency and concurrency (§10.2), per-user rate
limiting (§12.1), authentication and ACLs, the audit and telemetry fields (§13),
fuzzy date semantics kept as `week_of` values (§8.2), the `needs_clarification`
channel, meeting/note/task variety (§3.1), and the SpiceCRM platform itself.

The extraction schema is also flat (`name`, `meetingDate`, `meetingTime`,
`notes`) rather than the doc's `target` / `actions[]` structure.

---

## 11. Technology evaluations completed

| Tool | Verdict |
|---|---|
| **Deepgram Nova-3** | **Integrated.** Switchable in the UI. Keyterm prompting is its advantage; Nova-3 only, up to 100 terms, 500-token hard cap, 20–50 recommended. Signup includes $200 free credit. |
| **LiveKit** | Not a provider — it orchestrates other vendors for realtime conversation. Revisit at a later phase if back-and-forth voice is needed. |
| **Voicebox** (voicebox.sh) | Not suitable. It is a local-first TTS / voice-cloning studio, no hosted API. It *does* expose a self-hostable FastAPI backend and a Remote Mode, so integration is possible if "audio must stay on our infrastructure" becomes a requirement. Note: `agjs/voicebox` is a different project — an OpenAI-compatible self-hosted speech server that would slot in far more easily. |

**Cost:** roughly $0.003–$0.0077 per audio minute across all options. At 100
active users the entire spread is about $50/month, so choose on accuracy, not
price. Third-party pricing sources disagreed materially; verify on official pages
before budgeting.

---

## 12. Environment gotchas (saves rediscovery)

- **`execute_bash` working directory goes stale.** Use absolute paths.
- **`psql` backslash meta-commands** like `\dt` break compound shell commands. Use
  `information_schema` queries or a `.sql` file instead.
- **`$VAR` used as a command does not expand** in this zsh setup.
- **Docker daemon** needed `open -a Docker`; it was not running.
- **`psql` is not installed on the host** — use `docker exec`, or a GUI client
  (host → `localhost:5432` connectivity is confirmed working).
- **`create-next-app` refuses the workspace root** because of the existing PDF and
  `.md` files. It was scaffolded into a subdirectory and moved up.
- **`LayoutProps<"/">`** requires generated `.next/types`, so `tsc --noEmit` fails
  on a clean checkout. `app/layout.tsx` types `children` explicitly instead.
- **ESLint `react-hooks/set-state-in-effect`** rejected two patterns, both fixed
  properly rather than suppressed: capability detection now uses
  `useSyncExternalStore` with a server snapshot, and form reset uses a changing
  `key` to remount rather than syncing props into state.

---

## 13. Verification approach used so far

Every change was checked with `typecheck`, `lint`, `test` and `build`, plus live
`curl` against a running server. Notable live checks already performed:

- Name resolution: unique / duplicate / near-miss / no-match / punctuation cases
- `POST /api/meetings`: 201, 405, 404, and four distinct 400s
- Full save flow: picked the *second* Amanda Wilson, confirmed the row in `psql`
- Client bundle scanned for `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, provider URLs
  and `sk-` literals — clean apart from the variable *names* appearing as UI help
  text
- Scoring proven to be Postgres-side, not AI-side, three independent ways

Two real bugs were found by verification rather than by reading: absent keys were
left `undefined` instead of `null` in the normaliser, and the capability-detection
effect caused cascading renders.

---

## 14. Suggested next steps

Pick from the gaps in §9. In rough order of value:

1. Authentication on the write endpoint
2. Duplicate-submit protection via an idempotency key
3. Source keyterms from the `users` table (small, good demo value)
4. Wire OpenAI `prompt` hints so the engine benchmark is fair
5. Add a Deepgram key and run the 97% name-accuracy benchmark
