## MODIFIED Requirements

### Requirement: Each turn is metered against the account's monthly spend budget
A turn's estimated cost SHALL be checked against the user's remaining monthly spend budget before generation, drawing from the same per-account pool manual-scan overage draws from. A turn that would exceed the remaining budget SHALL be rejected with an upgrade prompt and SHALL NOT be billed. Every private chat SHALL count that rejection as a `chat_budget_reached` event: a Topic's chat, a Team's chat, and the new-topic chat. A completed turn's cost SHALL be recorded beside its token total, using the same best-effort token-cost tally a scan's review uses.

#### Scenario: A turn within budget proceeds and records its cost
- **WHEN** a user with remaining monthly budget sends a chat turn
- **THEN** the reply is generated, and the turn's estimated cost and its token total are recorded against that user

#### Scenario: A turn over budget is blocked, not billed
- **WHEN** a user's remaining monthly budget cannot cover an estimated turn
- **THEN** the turn is rejected with an upgrade prompt, no generation runs, no cost is recorded, and one `chat_budget_reached` event is counted for that user

#### Scenario: Every private chat counts a budget rejection
- **WHEN** a user whose monthly budget is spent sends a turn in a Team's chat or in the new-topic chat
- **THEN** the turn is rejected as a Topic chat turn would be, and one `chat_budget_reached` event is counted for that user

#### Scenario: Chat spend and scan spend share one pool
- **WHEN** a user's chat spend and scan spend together reach their effective monthly budget
- **THEN** both further chat turns and further manual Scans are blocked

### Requirement: A conversation can be cleared without erasing its spend
A signed-in reader SHALL be able to clear their conversation with a Topic from the panel, behind a confirmation. Clearing SHALL null the stored question and answer text on the reader's own rows — everywhere they are signed in — while the rows and their recorded costs remain as spend rows, so the month's spend survives the wipe. An anonymous request to clear SHALL be rejected.

#### Scenario: Clearing empties the conversation everywhere
- **WHEN** a signed-in reader confirms clearing a Topic's chat
- **THEN** the conversation shows empty on every device from then on

#### Scenario: Clearing keeps the spend rows
- **WHEN** a conversation with recorded turn costs is cleared
- **THEN** every cleared turn's cost keeps counting in spend sums and admin totals

#### Scenario: An anonymous clear is rejected
- **WHEN** a request to clear arrives without a signed-in user
- **THEN** the api rejects it and stores nothing

### Requirement: A turn in which a Topic Tool fired keeps its text and costs what it used
A chat turn in which a Topic Tool fired SHALL keep its question and answer text even when the gate denies the user `chat:persist`. Its spend SHALL count every model step's tokens and SHALL be saved as a chat turn row, in the same budget pool a read-only turn uses.

#### Scenario: A turn in which a Topic Tool fired keeps its text
- **WHEN** a Topic Tool fires in a turn
- **THEN** its `chat_turns` row holds the question and answer, encrypted like any kept text

#### Scenario: A turn in which a Topic Tool fired costs what it used
- **WHEN** a turn runs several model steps to propose and then save an edit
- **THEN** the saved cost covers every step's tokens and counts toward the user's monthly budget
