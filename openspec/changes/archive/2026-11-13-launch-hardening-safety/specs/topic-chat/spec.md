## MODIFIED Requirements

### Requirement: Attachment text is extracted once, off the request's event loop

The text of a PDF, Word file, or workbook that a chat turn or a chat room post attaches SHALL be extracted in a child
process of the api under a memory limit, not on the event loop that serves the request and every open stream, so one
large file never stalls another user's stream and a file that takes too much memory ends its own child process alone.
A chat turn and a chat room post SHALL read the file through one shared helper. Each file SHALL be extracted once per
request: a kept chat attachment SHALL store the text its chat turn extracted, and SHALL NOT extract the file again. A
PDF SHALL be read one page at a time and SHALL stop once its text passes the characters a chat keeps, and only the
clipped text SHALL cross back from the child process. The clip's marker SHALL name the attachment's whole length in
characters, or in pages for a PDF that stopped reading pages early. The request SHALL still wait for the extraction as
it does today. The api SHALL run a few child processes at once, each reading one file at a time, and SHALL take
waiting files in turn by user, so one user's files never hold every child process, and a request's files SHALL share
one 90-second deadline, waiting included, so the request responds before the server's 120-second idle timeout. A file
not read before its deadline SHALL stop only its own read: a file being read SHALL stop its child process, the files
waiting behind it SHALL be read by a new child process, and none of them SHALL fail for another file's deadline. A
file whose read ran past its deadline or past the memory limit SHALL be rejected as too large to read, and a file that
waited behind other files until its deadline SHALL be rejected as busy, apart from a file that cannot be read at all.
A chat turn SHALL respond 413 for a file too large to read, 503 with a `Retry-After` for a busy one, and 422 for a
file that cannot be read, each naming its rejection in `error`, and the chat panel SHALL show a sentence naming each.
A chat room post SHALL respond 400 with `attachment too large` or `attachment busy`, and the chat room SHALL show the
poster a sentence saying which.

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
- **THEN** the child process reads its pages until the text passes 50,000 characters and stops, the chat turn reads the
  first 50,000 characters with a marker naming the PDF's page count, and the process never holds the whole text

#### Scenario: An extraction past the deadline says the file is too large

- **WHEN** a user attaches a Word file whose text takes longer than 90 seconds to extract
- **THEN** the chat turn responds 413, the chat panel says the file is too large for Carl to read, and the next
  attachment is extracted by a new child process

#### Scenario: A file that waited past its deadline says Carl is busy

- **WHEN** a user's PDF waits behind other files until its chat turn's deadline passes
- **THEN** the chat turn responds 503 naming `attachment busy`, and the chat panel asks the user to send the file again
  in a moment

#### Scenario: Another user's slow file never fails a file waiting behind it

- **WHEN** one user's PDF runs past its deadline while another user's PDF waits for a child process
- **THEN** the waiting PDF is read by a child process, and its chat turn gets its text

#### Scenario: A chat room file past the deadline says the file is too large

- **WHEN** a member shares a Word file in a chat room whose text takes longer than 90 seconds to extract
- **THEN** nothing posts, and the poster reads that one of the files is too large to read

#### Scenario: A file past the memory limit fails alone

- **WHEN** a user attaches a workbook whose read passes the child process's memory limit while another user's chat
  stream is open on the same replica
- **THEN** the chat turn responds 413 as a file too large to read, the api process keeps running, and the other
  stream's bytes keep arriving

#### Scenario: One user's files never hold another user's file

- **WHEN** one user sends several slow files at once and another user attaches a PDF
- **THEN** the other user's PDF is read before the first user's files are all done

### Requirement: A signed-out chat post is rejected before its body is read

A post to a topic chat, a team chat, or the new-topic chat by a request with no session SHALL get a 401 with "sign up
required" before its body is read, and a post to a chat room by such a request SHALL get a 404, as a missing chat room
is, before its body is read, so an anonymous request never holds a chat body's attachments in memory. A signed-in post
to a topic chat, a team chat, or the new-topic chat SHALL then pass its authorization, and only then the route's own
body limit and the read of its body. A signed-in post to a chat room SHALL then pass the route's own body limit and
its authorization.

A post to the transcription route by a request with no session SHALL get the same 401 before its body is read, so an
anonymous request never holds a recording in memory.

#### Scenario: An anonymous post with large attachments

- **WHEN** a signed-out caller posts a chat turn with two megabytes of attachments
- **THEN** it gets a 401 at once, and its body is never read

#### Scenario: An anonymous chat room post

- **WHEN** a signed-out caller posts a chat room message with two megabytes of attachments
- **THEN** it gets a 404 at once, as a missing chat room is, and its body is never read

#### Scenario: An anonymous recording
- **WHEN** a request with no session posts a recording
- **THEN** it gets a 401 before the body is read

## ADDED Requirements

### Requirement: A signed-in chat post is authorized before its body is read

A signed-in post to a topic chat, a team chat, or the new-topic chat SHALL be authorized from its user and its page
before its body is read. A post its authorization rejects, for a spent budget, a paused chat, or a page the user may
not chat on, SHALL get the response it gets today, and its body SHALL never be read.

#### Scenario: A spent budget's post reads no body

- **GIVEN** a user whose monthly budget is spent
- **WHEN** the user posts a chat turn with 20 megabytes of attachments
- **THEN** the post is rejected as a spent budget, and its body is never read

#### Scenario: A paused chat's post reads no body

- **GIVEN** a free user and a free-plan spend past the chat cutoff
- **WHEN** the user posts a chat turn with attachments
- **THEN** the post is rejected with a 429 whose error is `chat paused`, and its body is never read

#### Scenario: An allowed post is read as before

- **WHEN** a user who may chat on a Topic posts a chat turn with an image
- **THEN** the body passes the route's body limit and its validation, and Carl answers

### Requirement: Large chat bodies are admitted by their bytes in progress

A chat post whose body is over a few megabytes SHALL wait its turn before its body is read, so that the chat bodies
one api process holds at once stay under a bound on their total bytes, and one user's large posts SHALL be read one
at a time. A post whose turn does not come within twenty seconds SHALL get the busy response of a file that waited
behind other files, and a request dropped while its body waits SHALL never be read. A smaller post SHALL never wait.

#### Scenario: Ten large posts at once stay under the bound

- **WHEN** ten chat posts of 25 megabytes each reach one api replica at once
- **THEN** the bodies the process holds at any moment total no more than the bound, and every post gets its reply

#### Scenario: A user's second large post waits for their first

- **WHEN** one user sends two large chat posts at once while the bound has room for both
- **THEN** the second is read once the first one's response ends, and another user's large post is read beside them

#### Scenario: A post whose turn does not come is busy

- **WHEN** a large chat post waits twenty seconds while earlier posts still fill the bound
- **THEN** its body is never read, and it gets the busy response with a time to send it again

#### Scenario: A dropped request's body stays counted while its route works

- **WHEN** a large chat post's request is dropped after its body is read, while the route still reads its files
- **THEN** its bytes count against the bound until the route is done with them

#### Scenario: A small post does not wait

- **WHEN** a chat post with no attachment arrives while large posts are waiting
- **THEN** its body is read at once
