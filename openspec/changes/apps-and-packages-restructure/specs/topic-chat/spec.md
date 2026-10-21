## MODIFIED Requirements

### Requirement: Each turn is metered against the account's monthly spend budget
A turn's largest possible cost SHALL be reserved against the user's remaining monthly spend budget before generation, as
the spend-reservations capability states, drawing from the same per-account pool manual-scan overage draws from. The
remaining budget is the budget, less the recorded spend, less every open reservation. A turn whose maximum does not fit
SHALL be rejected with an upgrade prompt and SHALL NOT be billed. Every private chat SHALL count that rejection as a
`chat_budget_reached` event: a Topic's chat, a Team's chat, and the new-topic chat. A completed turn's cost SHALL be
recorded beside its token total, using the same best-effort token-cost tally a scan's review uses, and its reservation
SHALL settle at that cost.

A transcription and each spoken part of a reply SHALL be recorded as their own chat spend rows, with no text, so they
draw from the same pool and count toward it. Each SHALL reserve its own largest cost before its model is called, and a
maximum that does not fit SHALL reject the recording or the spoken part with the same upgrade prompt.

#### Scenario: A turn within budget proceeds and records its cost
- **WHEN** a user with remaining monthly budget sends a chat turn
- **THEN** the reply is generated, and the turn's estimated cost and its token total are recorded against that user

#### Scenario: A turn over budget is blocked, not billed
- **WHEN** a user's remaining monthly budget cannot cover a turn's largest cost
- **THEN** the turn is rejected with an upgrade prompt, no generation runs, no cost is recorded, and one
  `chat_budget_reached` event is counted for that user

#### Scenario: Every private chat counts a budget rejection
- **WHEN** a user whose monthly budget is spent sends a turn in a Team's chat or in the new-topic chat
- **THEN** the turn is rejected as a Topic chat turn would be, and one `chat_budget_reached` event is counted for that
  user

#### Scenario: Chat spend and scan spend share one pool
- **WHEN** a user's chat spend and scan spend together reach their effective monthly budget
- **THEN** both further chat turns and further manual Scans are blocked

#### Scenario: Voice spend counts as chat spend
- **WHEN** a user sends a spoken question and Carl's reply is spoken in two spoken parts
- **THEN** three chat spend rows are written beside the turn's own row, and the monthly spend sum includes them

## ADDED Requirements

### Requirement: Attachment text is extracted off the request's event loop

The text of a PDF, Word file, or workbook a chat turn attaches SHALL be extracted in a worker thread of the api process,
not on the event loop that serves the request and every open stream, so one large file never stalls another user's
stream. The turn SHALL still wait for the extraction as it does today, and an extraction that fails SHALL reject the
attachment as it does today.

#### Scenario: A large PDF leaves the streams alone

- **WHEN** a user attaches a 10 MB PDF while another user's chat stream is open on the same replica
- **THEN** the other stream's bytes keep arriving during the extraction, and the process's event loop p99 for the
  minute stays under its 100 ms warning threshold

#### Scenario: The turn still waits for its text

- **WHEN** a user attaches a Word file to a chat turn
- **THEN** the turn starts once the file's text is extracted, with the text the turn would have had on the event loop
