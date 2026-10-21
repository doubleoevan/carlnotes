## ADDED Requirements

### Requirement: Attachment text is extracted off the request's event loop

The text of a PDF, Word file, or workbook a chat turn attaches SHALL be extracted in a worker thread of the api process,
not on the event loop that serves the request and every open stream, so one large file never stalls another user's
stream. The turn SHALL still wait for the extraction as it does today, and an extraction that fails SHALL reject the
attachment as it does today.

#### Scenario: A large PDF leaves the streams alone

- **WHEN** a user attaches a 10 MB PDF while another user's chat stream is open on the same replica
- **THEN** the other stream's bytes keep arriving during the extraction, and the process's event loop p99 for the
  minute stays under its 100 ms warning threshold

#### Scenario: The turn still waits for its text

- **WHEN** a user attaches a Word file to a chat turn
- **THEN** the turn starts once the file's text is extracted, with the text the turn would have had on the event loop
