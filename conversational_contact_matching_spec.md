# Conversational Contact Matching & Meeting Scheduling — Implementation Specification

## 1. Objective

Update the existing voice-driven contact matching flow into a **multi-turn conversational flow**.

Currently, the user speaks once, the application transcribes the audio, extracts structured data, searches the database, and returns possible contact matches.

The new flow must allow the user to speak **multiple times** so they can progressively narrow down the contact list until the number of matches is small enough for manual selection.

The application must preserve previously extracted information across turns, merge newly provided information into the existing conversation state, and overwrite previously stored values only when the user explicitly provides a replacement value.

---

## 2. Updated Structured Data Schema

Replace the existing `name` field with separate `fname` and `lname` fields.

Add the following new fields:

- `city`
- `phoneNumber`
- `email`
- `street`
- `state`
- `gender`

The final structured schema should contain:

```ts
import { z } from "zod";

export const meetingRequestSchema = z.object({
  fname: z.string().default(""),
  lname: z.string().default(""),
  meetingDate: z.string().default(""),
  meetingTime: z.string().default(""),
  notes: z.string().default(""),
  city: z.string().default(""),
  phoneNumber: z.string().default(""),
  email: z.string().default(""),
  street: z.string().default(""),
  state: z.string().default(""),
  gender: z.enum(["male", "female"]).or(z.literal("")).default(""),
});

export type MeetingRequest = z.infer<typeof meetingRequestSchema>;
```

### Important extraction rule

If the user does not provide a value, return an empty string for that field.

Do **not** invent, infer, or hallucinate missing contact information.

Example:

Input:

> Find Amanda who lives in Austin, email address is amanda.wilson@example.com. Schedule a meeting for her October 10th, 2026 at 3 PM to plan the decoration.

Expected extracted state:

```json
{
  "fname": "Amanda",
  "lname": "",
  "meetingDate": "2026-10-10",
  "meetingTime": "15:00",
  "notes": "Plan the decoration",
  "city": "Austin",
  "phoneNumber": "",
  "email": "amanda.wilson@example.com",
  "street": "",
  "state": "",
  "gender": ""
}
```

Note: `city` and `email` are populated because they are explicitly present in the user's input.

---

## 3. Core Conversational Flow

The current single-turn flow should be converted into a repeated cycle.

### High-level flow

```text
User speaks
   ↓
Speech-to-text
   ↓
LLM extracts structured fields
   ↓
Merge extracted values into persisted conversation state
   ↓
Search/filter contacts using current accumulated state
   ↓
Count matches
   ↓
Is match count >= MATCH_THRESHOLD?
   ├── Yes → allow another voice input to narrow results
   └── No  → show results and allow manual contact selection
```

This cycle repeats until the result count falls below the configured threshold.

---

## 4. Match Threshold

Introduce a configurable threshold constant.

Example:

```ts
export const MATCH_THRESHOLD = 5;
```

Behavior:

```ts
if (matches.length >= MATCH_THRESHOLD) {
  // Keep conversational refinement active.
  // Encourage the user to provide more identifying information.
} else {
  // Show the remaining results.
  // Allow the user to manually select the intended contact.
}
```

The threshold should not be hardcoded throughout the application.

Keep it in one configuration/constants location so it can easily be adjusted later.

---

## 5. Conversation State

Maintain one accumulated state object for the current conversation.

Example:

```ts
type ConversationState = {
  fname: string;
  lname: string;
  meetingDate: string;
  meetingTime: string;
  notes: string;
  city: string;
  phoneNumber: string;
  email: string;
  street: string;
  state: string;
  gender: "" | "male" | "female";
};
```

Initial state:

```ts
const initialConversationState: ConversationState = {
  fname: "",
  lname: "",
  meetingDate: "",
  meetingTime: "",
  notes: "",
  city: "",
  phoneNumber: "",
  email: "",
  street: "",
  state: "",
  gender: "",
};
```

The state must survive between microphone interactions within the same search/scheduling session.

The state should reset only when:

- the user explicitly starts a new search;
- the meeting is successfully created;
- the user cancels the current flow;
- the UI provides a "Start Over" / "Clear" action and the user selects it.

---

## 6. Merge and Overwrite Rules

Newly extracted values must be merged into the previously accumulated conversation state.

### Rule 1 — Empty incoming values must NOT erase existing values

If the previous state is:

```json
{
  "fname": "Amanda",
  "lname": "",
  "city": "Austin",
  "email": "amanda.wilson@example.com"
}
```

and the next turn extracts:

