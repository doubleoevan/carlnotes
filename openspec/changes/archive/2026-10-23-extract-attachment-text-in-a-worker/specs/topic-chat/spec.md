## ADDED Requirements

### Requirement: Attachment text is extracted once, off the request's event loop

The text of a PDF, Word file, or workbook that a chat turn or a chat room post attaches SHALL be extracted in a worker
thread of the api process, not on the event loop that serves the request and every open stream, so one large file never
stalls another user's stream. A chat turn and a chat room post SHALL read the file through one shared helper. Each file
SHALL be extracted once per request: a kept chat attachment SHALL store the text its chat turn extracted, and SHALL NOT
extract the file again. A PDF SHALL be read one page at a time and SHALL stop once its text passes the characters a chat
keeps, and only the clipped text SHALL cross back from the worker thread. The clip's marker SHALL name the attachment's
whole length in characters, or in pages for a PDF that stopped reading pages early. The request SHALL still wait for the
extraction as it does today. The worker thread SHALL read one file at a time, in the order the files arrived, and a
request's files SHALL share one 90-second deadline, waiting included, so the request responds before the server's
120-second idle timeout. A file not read before its deadline SHALL stop only its own read: a file being read SHALL stop
the worker thread, the files waiting behind it SHALL be read by a new worker thread, and none of them SHALL fail for
another file's deadline. A file whose read ran past its deadline SHALL be rejected as too large to read, and a file that
waited behind other files until its deadline SHALL be rejected as busy, apart from a file that cannot be read at all. A
chat turn SHALL respond 413 for a file too large to read, 503 with a `Retry-After` for a busy one, and 422 for a file
that cannot be read, each naming its rejection in `error`, and the chat panel SHALL show a sentence naming each. A chat
room post SHALL respond 400 with `attachment too large` or `attachment busy`, and the chat room SHALL show the poster a
sentence saying which.

#### Scenario: A large PDF leaves the streams alone

- **WHEN** a user attaches a 10 MB PDF while another user's chat stream is open on the same replica
- **THEN** the other stream's bytes keep arriving during the extraction, and the process's event loop p99 for the
  minute stays under its 100 ms warning threshold

#### Scenario: The turn still waits for its text

- **WHEN** a user attaches a Word file to a chat turn
- **THEN** the turn starts once the file's text is extracted, with the text the turn would have had on the event loop

#### Scenario: A kept PDF is extracted once

- **WHEN** a user keeps a PDF on a chat turn
- **THEN** the model reads the PDF's text and the stored attachment is summarized from the same text, with one
  extraction between them

#### Scenario: A long PDF reads only the pages a chat keeps

- **WHEN** a user attaches a 9 MB PDF whose text runs to 41 million characters
- **THEN** the worker thread reads its pages until the text passes 50,000 characters and stops, the chat turn reads the
  first 50,000 characters with a marker naming the PDF's page count, and the process never holds the whole text

#### Scenario: An extraction past the deadline says the file is too large

- **WHEN** a user attaches a Word file whose text takes longer than 90 seconds to extract
- **THEN** the chat turn responds 413, the chat panel says the file is too large for Carl to read, and the next
  attachment is extracted by a new worker thread

#### Scenario: A file that waited past its deadline says Carl is busy

- **WHEN** a user's PDF waits behind other files until its chat turn's deadline passes
- **THEN** the chat turn responds 503 naming `attachment busy`, and the chat panel asks the user to send the file again
  in a moment

#### Scenario: Another user's slow file never fails a file waiting behind it

- **WHEN** one user's PDF runs past its deadline while another user's PDF waits for the worker thread
- **THEN** the waiting PDF is read by a new worker thread, and its chat turn gets its text

#### Scenario: A chat room file past the deadline says the file is too large

- **WHEN** a member shares a Word file in a chat room whose text takes longer than 90 seconds to extract
- **THEN** nothing posts, and the poster reads that one of the files is too large to read
