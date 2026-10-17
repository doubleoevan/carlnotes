## MODIFIED Requirements

### Requirement: Monthly spend is the sum of scan, chat, and podcast episode spend

A user's monthly spend against their monthly budget SHALL be the sum of their recorded Scan cost, their recorded chat
turn cost, and their recorded Podcast Episode cost for the current UTC month. Every check that reads monthly spend SHALL
read that same sum: the manual-scan gate, the chat gate, the voice gate, the account meter, and the episode budget
check.

Transcription and spoken answer spend SHALL be recorded as chat turn cost, so the sum needs no fourth source.

#### Scenario: Chat spend counts toward the monthly budget

- **WHEN** a user has recorded chat turn cost this month
- **THEN** that cost is included in the monthly spend figure that the manual-scan gate reads

#### Scenario: A budget spent on Scans stops chat

- **WHEN** a user's Scan cost alone reaches their monthly budget
- **THEN** further chat turns are rejected

#### Scenario: Podcast Episode spend counts toward the monthly budget

- **WHEN** a user has recorded Podcast Episode cost this month
- **THEN** that cost is included in the monthly spend figure that the chat gate and the account meter read

#### Scenario: Voice spend counts as chat spend
- **WHEN** a user's recording is transcribed and the reply is spoken
- **THEN** the monthly spend sum rises by both, read by every gate alike
