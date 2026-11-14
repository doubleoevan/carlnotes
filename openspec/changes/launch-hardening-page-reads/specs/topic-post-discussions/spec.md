## ADDED Requirements

### Requirement: A page that shows a recording discussion polls the discussion's status

While a Topic Post's discussion records, the web's and the mobile app's Topic Post page SHALL poll the discussion's
status every 15 seconds, as the status-reads capability states, for at most 45 minutes a visit. It SHALL read the Topic
Post once that status leaves recording, so the card shows the discussion or its failure with no reload. The page SHALL
pass the status read to the shared discussion card, and a card given none SHALL send no status read.

#### Scenario: A recording discussion costs a status read a poll

- **WHEN** a reader keeps a Topic Post open while its discussion records
- **THEN** the page sends the discussion's status read every 15 seconds, and no read of the post, its body, or its
  comment thread

#### Scenario: A published discussion replaces the recording state

- **WHEN** a status poll returns published
- **THEN** the page reads the Topic Post once, and the card shows the discussion ready to play with its transcript

#### Scenario: A failed recording stops the poll

- **WHEN** a recording fails, or the sweep closes out one stuck recording, and the next status poll returns failed
- **THEN** the page reads the Topic Post once, the card shows no recording state, and no further status read is sent

#### Scenario: An MCP view sends no status read

- **WHEN** an MCP view shows a Topic Post whose discussion is recording
- **THEN** the shared card is given no status read, and the view sends none
