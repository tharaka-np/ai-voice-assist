# SpiceCRM Voice Assistant — How It Works

A plain-language visual companion to the Voice Assistant Technical Design v1.1.
Open this file in preview to see the diagrams rendered.

---

## 1. The journey, start to finish

A user speaks. The system proposes. The user approves. Only then is anything saved.

Notice the three boxes: the browser is where people work, the SpiceCRM server is the
**only** place data gets written, and the outside AI services can read and suggest but
never touch the database.

```mermaid
flowchart TB
    subgraph browser["THE USER'S BROWSER"]
        A["1. User taps the mic<br/>and speaks a short update"]
        B["4. A review card appears<br/>Everything is editable<br/>Nothing saved yet"]
        C["5. User taps<br/>'Save 2 updates'"]
        D["7. Links to the new<br/>meeting and follow-up task"]
    end

    subgraph server["SPICECRM SERVER — the only place that writes data"]
        E["2. Confirm who this is<br/>and that they are<br/>within their usage limits"]
        F["3b. Find the real customer<br/>using SpiceCRM's own search"]
        G["6. Re-check permissions,<br/>then save the records"]
        LIMIT["Friendly message:<br/>'Too many voice requests,<br/>try again in a moment'<br/>No vendor cost incurred"]
    end

    subgraph vendors["OUTSIDE AI SERVICES — suggest only, no access to CRM data"]
        H["3a. Turn the audio<br/>into text"]
        I["3a. Turn the text into a<br/>proposed set of changes"]
    end

    A --> E
    E -->|"over the cap"| LIMIT
    E -->|"within limits"| H
    H --> I
    I --> F
    F --> B
    B --> C
    C --> G
    G --> D

    classDef browserStyle fill:#e8f4fd,stroke:#2b6cb0,color:#1a365d
    classDef serverStyle fill:#e6fffa,stroke:#2c7a7b,color:#1d4044
    classDef vendorStyle fill:#fff5f7,stroke:#b83280,color:#521b41
    classDef warn fill:#fffbea,stroke:#b7791f,color:#5f370e

    class A,B,C,D browserStyle
    class E,F,G serverStyle
    class H,I vendorStyle
    class LIMIT warn
```

**The key idea in one line:** the AI is allowed to suggest, only SpiceCRM is allowed to save.

---

## 2. Finding the right customer — the system never guesses

This is the highest-risk moment in the whole feature. Attaching a meeting to the wrong
customer is worse than failing outright, because nobody notices for weeks.

```mermaid
flowchart TB
    START["User has spoken<br/>an update"] --> Q1{"Was the mic pressed<br/>on a customer's own page?"}

    Q1 -->|"Yes"| CTX["Use that customer directly.<br/>No name search needed.<br/>This is the most reliable path."]
    Q1 -->|"No, a name was spoken"| SEARCH["Search the CRM<br/>for that name"]

    SEARCH --> Q2{"How many<br/>matches?"}

    Q2 -->|"Exactly one,<br/>clear match"| ONE["Show that customer<br/>on the review card"]
    Q2 -->|"Several plausible"| MANY["STOP and ask the user<br/>to pick the right one"]
    Q2 -->|"None"| NONE["Say so honestly.<br/>Let the user retype,<br/>retry, or cancel."]

    CTX --> CARD["Review card"]
    ONE --> CARD
    MANY --> CARD
    NONE --> CANCEL["No records created"]

    classDef good fill:#e6fffa,stroke:#2c7a7b,color:#1d4044
    classDef ask fill:#fffbea,stroke:#b7791f,color:#5f370e
    classDef stop fill:#fff5f5,stroke:#c53030,color:#63171b

    class CTX,ONE,CARD good
    class MANY ask
    class NONE,CANCEL stop
```

Two things worth noting. First, the mic placed on a customer's page skips the risky step
entirely, which is why it's recommended to ship first. Second, "several plausible matches"
always becomes a question to the user, never a coin flip.

---

## 3. Saving safely — no duplicates, no half-finished work

If someone's network hiccups when they press Save, the app may send the request twice.
Without protection that means two identical meetings in the CRM. Here's how that's prevented.

```mermaid
flowchart TB
    S["User presses Save"] --> T{"Have we already<br/>seen this exact<br/>save request?"}

    T -->|"No, it's new"| RESERVE["Claim it first,<br/>then start writing"]
    T -->|"Yes, and it finished"| REPLAY["Hand back the same records.<br/>Nothing new is created."]
    T -->|"Yes, still in progress"| WAIT["Ask the app to wait.<br/>No second write."]
    T -->|"Same request, but the<br/>details were changed"| REJECT["Refuse it.<br/>A changed update needs<br/>a fresh save."]

    RESERVE --> CHECK["Check everything up front:<br/>permissions, dates, the customer<br/>still exists, the proposal<br/>hasn't expired"]
    CHECK --> WRITE["Write the meeting,<br/>then the task"]
    WRITE --> Q{"Did everything<br/>save?"}

    Q -->|"Yes"| OK["Success.<br/>Show links to both records."]
    Q -->|"No, one failed"| UNDO["Undo what was written"]
    UNDO --> Q2{"Could it all<br/>be cleaned up?"}
    Q2 -->|"Yes"| CLEAN["Report the failure clearly.<br/>The CRM is left untouched."]
    Q2 -->|"No"| FLAG["Flag an administrator with the<br/>exact records affected.<br/>Never report this as a success."]

    classDef good fill:#e6fffa,stroke:#2c7a7b,color:#1d4044
    classDef ask fill:#fffbea,stroke:#b7791f,color:#5f370e
    classDef stop fill:#fff5f5,stroke:#c53030,color:#63171b

    class OK,REPLAY,CLEAN good
    class WAIT,REJECT,UNDO ask
    class FLAG stop
```

