## ADDED Requirements

### Requirement: One optional source-backed follow-up per Scan

A Scan SHALL keep up to five default Exa queries and MAY append one distinct query from an active Topic memory. Its terms SHALL be supported by the same shown, public, external Finding from the Topic. Private feedback SHALL guide selection among public options and SHALL never supply outgoing query text.

#### Scenario: A note guides the sixth search
- **WHEN** an eligible lead exists and the Topic has a rating note
- **THEN** the selector receives bounded rated claims and notes and may return one offered option or skip
- **AND** every default query runs and Exa receives at most six requests

#### Scenario: The optional search is unavailable
- **WHEN** eligible public evidence is missing or the selector fails or declines
- **THEN** the default searches run alone

#### Scenario: No notes
- **WHEN** a qualifying distinct lead exists and the Topic has no rating notes
- **THEN** the Scan can follow that lead without another model call

#### Scenario: A worker retries ingestion
- **WHEN** a Scan has already reserved its web search
- **THEN** an ingest retry reuses the saved outcome and issues no additional provider requests
- **AND** an interrupted search without a saved result is reported on the Source
