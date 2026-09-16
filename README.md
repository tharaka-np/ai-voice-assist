# AI Voice Information Extractor

Record your voice, get back structured data. Audio is transcribed with OpenAI
speech-to-text, then a schema-constrained extraction pass turns the transcript
into a validated JSON record.

The browser never talks to OpenAI. All provider calls happen inside a single
Next.js route handler.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then add your OPENAI_API_KEY
docker compose up -d               # Postgres, seeded on first start
npm run dev
```

Open http://localhost:3000.

Requires Node.js 20 or newer and Docker.

### Database

`docker compose up -d` starts Postgres 16 on `127.0.0.1:5432` (loopback only) and
runs the files in `db/init/` in filename order: `01-schema.sql` creates both
tables, `02-seed-users.sql` seeds 100 users.

```bash
docker compose ps                  # check health
docker compose logs -f db          # follow logs
docker compose down                # stop, keep data
docker compose down -v             # stop and wipe data
```

**The init scripts run once.** Postgres only executes files in
`/docker-entrypoint-initdb.d/` when the data directory is empty, so editing
`01-schema.sql` later has no effect until you drop the volume with
`docker compose down -v`.

`02-seed-users.sql` is the exception. It is written to be replayable, so
directory changes do not cost you the meetings you have saved:

```bash
docker exec -i voice-extractor-db \
  psql -U voice -d voice_extractor -v ON_ERROR_STOP=1 \
  < db/init/02-seed-users.sql
```

It adds its columns only if they are missing, backfills existing rows in place,
inserts a row only when its email is absent, and applies `NOT NULL` last. Running
it twice changes nothing the second time.

A quick look at what is stored:

```bash
docker exec -it voice-extractor-db psql -U voice -d voice_extractor \
  -c 'SELECT * FROM meetings ORDER BY id;'