```json
{
  "fname": "",
  "lname": "",
  "city": "",
  "email": ""
}
```

the previous values must remain unchanged.

### Rule 2 — Explicitly provided new values overwrite previous values

If the first turn contains:

> Find Amanda who lives in Austin, email address is amanda.wilson@example.com.

Persisted state:

```json
{
  "fname": "Amanda",
  "lname": "",
  "city": "Austin",
  "email": "amanda.wilson@example.com"
}
```

Then the user says:

> Find Eric Poe who lives in Austin, email address is eric.poe@example.com.

Updated state:

```json
{
  "fname": "Eric",
  "lname": "Poe",
  "city": "Austin",
  "email": "eric.poe@example.com"
}
```

The newly supplied `fname`, `lname`, and `email` replace the old values.

### Recommended merge implementation

```ts
function mergeConversationState(
  previous: ConversationState,
  incoming: ConversationState,
): ConversationState {
  return {
    fname: incoming.fname || previous.fname,
    lname: incoming.lname || previous.lname,
    meetingDate: incoming.meetingDate || previous.meetingDate,
    meetingTime: incoming.meetingTime || previous.meetingTime,
    notes: incoming.notes || previous.notes,
    city: incoming.city || previous.city,
    phoneNumber: incoming.phoneNumber || previous.phoneNumber,
    email: incoming.email || previous.email,
    street: incoming.street || previous.street,
    state: incoming.state || previous.state,
    gender: incoming.gender || previous.gender,
  };
}
```

---

## 7. Important Identity Replacement Behavior

There is one important case to handle carefully.

A user may completely change the intended person during the conversation.

Example:

### Turn 1

> Find Amanda who lives in Austin, email address is amanda.wilson@example.com. Schedule a meeting for her October 10th, 2026 at 3 PM to plan the decoration.

State:

```json
{
  "fname": "Amanda",
  "lname": "",
  "meetingDate": "2026-10-10",
  "meetingTime": "15:00",
  "notes": "Plan the decoration",
  "city": "Austin",
  "phoneNumber": "",
  "email": "amanda.wilson@example.com",
  "street": "",
  "state": "",
  "gender": ""
}
```

### Turn 2

> Find Eric Poe who lives in Austin, email address is eric.poe@example.com.

Expected state:

```json
{
  "fname": "Eric",
  "lname": "Poe",
  "meetingDate": "2026-10-10",
  "meetingTime": "15:00",
  "notes": "Plan the decoration",
  "city": "Austin",
  "phoneNumber": "",
  "email": "eric.poe@example.com",
  "street": "",
  "state": "",
  "gender": ""
}
```

The contact identity fields are updated, while the meeting information remains because the user did not replace it.

### Optional stronger identity-reset rule

If the application finds stale identity information causing impossible combinations, introduce an identity reset strategy.

For example, if `fname` changes from `Amanda` to `Eric`, and the new turn does not mention the old identity-specific fields, optionally clear stale fields such as:

- `lname`
- `email`
- `phoneNumber`
- `street`
- `city`
- `state`
- `gender`

However, this should only be implemented if required by the existing matching behavior.

For the first implementation, prefer the simpler rule:

> Only overwrite fields explicitly provided by the latest user turn.

---

## 8. LLM Extraction Requirements

For every voice turn:

1. Convert speech to text using the existing speech-to-text flow.
2. Send the transcript to the LLM.
3. Ask the LLM to return only structured data matching the Zod schema.
4. Empty fields must be returned as empty strings.
5. Normalize meeting date and time values.
6. Merge the extracted result with the persisted conversation state.
7. Use the merged state for database matching.

### Date normalization

Preferred format:

```text
YYYY-MM-DD
```

Example:

```text
September 20th, 2026
```

becomes:

```text
2026-09-20
```

### Time normalization

Preferred format:

```text
HH:mm
```

using 24-hour time.

Example:

```text
2 PM
```

becomes:

```text
14:00
```

---

## 9. Example Conversation Scenarios

### Scenario A — One-shot complete request

User:

> Find John Doe who lives in San Diego. His email is john.doe@example.com and phone number is 5551234567. I want to schedule a meeting for him on September 20th, 2026 at 2 PM to discuss the next plan of the project.

Possible extracted state:

```json
{
  "fname": "John",
  "lname": "Doe",
  "meetingDate": "2026-09-20",
  "meetingTime": "14:00",
  "notes": "Discuss the next plan of the project",
  "city": "San Diego",
  "phoneNumber": "5551234567",
  "email": "john.doe@example.com",
  "street": "",
  "state": "",
  "gender": ""
}
```

