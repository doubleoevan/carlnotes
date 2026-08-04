## ADDED Requirements

### Requirement: Chat Turn is a Topic-scoped record of one question and its reply
A `chat_turns` table SHALL record one row per chat turn, carrying the Topic it is about, the user who sent it, the turn's estimated cost, its creation time, and its question and answer text. The question and answer SHALL be nullable, holding text for every signed-in sender and staying null for a turn that never completed. A row SHALL always be written, whether or not its text is kept, because every turn spends money the monthly meter must see. The user column SHALL be non-null: chat is signed-in only, so every chat turn has a sender.

Chat Turn SHALL NOT be named "Chat Session"; `sessions` belongs to Better Auth's sign-in plumbing and stays distinct from domain vocabulary.

#### Scenario: A persisted turn stores its text
- **WHEN** a user whose plan persists conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the question, the answer, and the turn's cost

#### Scenario: An ephemeral turn stores cost without text
- **WHEN** a user whose plan does not persist conversations completes a chat turn
- **THEN** a `chat_turns` row is written carrying the turn's cost with null question and answer

### Requirement: The embedding model name is a schema-level constant
The name stamped into `resources.embedding_model` SHALL be defined once alongside the embedding dimension in the schema module, so the column, the curation pipeline that writes it, and the chat retrieval that filters on it all read one value.

#### Scenario: One constant serves every reader
- **WHEN** the curation pipeline stamps an embedding model name and chat retrieval filters on it
- **THEN** both read the same exported constant, and no module defines its own copy

### Requirement: The change includes the chat turns migration
The change SHALL ship generated migrations creating `chat_turns` and constraining its user column to non-null. They SHALL alter no table the change did not itself create, and SHALL require no backfill.

#### Scenario: The migration leaves every prior table alone
- **WHEN** the chat turns migrations are applied
- **THEN** `chat_turns` is created and constrained, and no table predating the change is altered
