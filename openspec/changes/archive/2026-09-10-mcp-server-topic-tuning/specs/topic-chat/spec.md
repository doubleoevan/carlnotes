## REMOVED Requirements

### Requirement: Chat is read-only over a Topic's existing curation output
**Reason**: A chat turn can now change a Topic through the Topic Tools, so the requirement's name no longer holds. Its guarantee for a user who may not edit lives on under the requirement below.
**Migration**: None. The read-only guarantee for a user who may not edit the Topic is restated, unchanged, in "Chat writes to a Topic only through the Topic Tools".

## ADDED Requirements

### Requirement: Chat writes to a Topic only through the Topic Tools
A chat turn for a user who may not edit the Topic SHALL NOT write to `topics`, `sources`, `findings`, `resources`, or `scans`, SHALL NOT revise a Topic's context, SHALL NOT create or modify a Finding, and SHALL NOT contribute any signal to relevance scoring. The only row such a turn writes is its own Chat Turn save. A chat turn for a user who may edit the Topic MAY write `topics.prompt` with its Prompt Version, and `sources`, through the Topic Tools alone. It SHALL still never write a Finding, a Resource, or a Scan, and never feed relevance scoring.

#### Scenario: A turn from a user who may not edit leaves the Scan pipeline untouched
- **WHEN** a user who may not edit the Topic sends a chat turn
- **THEN** no `topics`, `findings`, `resources`, `sources`, or `scans` row is inserted or updated, and only a `chat_turns` row is written

#### Scenario: An editor's turn writes only through the Topic Tools
- **WHEN** a user who may edit the Topic sends a chat turn in which a Topic Tool fires
- **THEN** beyond its `chat_turns` row the turn writes only `topics.prompt` with a new Prompt Version, or a `sources` row. No `findings`, `resources`, or `scans` row changes

#### Scenario: Chat never influences the next Scan
- **WHEN** a Scan starts on a Topic that has had chat turns
- **THEN** the Scan's relevance scoring reads the same inputs it would have read with no chat turns at all, apart from a prompt or Source saved through a Topic Tool

### Requirement: A turn in which a Topic Tool fired keeps its text and costs what it used
A chat turn in which a Topic Tool fired SHALL keep its question and answer text even when the gate denies the user `chat:persist`. Its spend SHALL count every model step's tokens and SHALL be saved in the same ledger and budget pool a read-only turn uses.

#### Scenario: A turn in which a Topic Tool fired keeps its text
- **WHEN** a Topic Tool fires in a turn
- **THEN** its `chat_turns` row holds the question and answer, encrypted like any kept text

#### Scenario: A turn in which a Topic Tool fired costs what it used
- **WHEN** a turn runs several model steps to propose and then save an edit
- **THEN** the saved cost covers every step's tokens and counts toward the user's monthly budget
