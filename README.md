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
runs `db/init/01-schema.sql`, which creates both tables and seeds 14 users.

```bash
docker compose ps                  # check health
docker compose logs -f db          # follow logs
docker compose down                # stop, keep data
docker compose down -v             # stop and wipe data
```

**The init script runs once.** Postgres only executes files in
`/docker-entrypoint-initdb.d/` when the data directory is empty, so editing
`db/init/01-schema.sql` later has no effect until you drop the volume with
`docker compose down -v`. If the schema starts changing often, that is the signal
to add a real migration step.

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

```text
Browser
   │  MediaRecorder + chosen engine
   ▼
Audio Blob
   │  multipart/form-data
   ▼
POST /api/process-audio          ← the only place any API key exists
   │
   ├── validate       lib/audio/validation.ts       size, container, timezone,
   │                                                timestamp, provider id
   │
   ├── transcribe     lib/transcription/registry.ts resolves the adapter by id
   │                    ├── lib/openai/transcribe.ts     gpt-4o-transcribe
   │                    └── lib/deepgram/transcribe.ts   nova-3
   │
   ├── extract        lib/openai/extract-structured.ts
   │                                                Structured Outputs, strict JSON Schema
   │
   ├── validate       schemas/meeting.ts            normalise, then Zod
   │
   └── resolve        lib/db/users.ts               rank directory matches for
   ▼                                                the name that was heard
{ success: true, transcript, transcription, data, nameMatch }
   ▼
Confirmation form                                   pick the person, edit the
   │                                                date, time and description
   ▼
POST /api/meetings                                  the only write path
   │
   ├── validate       schemas/meeting-submission.ts nothing may be null here
   ├── check user     lib/db/users.ts               404 rather than an FK error
   └── insert         lib/db/meetings.ts
   ▼
{ success: true, meeting }
```

The boundary that matters: the model proposes a **name string**, and only the
database resolves it to an **id**. Nothing an AI returns is ever treated as a
record identifier, and no row is written that a person has not confirmed.

### Layout

```text
app/
├── api/process-audio/route.ts   orchestration only, no provider logic
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
├── user-picker.tsx              candidate list + directory search
├── saved-meeting.tsx            terminal success state
├── extraction-result.tsx        the original proposal, for reference
├── raw-json.tsx                 collapsible payload + Copy JSON
└── ui/                          button, card, alert

db/
└── init/01-schema.sql           tables, pg_trgm, normalize_name, seed data

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
│   ├── users.ts                 candidate search, user lookup
│   └── meetings.ts              insert, recent meetings
├── matching/
│   └── name-match.ts            pure normalising, scoring, resolution policy
├── deepgram/
│   ├── client.ts                key and model resolution
│   ├── request.ts               pure query builder incl. keyterms (unit tested)
│   ├── response.ts              pure response parser (unit tested)
│   └── transcribe.ts            Deepgram adapter
└── openai/
    ├── client.ts                lazy SDK client, model selection
    ├── transcribe.ts            OpenAI adapter
    ├── extract-structured.ts    generic, schema-driven extraction
    └── extract-meeting-info.ts  binds the meeting schema

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
  "data": {
    "name": "Tharaka",
    "meetingDate": "2026-09-20",
    "meetingTime": "14:00",
    "notes": "Discuss the upcoming ScriptTrainer release"
  }
}
```

`nameMatch` carries the directory resolution:

```json
{
  "status": "ambiguous",
  "selectedUserId": null,
  "searchedFor": "Amanda Wilson",
  "candidates": [
    { "id": 1, "fname": "Amanda", "lname": "Wilson", "label": "Amanda Wilson", "score": 1 },
    { "id": 2, "fname": "Amanda", "lname": "Wilson", "label": "Amanda Wilson", "score": 1 }
  ]
}
```

### `GET /api/users/search?q=`

Manual directory lookup, used when the automatic match is wrong or absent.
Returns the same `status`, `selectedUserId` and `candidates` shape.

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

## Name resolution

The extractor returns a name as text. Turning that into a person is the database's
job, and the rules live in `lib/matching/name-match.ts`.

Candidates are scored in tiers so an exact match can never lose to a fuzzy one:

| Tier | Match | Score |
| ---- | ----- | ----- |
| 1 | Full name exact, after normalising | 1.00 |
| 2 | Reversed — "Wilson Amanda" | 0.90 |
| 3 | Just the first or just the last name | 0.80 |
| 4 | Trigram similarity, capped below tier 3 | 0.35–0.79 |

Then one of three outcomes:

- **resolved** — exactly one candidate at 0.95 or above. Preselected, but still
  visible and changeable.
- **ambiguous** — several plausible people. Nothing is preselected; the user
  chooses.
- **unresolved** — nothing matched, or no name was spoken. A directory search box
  is offered.

Attaching a meeting to the wrong person is worse than asking a question, so a
close-but-uncertain match is never selected silently.

Normalisation is duplicated on purpose: `normalizeName` in TypeScript and
`normalize_name` in SQL must behave identically, or an exact match would be scored
as fuzzy. Both lowercase, replace punctuation with spaces, collapse whitespace and
preserve accented letters. The trigram index is built on the SQL function so the
search stays index-backed.

The seed data exists to exercise the hard paths: two users named **Amanda
Wilson** force the picker, and **Tharaka** alongside **Taraka Pathirana**
reproduces the near-miss a misheard name produces.

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

**Two schemas for meetings, not one.** `MeetingInfoSchema` describes what the
model proposed and allows null everywhere. `MeetingSubmissionSchema` describes what
a human approved and allows null nowhere, because `meetings.date` and
`meetings.time` are `NOT NULL`. A recording that never stated a time has to be
completed on the form — the "never guess" rule resolving at the human step rather
than with a silent default.

**The form resets by `key`, not by effect.** `voice-extractor.tsx` gives
`MeetingForm` a key that changes on each extraction, so React remounts it and the
new proposal becomes the initial state. Syncing props into state with an effect
would cause a cascading render, which ESLint's `react-hooks` rules correctly
reject.

**Schemas are swappable.** `schemas/extraction-schema.ts` defines a descriptor:
a Zod schema, a strict JSON Schema, prompt guidance, and an optional normaliser.
`lib/openai/extract-structured.ts` is generic over it. Moving to a richer shape
means adding a descriptor and changing one import in
`extract-meeting-info.ts` — no pipeline or route changes. A test asserts the Zod
and JSON schemas stay in step, since they are maintained side by side.

**Normalise, then validate.** `normalizeMeetingInfo` deterministically repairs
formatting the model may get slightly wrong: padding `2026-9-20`, stripping
seconds from `14:00:00`, trimming whitespace, mapping placeholders like
`"unknown"` to `null`, and dropping keys outside the schema. It never invents a
value. Anything it cannot repair fails validation.

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

Covers schema validation, missing and null values, invalid model responses,
normalisation and date formatting, request validation, provider-id validation,
Deepgram response parsing, and Zod/JSON-Schema parity.

Tests target the pure modules. The provider adapters are thin HTTP wrappers left
to integration testing, which is why Deepgram's response envelope is parsed by a
separate pure function in `lib/deepgram/response.ts` — that part is testable
without a key.

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