```

### Try it

Press **Start recording** and say:

> My name is Tharaka. I want to schedule a meeting on September 20th, 2026 at
> 2 PM. The purpose of the meeting is to discuss the upcoming ScriptTrainer
> release.

Expected result:

```json
{
  "name": "Tharaka",
  "meetingDate": "2026-09-20",
  "meetingTime": "14:00",
  "notes": "Discuss the upcoming ScriptTrainer release"
}
```

## Scripts

| Command             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `npm run dev`       | Development server                      |
| `npm run build`     | Production build                        |
| `npm start`         | Serve the production build              |
| `npm run lint`      | ESLint                                  |
| `npm run typecheck` | `tsc --noEmit`                          |
| `npm test`          | Vitest, single run                      |
| `npm run test:watch`| Vitest in watch mode                    |

## Environment

| Variable                   | Required | Default             |
| -------------------------- | -------- | ------------------- |
| `OPENAI_API_KEY`           | yes      | —                   |
| `DATABASE_URL`             | yes      | —                   |
| `DEEPGRAM_API_KEY`         | no       | —                   |
| `TRANSCRIPTION_PROVIDER`   | no       | `openai`            |
| `TRANSCRIPTION_KEYTERMS`   | no       | two demo names      |
| `OPENAI_TRANSCRIBE_MODEL`  | no       | `gpt-4o-transcribe` |
| `DEEPGRAM_MODEL`           | no       | `nova-3`            |
| `OPENAI_EXTRACTION_MODEL`  | no       | `gpt-4.1-mini`      |

`OPENAI_API_KEY` is required because extraction always runs on OpenAI Structured
Outputs. `DEEPGRAM_API_KEY` is optional and only enables Deepgram as a
transcription choice — without it the option appears in the UI but is disabled.

None of these have a `NEXT_PUBLIC_` variant, by design.

## Choosing a transcription engine

Transcription runs behind an adapter, so the engine is a per-request choice
rather than a deploy-time decision.

| Engine   | Model               | Notes                                        |
| -------- | ------------------- | -------------------------------------------- |
| OpenAI   | `gpt-4o-transcribe` | Strong general accuracy and punctuation       |
| Deepgram | `nova-3`            | Fast; supports keyterm prompting for proper nouns |

The picker sits at the top of the Record card and is visible before recording.
An engine with no API key stays listed but disabled and labelled "Not
configured", so a missing key never looks like a missing feature.

Each result is tagged with the engine, model and latency that produced it, and
results are kept per engine. To compare them on one recording: record once,
extract, switch the engine, extract again. Both results stack for side-by-side
review. Extraction is identical across both, so any difference you see comes
from the transcript.

Only transcription is switchable. Extraction stays on OpenAI because it depends
on strict JSON Schema Structured Outputs, which Deepgram does not provide.

## Keyterm prompting (Deepgram)

Deepgram can be biased toward proper nouns it should expect, which is the feature
that matters most here: a misheard name is the failure that breaks everything
downstream.

The hint set defaults to two demo names, `Amanda Wilson` and
`Tharaka Pathirana`, and is overridable with `TRANSCRIPTION_KEYTERMS` as a
comma-separated list. The names appear as tags under the Deepgram option in the
UI, and each result reports how many were applied.

Terms are sent as repeated query parameters — `?keyterm=Amanda+Wilson&keyterm=Tharaka+Pathirana`
— which is the only form Deepgram acts on.

### Limits, and why we budget below them

| Limit | Value | Ours |
|---|---|---|
| Maximum terms | 100 | Enforced |
| Tokens per request | 500, errors above | Budgeted to 400 |
| Recommended | 20–50 terms | Guidance |

Deepgram does not publish its tokeniser, so `estimateKeytermTokens` is a
deliberately pessimistic heuristic — roughly a token per four characters per
word — and the budget leaves headroom rather than packing to the cap.

Input order is priority order. Once the budget is spent, `prepareKeyterms` stops
rather than skipping ahead, so a long high-priority name is never dropped to fit a
short low-priority one.

### The failure mode worth knowing about

Three syntax mistakes are accepted by Deepgram and then silently boost nothing:
comma-separated terms, semicolon-separated terms, and legacy `term:weight`
syntax. None returns an error, so the feature looks ineffective rather than
broken.

`sanitizeKeyterm` strips those characters so a malformed entry degrades to a
usable term, and `tests/keyterms.test.ts` asserts the generated query string
contains no commas. Keyterms also require Nova-3; on an older model the parameter
is ignored rather than rejected.

### Fairness note for a benchmark

Keyterms run on Deepgram only. OpenAI's transcription endpoint takes free-text
context through a `prompt` parameter instead of a term list, and that is not
wired up — `supportsKeyterms` is `false` for OpenAI and the UI does not advertise
it there. So the current comparison is Deepgram-with-hints against
OpenAI-without. That is a legitimate comparison as long as it is labelled as one;
for the 97% name-accuracy gate in the design document, enable hints on both
sides first.

## Architecture

The search is a loop, not a single pass. Each turn adds detail until few enough
contacts remain to choose from.

```text
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
Browser: speak one turn                                │
   │  MediaRecorder + chosen engine + accumulated state │
   ▼                                                   │
POST /api/process-audio        ← the only place any key exists
   │                                                   │
   ├── validate     lib/audio/validation.ts   audio, timezone, provider,
   │                                          and the state echoed back
   │
   ├── transcribe   lib/transcription/registry.ts  resolves the adapter by id
   │                  ├── lib/openai/transcribe.ts    gpt-4o-transcribe
   │                  └── lib/deepgram/transcribe.ts  nova-3
   │
   ├── extract      lib/prompt/messages.ts     system + one user message PER TURN
   │                lib/openai/extract-structured.ts
   │                                          the model reads the whole
   │                                          conversation and returns the
   │                                          already-merged state
   │
   └── search       lib/db/contacts.ts        AND every populated contact
   ▼                                          field; meeting fields excluded
{ transcript, transcripts, state, search }
   │                                                   │
   ├── search.mode === "refine"  (total >= threshold) ──┘  speak again
   │
   └── search.mode === "select"  (total < threshold)
       ▼
   Pick a contact, edit date / time / notes
       ▼
   POST /api/meetings                        the only write path
       ├── validate    schemas/meeting-submission.ts  nothing may be empty here
       ├── check user  lib/db/users.ts                404 rather than an FK error
       └── insert      lib/db/meetings.ts
       ▼
   { success: true, meeting }