Search the DB immediately using every populated field.

If the number of results is below the threshold, show them for manual selection.

---

### Scenario B — Multi-turn narrowing

#### Turn 1

User:

> Find Tharaka. I want to schedule a meeting for him on September 20th, 2026 at 2 PM. The purpose is to discuss the upcoming Spice CRM release.

State:

```json
{
  "fname": "Tharaka",
  "lname": "",
  "meetingDate": "2026-09-20",
  "meetingTime": "14:00",
  "notes": "Discuss the upcoming Spice CRM release",
  "city": "",
  "phoneNumber": "",
  "email": "",
  "street": "",
  "state": "",
  "gender": ""
}
```

Assume 12 matches are returned.

Because:

```ts
12 >= MATCH_THRESHOLD
```

the UI keeps the microphone active for refinement.

#### Turn 2

User:

> He lives in Colombo.

Updated state:

```json
{
  "fname": "Tharaka",
  "lname": "",
  "meetingDate": "2026-09-20",
  "meetingTime": "14:00",
  "notes": "Discuss the upcoming Spice CRM release",
  "city": "Colombo",
  "phoneNumber": "",
  "email": "",
  "street": "",
  "state": "",
  "gender": ""
}
```

Assume 7 matches remain.

The user can refine again.

#### Turn 3

User:

> His last name is Perera.

Updated state:

```json
{
  "fname": "Tharaka",
  "lname": "Perera",
  "meetingDate": "2026-09-20",
  "meetingTime": "14:00",
  "notes": "Discuss the upcoming Spice CRM release",
  "city": "Colombo",
  "phoneNumber": "",
  "email": "",
  "street": "",
  "state": "",
  "gender": ""
}
```

Assume 2 matches remain.

Because the count is below the threshold, show the result cards and allow manual selection.

---

### Scenario C — Changing the target contact

#### Turn 1

User:

> Find Amanda who lives in Austin, email address is amanda.wilson@example.com. Schedule a meeting for her October 10th, 2026 at 3 PM to plan the decoration.

#### Turn 2

User:

> Actually find Eric Poe. His email is eric.poe@example.com.

Expected merged state:

```json
{
  "fname": "Eric",
  "lname": "Poe",
  "meetingDate": "2026-10-10",
  "meetingTime": "15:00",
  "notes": "Plan the decoration",
  "city": "Austin",
  "phoneNumber": "",
  "email": "eric.poe@example.com",
  "street": "",
  "state": "",
  "gender": ""
}
```

The meeting details are retained.

The explicitly changed contact fields are replaced.

---

## 10. Contact Matching

The existing database matching logic should be updated to support all of the new searchable identity fields.

Potential searchable fields:

- `fname`
- `lname`
- `city`
- `phoneNumber`
- `email`
- `street`
- `state`
- `gender`

Meeting-only fields must **not** be used for contact lookup:

- `meetingDate`
- `meetingTime`
- `notes`

### Matching behavior

Only apply filters for fields that have non-empty values.

Pseudo-code:

```ts
const filters = {
  ...(state.fname && { fname: state.fname }),
  ...(state.lname && { lname: state.lname }),
  ...(state.city && { city: state.city }),
  ...(state.phoneNumber && { phoneNumber: state.phoneNumber }),
  ...(state.email && { email: state.email }),
  ...(state.street && { street: state.street }),
  ...(state.state && { state: state.state }),
  ...(state.gender && { gender: state.gender }),
};
```

Reuse the application's existing fuzzy name matching behavior where applicable.

Email and phone number should preferably use exact or normalized matching.

---

## 11. Database Changes

Update the existing `users` table.

Add a `gender` column.

Allowed values:

```text
male
female
```

Recommended PostgreSQL implementation:

```sql
ALTER TABLE users
ADD COLUMN gender VARCHAR(10);

ALTER TABLE users
ADD CONSTRAINT users_gender_check
CHECK (gender IN ('male', 'female'));
```

If the application requires the field to be non-null, first backfill existing data, then add the `NOT NULL` constraint.

Example development-only random backfill:

```sql
UPDATE users
SET gender = CASE
  WHEN random() < 0.5 THEN 'male'
  ELSE 'female'
END
WHERE gender IS NULL;
```

Then:

```sql
ALTER TABLE users
ALTER COLUMN gender SET NOT NULL;
```

### Important

Random gender assignment is acceptable only for existing mock/development/test records.

Do not randomly assign gender to real production user data.

---

## 12. Existing User Data

