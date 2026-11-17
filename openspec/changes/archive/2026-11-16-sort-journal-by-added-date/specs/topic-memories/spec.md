## MODIFIED Requirements

### Requirement: Readers and authorized raters use the Journal

The Journal SHALL read one page of active topic memories at a time. It SHALL show numbered claims with the most recently added claims first across pages. A displayed duplicate group SHALL use its earliest saved date among eligible rows.

#### Scenario: A newly added claim appears first

- **WHEN** a reader opens the Journal after Carl adds a claim
- **THEN** the claim appears ahead of older entries, including those from more recent brews or with positive feedback
- **AND** later evidence for an existing group does not advance its position ahead of a newly added claim

#### Scenario: A Topic has no topic memories

- **WHEN** a reader opens a Topic with no visible topic memories, including a Topic with no Scans
- **THEN** the Brew diary SHALL show the Journal button and a count of zero on web and Expo
- **AND** opening the Journal SHALL show an empty state in Carl's voice

#### Scenario: The owner provides feedback

- **WHEN** an owner or team lead submits a rate-limited rating and optional note together
- **THEN** the rater's saved note returns when they reopen the topic memory
- **AND** the Journal and MCP show the stored claim. Other readers cannot see the rating note.
- **AND** a thumbs-down rejects the topic memory when the note is blank or keeps it as a correction when it contains text

#### Scenario: The owner reaches the saved topic memory limit

- **WHEN** an owner or team lead tries to save a thirty-first active topic memory
- **THEN** the Journal reports the cap without creating another saved topic memory

#### Scenario: A guest opens a private Topic's Journal

- **WHEN** the caller lacks permission to read the Topic
- **THEN** the caller cannot get its topic memories or submit feedback