The promise being made here is specific: zero duplicate records from retries, and never a
success message covering up a partial write.

---

## 4. What the user sees at each moment

```mermaid
flowchart LR
    IDLE["Idle<br/><br/>Mic icon,<br/>tooltip 'Voice update'"] --> REC["Recording<br/><br/>Red state, timer,<br/>Stop and Cancel"]
    REC --> UP["Processing<br/><br/>Progress shown"]
    UP --> PROP["Review card<br/><br/>Editable. This is the<br/>moment of control."]
    PROP --> COM["Saving<br/><br/>Save button disabled<br/>to avoid double-taps"]
    COM --> DONE["Done<br/><br/>Links to what<br/>was created"]

    REC -->|"Cancel"| IDLE
    PROP -->|"Cancel"| IDLE
    UP -->|"Something<br/>went wrong"| ERR["Error<br/><br/>Clear reason and a Retry.<br/>The recording and draft<br/>are kept where safe."]
    ERR -->|"Retry"| UP

    classDef normal fill:#e8f4fd,stroke:#2b6cb0,color:#1a365d
    classDef key fill:#e6fffa,stroke:#2c7a7b,color:#1d4044
    classDef bad fill:#fff5f5,stroke:#c53030,color:#63171b

    class IDLE,REC,UP,COM normal
    class PROP,DONE key
    class ERR bad
```

Cancel is always available before Save, and cancelling writes nothing at all.

---

## 5. How this gets delivered

```mermaid
flowchart LR
    P0["PHASE 0<br/>Prove it<br/><br/>Test transcription<br/>accuracy on your real<br/>customer names"]
    P1["PHASE 1<br/>Easy version<br/><br/>Mic on a customer's<br/>page. No name<br/>search needed."]
    P2["PHASE 2<br/>Global mic<br/><br/>Mic everywhere, with<br/>name search and the<br/>'which one?' picker"]
    P3["PHASE 3<br/>Harden it<br/><br/>Duplicate protection,<br/>cost caps, audit trail,<br/>load testing"]
    P4["PHASE 4<br/>Expand<br/><br/>Only if real usage<br/>data justifies it"]

    P0 -->|"97% name accuracy<br/>or rethink"| P1
    P1 -->|"People can log a meeting<br/>without saying a name"| P2
    P2 -->|"Spoken-name commands<br/>work end to end"| P3
    P3 -->|"Security signoff"| P4

    classDef phase fill:#e8f4fd,stroke:#2b6cb0,color:#1a365d
    classDef later fill:#f7fafc,stroke:#a0aec0,color:#2d3748
    class P0,P1,P2,P3 phase
    class P4 later
```

Phase 0 is cheap and answers the one question that could sink the project: does speech-to-text
reliably get your customers' names right? If it doesn't, you find out in days rather than months.

---

## 6. What's explicitly *not* being built

```mermaid
flowchart TB
    subgraph yes["IN — first release"]
        Y1["Find a customer"]
        Y2["Log a past meeting"]
        Y3["Add a note"]
        Y4["Create a follow-up task"]
        Y5["Edit anything before saving"]
    end

    subgraph no["OUT — deliberately deferred"]
        N1["Always listening<br/>or wake words"]
        N2["Saving without<br/>the user confirming"]
        N3["Deleting records"]
        N4["Sending email or texts"]
        N5["Changing deal stages"]
        N6["Back-and-forth<br/>conversation"]
    end

    classDef inScope fill:#e6fffa,stroke:#2c7a7b,color:#1d4044
    classDef outScope fill:#f7fafc,stroke:#a0aec0,color:#2d3748
    class Y1,Y2,Y3,Y4,Y5 inScope
    class N1,N2,N3,N4,N5,N6 outScope
```

Each exclusion is a choice, not an oversight. The first release earns trust on a narrow set
of low-risk actions before taking on anything that changes forecasts or contacts customers.

---

## 7. Decisions needed from the business

| Question | Why it blocks work |
|---|---|
| How long may we keep the audio and transcripts? | Policy call, not an engineering one. Shapes the storage design. |
| Ship the customer-page mic first, or both entry points together? | Changes the first release scope and timeline. |
| When someone says "week of the 25th" and one date is required, what should it be? | Either ask the user every time or pick a default such as Monday morning. |
| What usage data may we keep in production? | Determines whether we can measure if the feature actually works. |

Four more technical questions need whoever administers the deployed SpiceCRM instance,
mainly which exact version is installed and how meetings should link to different record types.
