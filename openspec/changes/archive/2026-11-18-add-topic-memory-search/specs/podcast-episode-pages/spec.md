## ADDED Requirements

### Requirement: Episode removal updates both season lists immediately

Confirming removal SHALL dismiss the prompt and hide the episode and its film from the Topic's season lists while deletion runs. Failure SHALL restore the episode and show an error. Playback cleanup SHALL wait for confirmed deletion.

#### Scenario: The server is slow
- **WHEN** the reader confirms a removal and the request is pending
- **THEN** the dialog closes and both lists and their counts immediately omit that episode

#### Scenario: The server refuses deletion
- **WHEN** the pending removal fails
- **THEN** both rows return and the reader can retry