```

One boundary still holds absolutely: the model proposes **field values**, and only
the database resolves them to an **id**. Nothing an AI returns is treated as a
record identifier, and no row is written that a person has not confirmed.

### Layout

```text
app/
├── api/process-audio/route.ts   one turn: transcribe, extract, search
├── api/meetings/route.ts        the only write path
├── layout.tsx
├── page.tsx                     Server Component shell
└── globals.css

components/
├── voice-extractor.tsx          the single client boundary and state owner
├── provider-selector.tsx        transcription engine radio group
├── audio-recorder.tsx           capture controls (presentational)
├── audio-player.tsx
├── transcript-card.tsx          transcript + engine/model/latency badge
├── meeting-form.tsx             editable confirmation step
├── saved-meeting.tsx            terminal success state
├── conversation-summary.tsx     read-only criteria + transcript list
├── raw-json.tsx                 collapsible payload + Copy JSON
└── ui/                          button, card, alert

db/
└── init/
    ├── 01-schema.sql            tables, pg_trgm, normalize_name, indexes
    └── 02-seed-users.sql        100 users, replayable against a live volume

hooks/
└── use-audio-recorder.ts        MediaRecorder lifecycle

lib/
├── audio/formats.ts             format policy shared by client and server
├── audio/validation.ts          request validation
├── cn.ts
├── errors.ts                    AppError, public/private message split
├── format.ts                    display formatting, local ISO timestamps
├── transcription/
│   ├── types.ts                 provider contract, ids, labels (client-safe)
│   ├── transcript.ts            shared empty-transcript guard
│   ├── vocabulary.ts            keyterm hint set, sanitising and budgeting
│   └── registry.ts              provider lookup, availability, default
├── db/
│   ├── client.ts                pool cached on globalThis, query() wrapper
│   ├── users.ts                 single-user lookup
│   ├── contacts.ts              multi-field conversational search
│   └── meetings.ts              insert, recent meetings
├── config.ts                    MATCH_THRESHOLD, limits, turn cap
├── prompt/messages.ts           builds the message array (unit tested)
├── matching/
│   └── contact-match.ts         pure filters, scoring, threshold policy
├── deepgram/
│   ├── client.ts                key and model resolution
│   ├── request.ts               pure query builder incl. keyterms (unit tested)
│   ├── response.ts              pure response parser (unit tested)
│   └── transcribe.ts            Deepgram adapter
└── openai/
    ├── client.ts                lazy SDK client, model selection
    ├── transcribe.ts            OpenAI adapter
    ├── extract-structured.ts    generic, schema-driven extraction
    └── extract-meeting-request.ts  binds the conversational schema

schemas/
├── extraction-schema.ts         the swappable descriptor contract
└── meeting.ts                   Zod schema + JSON Schema + prompt guidance

types/
├── api.ts                       request/response contract
└── server-only.d.ts

