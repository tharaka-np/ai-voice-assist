# Voice Assistant — Progress Summary

**Date:** 18 September 2026
**Status:** Working prototype, ready to demonstrate

---

## What it does

You speak. It finds the right person in the company directory and schedules a
meeting with them.

Instead of filling in a form, the user says something like:

> "Find Amanda Wilson in Austin. Schedule a meeting on 20 October at 1pm to
> discuss the project rollout."

The assistant works out who is meant, shows the matching people, and prepares the
meeting for the user to check and confirm.

---

## How it works

1. **Speak** — the user records a sentence in the browser.
2. **Transcribe** — the recording is turned into text.
3. **Understand** — the text is turned into structured details: name, city,
   meeting date, time and purpose.
4. **Search** — those details are matched against the directory in the database.
5. **Confirm and save** — the user checks the meeting details and saves. Only then
   is anything written to the database.

The guiding rule throughout: **the AI proposes, a person confirms, and only then is
anything saved.** Nothing is written without a human approving it.

---

## What has been built

**Conversation, not a form**
The user can speak in several short turns instead of one long sentence. "Find
Amanda" then "she's in Austin" then "make it 2pm" all build up the same request.
Corrections are simply spoken again — the most recent instruction wins.

**Choosing between people by voice**
When several people match, they are listed and numbered. The user can say "select
the second one" to choose. A single sentence can both choose a person and give the
meeting details at the same time.

**A chat interface**
The whole flow now looks and behaves like a familiar messaging app: the user's
words on the right, the assistant's responses on the left, a scrolling history of
the session, and a microphone button at the bottom.

**Two speech engines, side by side**
The user can switch between OpenAI and Deepgram from a dropdown and compare them on
the same recording. Each response reports which engine was used, which model, and
how long it took.

| Engine | Note |
|---|---|
| OpenAI | Strong general accuracy |
| Deepgram | Faster, and can be given a list of expected names to recognise better |

**Sensible name matching**
The directory search tolerates near-misses. "Amanda Wilson" still finds "Amanda
Willson", and each result shows how close the match is, so a rough match is never
mistaken for an exact one.

**A confirmation step that cannot be skipped**
Date, time and purpose are all required. The save button stays unavailable until
all three are filled in, and the form tells the user exactly what is missing.
Once saved, the details are locked and a confirmation is shown.

**A clean restart**
"Clear chat" resets the session. If it happens before a meeting was saved, the user
is told plainly that nothing was written.

---
