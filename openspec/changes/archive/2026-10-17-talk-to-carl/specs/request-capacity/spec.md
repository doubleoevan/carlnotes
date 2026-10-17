## ADDED Requirements

### Requirement: The speech route is limited per caller and per user in progress
`POST /api/chat/speech` SHALL have its own limit of 60 requests a minute per caller, keyed by the signed-in user, else
the client address, counted in Redis under its own rate limit window, so a reply's spoken parts never spend the chat
turn's limit. A user SHALL have at most 3 spoken parts in progress in one process, and a spoken part past that SHALL get
a 429 with `{ error: "rate limited" }` before the user's key is loaded or a model is called.

#### Scenario: A long replay is limited on its own
- **WHEN** a user replays replies past 60 spoken parts in a minute
- **THEN** the 61st spoken part gets a 429, and a chat turn still sends

#### Scenario: A fourth spoken part in progress is rejected
- **WHEN** a user already has 3 spoken parts being spoken and posts another
- **THEN** the fourth gets a 429, and no model is called for it

### Requirement: A recording past the process's transcode limit is turned away with a retry
The api process SHALL run at most 4 recording transcodes at once. A transcription post that passes authorization while
4 are running SHALL get a 503 with `Retry-After: 5` before the recording's bytes are copied, and SHALL write no spend
row. A transcode that ends, read or rejected, SHALL give its slot back.

#### Scenario: A burst of recordings is turned away
- **WHEN** a fifth recording arrives while 4 are transcoding
- **THEN** it gets a 503 with `Retry-After: 5`, and ffmpeg is not started for it

#### Scenario: A failed transcode releases its slot
- **WHEN** ffmpeg rejects a recording
- **THEN** the route answers 422, and the next recording can take that slot

### Requirement: The spoken events route is limited per caller
`POST /api/chat/spoken-events` SHALL have its own limit of 30 requests a minute per caller, counted in Redis under the
`rate-limit:spoken-events` prefix, so the events never spend another route's limit.

#### Scenario: An event loop is limited
- **WHEN** a caller posts a 31st spoken event in a minute
- **THEN** it gets a 429, and nothing is counted

## MODIFIED Requirements

### Requirement: Every request body is bounded unless its route sets its own limit

Every `/api` and `/mcp` route SHALL reject a body over one megabyte with a 413 before the route reads it, except the
routes that set their own limit: the chat turn and chat room posts, the transcription post, the avatar and team avatar
uploads, the topic attachment upload, and the note sync updates, whose limit is one update at its largest plus the JSON
around it. A signed-out post to a chat route SHALL be rejected before its body is read, as the topic-chat capability
states, and so SHALL a signed-out upload, with a 401, and a signed-out note sync, with a 404. The server SHALL cut off
any body past 32 megabytes, above the largest route limit, before a route runs.

The transcription route's limit is 4 megabytes, a minute of recorded audio in any container a browser records.

#### Scenario: An oversized body is rejected early

- **WHEN** a request to a route without its own limit sends a body over one megabyte
- **THEN** it gets a 413 and the route never reads it

#### Scenario: An upload keeps its own limit

- **WHEN** a signed-in user uploads a topic attachment over one megabyte and under its route's limit
- **THEN** the default limit does not reject it

#### Scenario: A note sync past its own limit is rejected early

- **WHEN** a note sync post sends a body past one update's largest size
- **THEN** it gets a 413 and the route never reads it

#### Scenario: A recording keeps its own limit
- **WHEN** a 2 megabyte recording is posted to the transcription route
- **THEN** it passes the body limit, and a 5 megabyte one gets a 413
