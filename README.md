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
npm run dev
```

Open http://localhost:3000.

Requires Node.js 20 or newer.

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
   └── validate       schemas/meeting.ts            normalise, then Zod
   ▼
{ success: true, transcript, transcription, data }
```

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
├── extraction-result.tsx
├── raw-json.tsx                 collapsible payload + Copy JSON
└── ui/                          button, card, alert

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

- Per-user rate limiting ahead of the provider calls, so retries or a
  compromised session cannot run up provider spend.
- Authentication. The route is currently open to anyone who can reach it.
- Request tracing IDs through both provider calls.
- An explicit audio and transcript retention policy. Nothing is persisted today;
  transcripts do pass through server logs only as a character count.
