## MODIFIED Requirements

### Requirement: Chat Turn is a Topic-scoped record of one question and its reply
A `chat_turns` table SHALL record one row per chat turn, carrying the Topic it is about, the user who sent it, the
turn's estimated cost, its creation time, and its question and answer text. The question and answer SHALL be nullable,
holding text for every signed-in sender and staying null for a turn that never completed. A row SHALL always be written,
whether or not its text is kept, because every turn spends money the monthly meter must see. The user column SHALL be
non-null: chat is signed-in only, so every chat turn has a sender.

Chat Turn SHALL NOT be named "Chat Session"; `sessions` belongs to Better Auth's sign-in plumbing and stays distinct
from domain vocabulary.

The row SHALL carry whether the question was spoken, `is_spoken`, false by default. A transcription that calls the
model and each spoken part of a reply SHALL write a row with cost and no text, the ephemeral shape, so voice spend
reads from the same table. A silent recording calls no model and writes no row.

#### Scenario: A persisted turn stores its text
- **WHEN** a user whose plan persists conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the question, the answer, and the turn's cost

#### Scenario: An ephemeral turn stores cost without text
- **WHEN** a user whose plan does not persist conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the turn's cost with null question and answer

#### Scenario: A voice spend row has no text
- **WHEN** a recording is transcribed
- **THEN** a chat turn row records its cost and tokens with a null question and answer

### Requirement: Room messages are an ordered, encrypted log

A room message table SHALL include an ordered bigint identity id (the SSE cursor needs ordering a uuid cannot give), the
Topic, the holding team as a NOT NULL `team_id` — each holding team's room keeps its own log — a nullable author
reference cleared when the account closes, the author name recorded at post time (Carl's rows record his name with no
account reference), a nullable reply reference to a prior message, encrypted content using the chat text helper, and
created_at. A companion table SHALL hold one running summary per room, its primary key the `(topic_id, team_id)` pair
that names the room, with the message id it is summarized through. The room attachments table SHALL name its team the
same way, NOT NULL.

The row SHALL carry whether the message was spoken, `is_spoken`, false by default, set on a member's spoken message and
on Carl's reply to it.

#### Scenario: Ids order the log

- **WHEN** messages are written concurrently
- **THEN** their ids give one total order a cursor can resume from

#### Scenario: Attribution survives the author

- **WHEN** an author's account closes
- **THEN** the message keeps the recorded name with the account reference cleared, and never reads as Carl's

#### Scenario: A spoken message is marked
- **WHEN** a member's spoken message posts and Carl replies
- **THEN** both rows have `is_spoken` true, and a typed message does not
