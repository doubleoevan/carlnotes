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
model and each spoken part of a reply SHALL write a row with cost and no text, so voice spend reads from the same
table. A silent recording calls no model and writes no row.

The row SHALL have its `kind`, a non-null `chat_turn_kind` enum built from `chatTurnKinds` in `shared/enums.ts`, with
no default, so every insert names it:
- `private` for a private chat turn on a Topic, a Team, or the new-topic chat
- `podcast` for a turn asked from the podcast player
- `chat_room` for Carl's chat room turn
- `transcription` and `speech` for the voice spend rows

A `podcast` row SHALL also have the Podcast Episode, `episode_id`, which references `episodes` and is deleted with it,
the chapter's position, `chapter_position`, and the answer's speaker, `podcast_answer_speaker`, an `episode_speaker`
enum built from `podcastEpisodeSpeakers`, which SHALL hold `host` or `cohost`, never a host's name. Only the stored
question's note names the host who answered. Check constraints SHALL hold each kind's shape:
- a `room_message_id` on a `chat_room` row only and always, and no text on a `chat_room` row
- the episode, the chapter position, and the speaker on a `podcast` row only and always, with a Topic and no Team
- no question, answer, or tool calls on a `transcription` or `speech` row

No user's monthly spend sum SHALL filter by kind. A read that tells rows apart SHALL read `kind`, never which columns
are null: a conversation reads its `private` and `podcast` rows, and the team spend counts a Team's own room by its
`chat_room` rows.

#### Scenario: A persisted turn stores its text
- **WHEN** a user whose plan persists conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the question, the answer, and the turn's cost

#### Scenario: An ephemeral turn stores cost without text
- **WHEN** a user whose plan does not persist conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the turn's cost with null question and answer

#### Scenario: A voice spend row has no text
- **WHEN** a recording is transcribed
- **THEN** a chat turn row of kind `transcription` records its cost and tokens with a null question and answer

#### Scenario: Every write names its kind
- **WHEN** a private turn, a podcast chat turn, a room turn, a transcription, and a spoken part are each recorded
- **THEN** their rows read `private`, `podcast`, `chat_room`, `transcription`, and `speech`

#### Scenario: A row that does not match its kind is rejected
- **WHEN** an insert writes a `podcast` row with no episode, a `private` row with a room message id, or a `speech` row
  with a question
- **THEN** the database rejects it with a check violation

#### Scenario: A podcast row keeps its episode and speaker
- **WHEN** Vienna answers a question asked during chapter 2
- **THEN** the row is `podcast` with the episode's id, chapter position 1, and speaker `cohost`, and its speaker column
  holds no host name

## ADDED Requirements

### Requirement: The change includes the chat turn kinds migrations
The change SHALL include three migrations, applied in order:
1. A generated migration that creates the `chat_turn_kind` and `episode_speaker` enums and adds `kind` as non-null with
   a temporary `private` default, plus `episode_id`, `chapter_position`, and `podcast_answer_speaker`. It also adds
   `team_id` and `topic_edit` to `chat_proposals`, makes `digest` nullable, widens the unique key with `team_id`,
   and adds the proposal shape check. Every existing proposal is a private chat's.
2. A custom migration that sets `kind` to `chat_room` on every row with a `room_message_id`. Every other existing row,
   including the voice spend rows, stays `private`.
3. A generated migration that drops the default and adds the three check constraints.

Every spend total SHALL be the same before and after.

#### Scenario: Existing rows backfill by their room message
- **WHEN** the migrations run on a database with private turns, room turns, and voice spend rows
- **THEN** each chat room turn is `chat_room`, every other row is `private`, `kind` has no default, and every check
  holds

#### Scenario: Spend is unchanged
- **WHEN** the migrations run
- **THEN** every user's monthly spend and every team's chat spend reads the same as before

### Requirement: A chat proposal is a private chat's digest or a room's encrypted preview
`chat_proposals` SHALL keep one standing preview per user, Topic, and page: `team_id`, null for a private chat, names
the team whose Topic chat room showed the preview, and the unique key SHALL be the user, the Topic, and `team_id`, so a
member of two teams sharing a Topic can agree to a preview only in the room that showed it. A private chat's row SHALL
hold the keyed `digest` and no words of the preview. A chat room's row SHALL hold the preview itself in `topic_edit`,
encrypted the way stored chat text is, and no digest. A check SHALL hold that shape: a digest and no topic edit with no
team, and a Topic, a topic edit, and no digest with one. Each row SHALL reference the chat turn row of the turn that
showed the preview: a `private` row in the private chat, and a `chat_room` row in a room.

#### Scenario: One editor's two previews on one Topic
- **WHEN** an editor has a preview standing in a Topic's private chat and another in its team room
- **THEN** `chat_proposals` holds two rows for that editor and Topic, a digest with no team and an encrypted topic edit
  with the room's team

#### Scenario: A preview shown in one team's room is not answered in another's
- **WHEN** a member of two teams that share a Topic has a preview standing in the first team's room and says yes in the
  second team's room
- **THEN** the second room's turn takes no preview and saves nothing, and the first room's preview still stands

#### Scenario: A chat room proposal without its preview is rejected
- **WHEN** an insert writes a chat room row with a digest and no topic edit
- **THEN** the database rejects it with a check violation
