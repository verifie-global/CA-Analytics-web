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

    G --> W[Click Record call]
    W --> X[Grant microphone access]
    X --> Y[Record audio]
    Y --> Z[Stop recording]
    Z --> AA[Preview recording]
    AA --> AB[Upload recording]
    AB --> V

    G --> AC[Open Keyword rules]
    AC --> AD[Add, edit, color, enable, delete rules]
    AD --> AE[Save in browser local storage]
    AE --> AF[Keywords applied to transcripts and call badges]
    AF --> H

    G --> AG[Open QA settings]
    AG --> AH[Load company QA profile]
    AH --> AI[Edit profile fields and weighted questions]
    AI --> AJ[Save QA profile]
    AJ --> AG

    G --> AK[Open QA export modal]
    AK --> AL[Select completed conversations]
    AL --> AM[Export QA monitoring questionnaire files]
    AM --> H

    G --> AN[Toggle dark or light theme]
    AN --> G

    G --> AO[Log out]
    AO --> C
```

## Main User Paths

1. Authorization
   User signs in with company credentials and enters the main dashboard.

2. Grid exploration
   User filters the calls grid, opens a row, and reviews full call analytics.

3. Upload flow
   User uploads local audio files or a presigned URL, then watches the grid refresh with new calls.

4. Recording flow
   User records audio in-browser, previews it, and uploads it into the same processing pipeline.

5. QA management
   User edits the company QA profile, reviews QA results on completed calls, and can recalculate QA.

6. Keyword monitoring
   User configures keyword rules locally in the browser and sees those rules reflected in the grid and details.

7. Export flow
   User selects completed calls and exports QA monitoring questionnaire files.

8. Theme and session controls
   User can switch between dark and light theme or log out.