For local development / seed data:

- update existing user records with either `male` or `female`;
- use random distribution if the records are synthetic;
- update seed scripts so newly generated users also receive a valid gender value.

Example seed logic:

```ts
const gender = Math.random() > 0.5 ? "male" : "female";
```

---

## 13. Recommended UI / UX

The new conversational flow should make it obvious that the user can progressively refine the search.

### Recommended layout

#### A. Voice input area

Show:

- microphone button;
- listening state;
- processing state;
- latest transcript;
- action to speak again.

Example states:

```text
Tap to Speak
Listening...
Processing...
Add More Details
```

---

#### B. Current search criteria

Display the accumulated structured information as editable chips, rows, or compact cards.

Example:

```text
Searching for

First name: Tharaka
Last name: —
City: Colombo
Email: —
Phone: —
State: —
Gender: —

Meeting
Sep 20, 2026
2:00 PM
Discuss upcoming Spice CRM release
```

This gives the user confidence that information from earlier turns has been preserved.

---

#### C. Match count

Clearly display:

```text
12 possible matches found
```

If the match count is greater than or equal to the threshold:

```text
Too many matches. Add another detail such as last name, city, email, or phone number.
```

Provide a prominent:

```text
Add More Details
```

microphone button.

---

#### D. Result list

When the match count is below the threshold, show user cards.

Suggested information per card:

```text
John Doe
San Diego, CA
john.doe@example.com
••• ••• 4567
```

Allow the user to select one contact.

---

#### E. Editable criteria

Allow users to manually remove or change extracted values.

Example chips:

```text
[ Tharaka × ]
[ Colombo × ]
[ Male × ]
```

Removing a chip should rerun the search.

This is useful when the speech extraction incorrectly captures a field.

---

#### F. Reset action

Provide:

```text
Start Over
```

or:

```text
Clear Search
```

This resets the full conversation state and result list.

---

## 14. LLM Prompt Requirements

Update the existing extraction prompt so the LLM understands that each transcript represents one turn in a conversation.

The extraction call should extract only information explicitly stated in the latest transcript.

Do not ask the LLM itself to merge old and new state unless there is a strong reason to do so.

Recommended architecture:

```text
Latest transcript
    ↓
LLM extracts latest-turn structured data
    ↓
Application merges latest-turn data with persisted state
```

This keeps state management deterministic and prevents the LLM from unexpectedly deleting or changing previously known values.

Example instruction:

```text
Extract the following fields from the user's latest spoken message.

Return an empty string for any value that is not explicitly stated in this message.

Do not reuse values from previous messages.
Do not guess missing values.
Do not infer contact information.

Normalize dates to YYYY-MM-DD.
Normalize times to HH:mm using 24-hour format.

Schema:
fname
lname
meetingDate
meetingTime
notes
city
phoneNumber
email
street
state
gender
```

---

## 15. Gender Extraction

Allowed values:

```text
male
female
```

Examples:

```text
"Find the male user named Alex"
```

returns:

```json
{
  "gender": "male"
}
```

```text
"Find Sarah. She is female."
```

returns:

```json
{
  "gender": "female"
}
```

If gender is not explicitly available, return:

```json
{
  "gender": ""
}
```

Do not infer gender from first name alone.

---

## 16. Error Handling

Handle the following cases.

### Speech recognition failure

Show:

```text
We couldn't understand the audio. Please try again.
```

Do not clear existing conversation state.

---

### LLM structured extraction failure

Keep the existing state intact.

Allow the user to retry.

---

### No matches

If no contacts match the current accumulated filters:

```text
No matching contacts found.
Try changing or removing one of the search details.
```

Allow:

- speak again;
- remove criteria;
- start over.

Do not automatically clear the accumulated state.

---

### Too many matches

If:

```ts
matches.length >= MATCH_THRESHOLD
```

show a refinement prompt.

Example:

```text
We found 14 possible contacts.
Add another detail such as the person's last name, city, email, phone number, street, state, or gender.
```

---

## 17. Meeting Creation

Once the user selects a contact, continue with the existing meeting creation flow.

Before final submission, show a confirmation screen containing:

- selected contact;
- meeting date;
- meeting time;
- notes.

If any required meeting fields are missing, request them before enabling the final create/schedule action.

Example:

```text
Selected contact
John Doe

Meeting
September 20, 2026
2:00 PM

Notes
Discuss the next plan of the project
```

---

## 18. Field Categories

For implementation clarity, separate the schema into two conceptual groups.

### Contact matching fields