tests/                           Vitest
```

## API

### `POST /api/process-audio`

`multipart/form-data`:

| Field             | Type   | Required | Example                       |
| ----------------- | ------ | -------- | ----------------------------- |
| `audio`           | File   | yes      | WebM/Opus blob                |
| `timezone`        | string | yes      | `Asia/Colombo`                |
| `currentDateTime` | string | yes      | `2026-09-09T17:20:00+05:30`   |
| `provider`        | string | no       | `openai` or `deepgram`        |
| `history`         | string | no       | JSON array of earlier transcripts |

`history` is the transcripts of earlier turns, echoed back from the previous
response — the only thing carried between turns. Absent means "first turn".
Malformed is rejected with a 400 rather than silently reset: the client only ever
sends history it received from this API, so a parse failure is a bug worth
surfacing, and the browser keeps its copy for a retry.

`timezone` and `currentDateTime` are required rather than defaulted. Relative
phrases like "tomorrow at 2" resolve against them, and a server-side guess would
produce a plausible but wrong date instead of an error.

`provider` is optional and falls back to `TRANSCRIPTION_PROVIDER`. An
unrecognised value is rejected with a 400 rather than falling back, so a typo
cannot quietly bill a different vendor than the caller intended.

**200**

```json
{
  "success": true,
  "transcript": "My name is Tharaka…",
  "transcription": {
    "provider": "deepgram",
    "label": "Deepgram",
    "model": "nova-3",
    "latencyMs": 940,
    "keytermCount": 2
  },
  "transcripts": [
    "Find Tharaka. Meeting September 20th 2026 at 2 PM about the Spice CRM release.",
    "He lives in Colombo",
    "His last name is Perera"
  ],
  "state": {
    "fname": "Tharaka", "lname": "Perera", "city": "Colombo",
    "meetingDate": "2026-09-20", "meetingTime": "14:00",
    "notes": "Discuss the upcoming Spice CRM release",
    "phoneNumber": "", "email": "", "street": "", "state": "", "gender": ""
  },
  "search": {
    "mode": "select",
    "total": 2,
    "threshold": 5,
    "selectedContactId": null,
    "contacts": [
      {
        "id": 101, "fname": "Tharaka", "lname": "Perera",
        "label": "Tharaka Perera", "city": "Colombo", "state": "Western",
        "email": "tharaka.perera@example.com", "gender": "male",
        "score": 1, "matchedFields": ["fname", "lname", "city"]
      }
    ]
  }
}
```

`transcripts` is the truncated conversation to send back next turn. `state` is the
model's complete merged view — replace it wholesale, never combine it with a
previous value.

`search.mode` is one of `idle` (no contact filter yet), `refine`
(`total >= threshold`), `select` (`total < threshold`) or `empty`. The threshold is
echoed so the UI never hardcodes it.

### `POST /api/meetings`

```json
{
  "userId": 5,
  "date": "2026-09-20",
  "time": "14:00",
  "description": "Discuss the upcoming ScriptTrainer release"
}
```

**201**

```json
{
  "success": true,
  "meeting": {
    "id": 1,
    "userId": 5,
    "userLabel": "Eric Poe",
    "date": "2026-09-20",
    "time": "14:00",
    "description": "Discuss the upcoming ScriptTrainer release",
    "createdAt": "2026-09-14T07:45:40Z"
  }
}
```

All four fields are required. Validation messages are written for people to read,
because they are surfaced verbatim in the response.

| Status | Cause |
| ------ | ----- |
| 400 | A field is missing, malformed, or the date is impossible |
| 404 | `userId` is not in the directory |
| 405 | Method other than `POST` |
| 503 | The database is unreachable |

**Errors** return `{ "success": false, "error": string }` with a message that is
safe to display. Diagnostics stay in the server log.

| Status | Cause                                            |
| ------ | ------------------------------------------------ |
| 400    | No audio, empty audio, or bad metadata           |
| 405    | Method other than `POST`                         |
| 413    | Audio over 20 MB                                 |
| 415    | Unsupported container                            |
| 422    | Silent recording, or the model refused           |
| 500    | Selected engine has no API key, or an unexpected fault |
| 502    | Provider failure, or output that failed Zod      |

## The conversational search

### The model does the merging

Only one thing is carried between turns: **the transcripts**. The extracted fields
are not accumulated anywhere — they are re-derived from the whole conversation on
every turn.

```text
turn 1   history: []
         → model sees: ["Find Tharaka"]
         → returns: fname "Tharaka", everything else ""

