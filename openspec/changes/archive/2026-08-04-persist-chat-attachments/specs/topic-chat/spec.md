## ADDED Requirements

### Requirement: A reader can keep a chat attachment as durable per-topic memory

A signed-in reader's chat attachments SHALL default to kept, with a per-chip toggle to make any of them ride the turn only — remembering is the expectation attaching sets, so opting out is the deliberate act, not opting in. A kept attachment SHALL persist independently of that turn and of conversation history: its original content stored (encrypted for text, object storage for image and PDF), and a compact summary generated once. That summary SHALL ride into every future turn the same reader takes on the same topic, scoped to that (reader, topic) pair only — never shared into another reader's conversation, and never gated by topic ownership. Persistence SHALL be best-effort and SHALL NOT block or fail the turn it was attached to.

#### Scenario: A kept attachment survives conversation compaction
- **WHEN** a reader keeps an attachment and the conversation later grows well past the verbatim memory window
- **THEN** the kept attachment's summary still rides into the reader's next turn, unaffected by history compaction

#### Scenario: A non-owner's kept attachment is scoped to them alone
- **WHEN** a signed-in reader who does not own the topic keeps an attachment
- **THEN** it feeds only that reader's own future turns on the topic, and neither the owner's nor any other reader's turns include it

#### Scenario: A kept item's ongoing cost stays bounded
- **WHEN** a large document is kept
- **THEN** future turns carry its one-time-generated summary, never the original document's full text

### Requirement: Kept attachments are capped and bounded per reader per topic

A reader MAY hold at most a fixed number of kept attachments per topic. The composer SHALL refuse the keep toggle at the cap and say why, so the bookmark never promises a memory that will not persist — never evicting an existing kept attachment to make room, since silently forgetting something deliberately kept is worse than refusing something new. The server SHALL enforce the same cap as a backstop, without blocking or erroring the turn that carried the attempt.

#### Scenario: The keep toggle refuses at the cap with a reason
- **WHEN** a reader at the cap tries to mark another attachment to keep
- **THEN** the toggle does not flip and a message says the topic's kept memory is full

#### Scenario: At the cap, a new attachment falls back to this turn only
- **WHEN** a reader at the cap attaches something new
- **THEN** it attaches with keep off and a message says it rides this turn only

#### Scenario: A cap-exceeding keep that reaches the server is skipped, never evicting
- **WHEN** a keep past the cap arrives at the server anyway
- **THEN** the turn completes normally, the new attachment is not persisted, and no existing kept attachment is removed

### Requirement: A reader can delete their own kept attachments

The composer SHALL offer a manage control, present only when the reader keeps at least one attachment for the topic, listing their kept attachments by name with a per-item delete. Deleting SHALL remove the row and its stored object, free a slot under the cap, and SHALL be scoped to the keeper — one reader can never delete another reader's kept attachment.

#### Scenario: Deleting a kept attachment frees its slot
- **WHEN** a reader at the cap deletes a kept attachment and marks a new one to keep
- **THEN** the delete succeeds, the keep toggle accepts, and the new attachment persists

#### Scenario: The manage control hides with nothing to manage
- **WHEN** a reader keeps nothing for the topic
- **THEN** the composer shows no manage control

#### Scenario: A delete is scoped to its keeper
- **WHEN** a request tries to delete a kept attachment belonging to another reader
- **THEN** the api refuses it and the attachment remains

### Requirement: Kept attachments cascade with their owning topic or account

Deleting a topic SHALL delete every kept attachment associated with it. Deleting an account SHALL delete every kept attachment that reader holds. Clearing a chat conversation SHALL delete that reader's kept attachments for that topic, since a kept file is conversation memory and clearing the conversation is a request to forget it. Each of these SHALL delete the stored object as well as its row, so nothing is left billing storage that no row accounts for.

#### Scenario: A deleted topic takes its readers' kept attachments with it
- **WHEN** a topic with readers' kept attachments is deleted
- **THEN** every kept attachment tied to that topic is deleted, for every reader who held one, objects as well as rows

#### Scenario: Clearing chat forgets what it kept
- **WHEN** a reader clears their conversation with a topic
- **THEN** the attachments they had kept for that topic are deleted and stop feeding future turns, while another reader's kept attachments on the same topic are untouched