```ts
fname
lname
city
phoneNumber
email
street
state
gender
```

### Meeting fields

```ts
meetingDate
meetingTime
notes
```

This distinction should be reflected in:

- UI;
- search logic;
- state handling;
- tests.

---

## 19. Acceptance Criteria

The feature is complete when all of the following are satisfied:

1. `name` is replaced by `fname` and `lname`.
2. The schema includes:
   - `fname`
   - `lname`
   - `meetingDate`
   - `meetingTime`
   - `notes`
   - `city`
   - `phoneNumber`
   - `email`
   - `street`
   - `state`
   - `gender`
3. Missing values are represented as empty strings.
4. Users can provide contact details in one voice request.
5. Users can provide contact details across several voice requests.
6. Previously captured values persist between turns.
7. Empty values from later turns do not delete previous values.
8. Newly provided values replace previous values for the same field.
9. Contact search is rerun after every successful voice turn.
10. All populated contact fields can contribute to filtering.
11. Meeting fields are not used for contact matching.
12. A configurable match threshold exists.
13. If match count is greater than or equal to the threshold, the UI encourages another voice refinement.
14. If match count is below the threshold, the user can manually select a contact.
15. The current accumulated search criteria are visible in the UI.
16. The user can reset/start over.
17. Existing state survives speech recognition or extraction failures.
18. `gender` is added to the users table.
19. Gender accepts only `male` or `female`.
20. Existing synthetic/dev records are backfilled with gender.
21. New seed data includes gender.
22. The application does not infer gender from a person's name.
23. The selected contact and meeting details are confirmed before meeting creation.
24. Existing single-turn behavior continues to work as a special case of the new multi-turn flow.

---

## 20. Tests to Add

### Schema tests

Verify:

```text
valid complete object
empty optional values
male gender
female gender
invalid gender rejected
```

### Merge tests

Verify:

```text
empty incoming field preserves previous value
new value overwrites previous value
meeting data survives contact refinement
contact information can be progressively added
```

Example:

```ts
previous = {
  fname: "Amanda",
  lname: "",
  city: "Austin",
  email: "amanda.wilson@example.com",
  meetingDate: "2026-10-10",
  meetingTime: "15:00",
  notes: "Plan the decoration",
};

incoming = {
  fname: "Eric",
  lname: "Poe",
  city: "",
  email: "eric.poe@example.com",
};

expected = {
  fname: "Eric",
  lname: "Poe",
  city: "Austin",
  email: "eric.poe@example.com",
  meetingDate: "2026-10-10",
  meetingTime: "15:00",
  notes: "Plan the decoration",
};
```

### Search-flow tests

Verify:

```text
match count above threshold → refinement mode
match count equal to threshold → refinement mode
match count below threshold → manual selection mode
zero matches → no-results state
```

### Conversation tests

Test:

```text
one-shot complete search
two-turn narrowing
three-turn narrowing
changing fname
changing lname
changing email
adding city later
adding phone later
changing target user while retaining meeting details
resetting the conversation
```

---

## 21. Recommended Implementation Order

Implement in this order:

1. Update the Zod schema.
2. Update TypeScript types/interfaces.
3. Add the `gender` DB migration.
4. Update development seed data / existing mock records.
5. Extend the contact search API/query for the new fields.
6. Add conversation state.
7. Add merge logic.
8. Change the voice flow from one-shot to repeatable.
9. Add threshold logic.
10. Add the refinement UI.
11. Add contact selection UI.
12. Add reset/start-over behavior.
13. Update the LLM structured extraction prompt.
14. Add unit tests.
15. Add integration/end-to-end tests.
16. Verify that the existing single-turn use case still works.

---

## 22. Kiro Implementation Instruction

Please inspect the existing codebase first and reuse the current:

- speech-to-text implementation;
- LLM structured extraction flow;
- contact/database matching flow;
- meeting creation flow;
- UI components and styling conventions.

Do not rewrite working functionality unnecessarily.

Implement the changes incrementally and keep the existing application behavior intact where possible.

Before modifying files:

1. identify the current Zod schema;
2. identify where transcript-to-structured-data extraction occurs;
3. identify where contact matching occurs;
4. identify the existing `users` schema and seed/migration files;
5. identify the component that owns the current voice flow.

Then implement the conversational cycle described in this document.

Prefer deterministic application-side state merging instead of relying on the LLM to remember previous turns.

Keep the threshold configurable.

Add appropriate loading, empty, error, refinement, selection, and success states.

Finally, run the existing test/lint/type-check commands and fix any regressions introduced by this change.