turn 2   history: ["Find Tharaka"]
         → model sees: ["Find Tharaka", "He lives in Colombo"]
         → returns: fname "Tharaka" AND city "Colombo"
```

Turn 2 never restates the name, and no application code puts it back. The model
keeps it because the prompt says *silence is not a deletion*. The merging rules
live in `fieldGuidance` in `schemas/meeting-request.ts`:

- never mentioned → empty string
- mentioned once → that value persists
- mentioned again → the **latest** message wins

So "actually, find Eric Poe instead" is just a later message, and corrections work
without any special handling.

The conversation resets on **Start over**, or after a meeting is saved. History is
capped at `MAX_CONVERSATION_TURNS`, dropping oldest-first.

### What this costs

Worth stating plainly, because it is the trade this design makes.

`state` is a model output, not a computed value. The response *shape* is still
guaranteed by Structured Outputs and re-checked by Zod, but the *values* are no
longer deterministic — the same two sentences can in principle produce different
results.

The 30 unit tests that used to assert merge behaviour in microseconds are gone,
because that behaviour is no longer a function. They are replaced by
`tests/llm-merge.live.test.ts`, which is opt-in:

```bash
set -a; . ./.env.local; set +a; npm run test:live
```

It costs a few cents and needs the network, which is why `npm test` skips it. If
you change the extraction prompt, run it.

### No editable criteria

There is deliberately no chip layer for editing individual fields. Since state is
re-derived from the conversation each turn, a locally cleared field would simply
reappear on the next turn — the edit has nowhere to live.

`ConversationSummary` therefore shows the criteria **read-only**, alongside the
transcript list that produced them. Corrections are spoken: say the value again, or
say to start over.

One consequence to know about: because only an explicit restatement overrides a
field, switching person mid-conversation keeps the previous person's location.
"Find Amanda in Austin" then "actually find Eric Poe" yields Eric Poe **in
Austin** — and since Eric Poe lives in San Jose, that combination matches nobody.
This is the case §7 of the specification anticipates and defers; the recovery today
is Start over. Instructing the model to clear stale contact fields on an explicit
person switch would fix it, at the cost of less predictable behaviour.

### Contact fields versus meeting fields

| Contact fields (narrow the search) | Meeting fields (never filter) |
| ---------------------------------- | ----------------------------- |
| `fname` `lname` `city` `street` `state` `phoneNumber` `email` `gender` | `meetingDate` `meetingTime` `notes` |

The split lives in `schemas/meeting-request.ts` as data, so the UI, the search and
the tests cannot drift apart. `buildContactFilters` reads only the first group,
which is why a turn that supplies only a date never triggers a directory search.

### The threshold

`MATCH_THRESHOLD` in `lib/config.ts`, currently 5. The comparison is
`total >= threshold`, so exactly five matches still asks for more detail and four
offers selection. The value is echoed in every response rather than duplicated in
the UI.

### Matching

Filters are ANDed, so the count falls monotonically as detail accumulates. Fields
divide by how they tolerate error:

| Fields | Matching | Why |
| ------ | -------- | --- |
| `fname` `lname` `city` `street` `state` | Exact, else trigram ≥ 0.35 | Spoken aloud, so misheard |
| `email` | Exact, case-insensitive | A near-miss email is a different person |
| `phoneNumber` | Last ten digits | Bridges `+1 (512) 555-0101` and `5125550101` |
| `gender` | Exact | Two values; nothing to be fuzzy about |

Per-field scores are averaged rather than summed, so one perfect match is not
ranked below three loose ones. A lone remaining contact is preselected; several
never are, because attaching a meeting to the wrong person is worse than asking.

Spoken states are expanded to their postal abbreviation before querying — trigram
similarity cannot bridge "texas" and "tx". Non-US regions such as Colombo's
"Western" province fall through to the normal path.

Normalisation is duplicated on purpose: `normalizeName` in TypeScript and
`normalize_name` in SQL must behave identically, or an exact match would be scored
as fuzzy. Both lowercase, replace punctuation with spaces, collapse whitespace and
preserve accented letters. The trigram index is built on the SQL function so the
search stays index-backed.

The seed data exists to exercise the hard paths. Two users named **Amanda
Wilson** force the picker, and the directory is otherwise built from clusters of
near-homophones — distinct people whose names sound almost identical — because
that is the failure speech-to-text actually produces: the right sound, the wrong
spelling.

```text
Tharaka / Taraka / Dharaka  ·  Pathirana / Pathirane
Sean Brady · Shaun Bradey · Shawn Bradie
Catherine Lee · Katherine Lea · Kathryn Leigh
Sofia Andersson · Sophia Anderson · Sofie Andersen
```

Searching `Tharaka Pathirana` returns the exact match at 1.00 with three capped
fuzzy rivals beneath it, so the tier cap is visible rather than theoretical.
Searching `Katherine Lee` returns no exact match at all and lands on
**ambiguous**.

## Design decisions

**The model proposes, the server validates.** Structured Outputs constrains
generation with a strict JSON Schema, and Zod independently validates what comes
back. A response whose `meetingDate` is `"next Friday"` or `"2026-02-31"` is
rejected as a 502 rather than forwarded. Two independent guards, because the
model is not a trusted source.

**Transcription is an adapter, not a hard-coded vendor.**
`lib/transcription/types.ts` defines a four-member interface — `id`,
`getModel()`, `isConfigured()`, `transcribe(file)` — and
`lib/transcription/registry.ts` is the only file that knows which concrete
engines exist. The route resolves a provider by id and never imports OpenAI or
Deepgram directly, which is what makes the engine a request-time choice. Adding a
third is one implementation plus one registry entry.

`isConfigured()` earns its place: it drives the availability flags in the UI and
makes the registry reject an unconfigured choice with a clear message, instead of
letting a missing key surface later as an opaque provider error.

**Provider-neutral types stay out of the server modules.**
`lib/transcription/types.ts` has no `server-only` import, so Client Components
can share the ids, labels and result types. The adapters that touch credentials
do import it, so they still cannot be bundled for the browser.

**The connection pool lives on `globalThis`.** In development Next.js
re-evaluates the module graph on every save. A module-level pool variable would
reset each time while its sockets stayed open, and after enough edits Postgres
refuses new connections at its default limit of 100. `globalThis` survives hot
reload, so exactly one pool exists per process. This is why `lib/db/client.ts`
differs from `lib/openai/client.ts` — the latter only holds configuration, so
recreating it costs nothing.

**Database rows are validated too.** `pg` has no knowledge of the table shape, so
rows arrive loosely typed. They pass through Zod on the way out, which makes a
column rename a clear validation error rather than an `undefined` reaching the UI.
Dates and times are cast to text in SQL rather than relying on the driver, which
would return `Date` objects and reintroduce the timezone shifts the display layer
already guards against.

**Two schemas for meetings, not one.** `meetingRequestSchema` describes what the
conversation has accumulated, where every field may be `""`. `MeetingSubmissionSchema`
describes what a human approved, where nothing may be empty, because
`meetings.date` and `meetings.time` are `NOT NULL`. A conversation that never
mentioned a time has to have one filled in on the form — the "never guess" rule
resolving at the human step rather than with a silent default.

**The form resets by `key`, not by effect.** `voice-extractor.tsx` gives
`MeetingForm` a key that changes on each extraction, so React remounts it and the
new proposal becomes the initial state. Syncing props into state with an effect
would cause a cascading render, which ESLint's `react-hooks` rules correctly
reject.

**Schemas are swappable.** `schemas/extraction-schema.ts` defines a descriptor:
a Zod schema, a strict JSON Schema, prompt guidance, and an optional normaliser.
`lib/openai/extract-structured.ts` is generic over it. Moving to a richer shape
means adding a descriptor and changing one import in
`extract-meeting-request.ts` — no pipeline or route changes. A test asserts the Zod
and JSON schemas stay in step, since they are maintained side by side.

**Normalise, then validate.** `normalizeMeetingRequest` deterministically repairs
formatting the model may get slightly wrong: padding `2026-9-20`, stripping seconds
from `14:00:00`, lowercasing emails, reducing phone numbers to digits, and dropping
keys outside the schema. It also maps placeholder words like `"unknown"` to `""`,
which matters more than it sounds — a literal "unknown" would otherwise become a
search filter and quietly return zero matches. It never invents a value, and
anything it cannot repair fails validation.

**One client boundary.** `app/page.tsx` is a Server Component; `VoiceExtractor`
is the only `"use client"` entry point that holds state. `lib/openai/*` imports
`server-only`, so pulling any of it into the browser is a build error rather than
a leaked key.

**Format policy lives in one module.** `lib/audio/formats.ts` holds the accepted
containers, the recorder's preference order, and the size limits. The hook and
the server validator both read it, so the client cannot record something the API
will reject. Nothing there imports server code, so it is safe in a client
bundle.

**Two messages per error.** `AppError` carries a `publicMessage` for the browser
and a `detail` for the log. The route serialises only the former, and any
non-`AppError` collapses to a generic 500. Logs record sizes, models, latencies
and Zod issue paths, never transcript text or audio.

## Browser support

`RECORDER_MIME_CANDIDATES` is probed in order with
`MediaRecorder.isTypeSupported`:

| Browser              | Result                            |
| -------------------- | --------------------------------- |
| Chrome, Edge         | `audio/webm;codecs=opus`          |
| Firefox              | `audio/webm` or `audio/ogg`       |
| Safari, iOS Safari   | `audio/mp4`                       |
| No `isTypeSupported` | Browser default, sniffed at stop  |

The recorded MIME type determines the upload filename extension, which is how
the transcription endpoint identifies the container.

Other handling: recording needs a user gesture and a secure context (HTTPS or
`localhost`); microphone tracks stop on stop, cancel and unmount; recordings are
capped at 120 seconds with a visible countdown; object URLs are revoked when
replaced; nothing is written to browser storage. If recording is unavailable, the
file upload path remains.

## Testing

```bash
npm test
```

Covers schema validation, empty-string handling, invalid model responses,
normalisation and date formatting, request validation, provider-id validation,
Deepgram response parsing, and Zod/JSON-Schema parity.

Tests target the pure modules. The provider adapters are thin HTTP wrappers left
to integration testing, which is why Deepgram's response envelope is parsed by a
separate pure function in `lib/deepgram/response.ts` — that part is testable
without a key. The same reasoning applies to `lib/prompt/messages.ts`: the message
array is deterministic and asserted, while the merge the model performs on it is
not, and is covered by the opt-in live suite instead.

```bash
set -a; . ./.env.local; set +a; npm run test:live
```

## Notes for production

Not included here, and worth adding before real traffic:

- **Authentication.** `POST /api/meetings` writes to the database and is open to
  anyone who can reach the server. That was tolerable when the app only returned
  JSON; it is not once there is a database behind it. This is the most important
  gap.
- **Duplicate-submit protection.** The Save button disables while a request is in
  flight, but that is usability, not a guarantee. A network retry can still create
  two rows. The durable fix is an idempotency key with a unique constraint.
- Per-user rate limiting ahead of the provider calls, so retries or a
  compromised session cannot run up provider spend.
- Request tracing IDs through both provider calls.
- An explicit audio and transcript retention policy. Nothing is persisted today;
  transcripts do pass through server logs only as a character count.
