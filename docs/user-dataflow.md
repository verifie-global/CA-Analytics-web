# User Dataflow

This diagram shows the main user-step flow in the call analytics frontend.

```mermaid
flowchart TD
    A[Open app] --> B{Authorized?}

    B -- No --> C[Enter Base URL, Company ID, API token]
    C --> D[Click Authorize]
    D --> E{Auth success?}
    E -- No --> F[Show auth error]
    F --> C
    E -- Yes --> G[Load Grid dashboard]

    B -- Yes --> G

    G --> H[View calls grid]
    H --> I[Filter calls]
    I --> H
    H --> J[Open conversation row]
    J --> K[Load call details]

    K --> L[Review playback, transcript, summary, diarization, topics, entities]
    K --> M{QA data exists?}
    M -- Yes --> N[Review QA evaluation]
    M -- No --> O[Skip QA section]
    N --> P[Optional: Recalculate QA Score]
    P --> K

    G --> Q[Open Upload call modal]
    Q --> R{Upload source}
    R -- Local file(s) --> S[Select one or more audio files]
    R -- Presigned URL --> T[Paste audio URL]
    S --> U[Queue analysis]
    T --> U
    U --> V[Refresh grid]
    V --> H

    G --> W[Click Record conversation]
    W --> X[Grant microphone access]
    X --> Y[Start live conversation session]
    Y --> Z[Real-time ASR transcribes conversation]
    Z --> AA[Real-time diarization separates speakers]
    AA --> AB[Detect when agent is talking]
    AB --> AC[Show live hints from knowledge base to the agent]
    AC --> AD{Conversation finished?}
    AD -- No --> Z
    AD -- Yes --> AE[Stop conversation]
    AE --> AF[Preview recording]
    AF --> AG[Upload conversation]
    AG --> V

    G --> AH[Open Keyword rules]
    AH --> AI[Add, edit, color, enable, delete rules]
    AI --> AJ[Save in browser local storage]
    AJ --> AK[Keywords applied to transcripts and call badges]
    AK --> H

    G --> AL[Open QA settings]
    AL --> AM[Load company QA profile]
    AM --> AN[Edit profile fields and weighted questions]
    AN --> AO[Save QA profile]
    AO --> AL

    G --> AP[Open QA export modal]
    AP --> AQ[Select completed conversations]
    AQ --> AR[Export QA monitoring questionnaire files]
    AR --> H

    G --> AS[Toggle dark or light theme]
    AS --> G

    G --> AT[Log out]
    AT --> C
```

## Main User Paths

1. Authorization
   User signs in with company credentials and enters the main dashboard.

2. Grid exploration
   User filters the calls grid, opens a row, and reviews full call analytics.

3. Upload flow
   User uploads local audio files or a presigned URL, then watches the grid refresh with new calls.

4. Recording flow
   User starts `Record conversation`, sees live ASR and diarization during the call, gets agent-focused knowledge-base hints in real time, then stops, previews, and uploads the conversation.

5. QA management
   User edits the company QA profile, reviews QA results on completed calls, and can recalculate QA.

6. Keyword monitoring
   User configures keyword rules locally in the browser and sees those rules reflected in the grid and details.

7. Export flow
   User selects completed calls and exports QA monitoring questionnaire files.

8. Theme and session controls
   User can switch between dark and light theme or log out.
