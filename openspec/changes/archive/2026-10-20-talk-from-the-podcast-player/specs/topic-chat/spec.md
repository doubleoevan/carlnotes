## ADDED Requirements

### Requirement: A stored answer keeps the text of every step
A chat turn's stored answer SHALL be the text of every step the reply took, joined the way the stream showed it, with
the paragraph break that a tool call between two text steps adds. It SHALL never be only the final step's text. A turn
asked from the podcast player SHALL store its structured output's answer, never the output's JSON.

#### Scenario: Text before a tool call survives a reload
- **WHEN** Carl writes a sentence, calls a tool, and writes a second paragraph, and the conversation reloads
- **THEN** the stored answer holds both, separated by a paragraph break, as the stream showed them

#### Scenario: A podcast answer is stored as words
- **WHEN** a podcast chat turn's answer is stored
- **THEN** the stored answer is the answer's text, with no JSON and no speaker field
