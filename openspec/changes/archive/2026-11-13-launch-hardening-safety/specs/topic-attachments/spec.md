## ADDED Requirements

### Requirement: A zipped document that declares too large an unpacked size is rejected before it is opened

Before a Word file or a workbook is opened, in a Topic attachment and in a chat attachment alike, its zip directory
SHALL be read, and a file whose declared unpacked size is past a bound far above a real document's SHALL be rejected
without being unpacked. A Topic attachment so rejected SHALL be marked failed, and a chat attachment so rejected
SHALL reject its chat turn or its chat room post in words, as an unreadable file does.

#### Scenario: A zip with other bytes before it is read from its end

- **WHEN** a Word file whose zip has other bytes before it, which a reader of Word files still opens, declares a huge
  unpacked size
- **THEN** its directory is found from the end of the file, and the file is rejected without being unpacked

#### Scenario: A directory that does not hold every entry it declares is rejected

- **WHEN** a zip's end record declares more entries than its directory holds
- **THEN** the file is rejected as one that cannot be read, so no declared size goes unread

#### Scenario: A small file that declares a huge unpacked size is rejected

- **WHEN** a 1 MB workbook whose zip directory declares several gigabytes unpacked is attached to a Topic
- **THEN** no entry is unpacked, the attachment is marked failed, and its owner sees that Carl couldn't read the file

#### Scenario: A real document is opened

- **WHEN** a 5 MB Word file whose declared unpacked size is a real document's is attached
- **THEN** it is opened and extracted as before

#### Scenario: A chat attachment gets the same check

- **WHEN** a user attaches a Word file that declares a huge unpacked size to a chat turn
- **THEN** the chat turn is rejected in words instead of being sent without the file, and no entry is unpacked

### Requirement: A Topic attachment is extracted in a child process with a memory limit

The worker SHALL extract a Topic attachment's text in a child process with a memory limit, never in the process that
runs its other activities. A file whose extraction passes the limit SHALL end its child process alone: that
attachment SHALL be marked failed, and every Scan, recording, and render the worker is running SHALL go on.

#### Scenario: A file past the memory limit fails alone

- **GIVEN** a worker that is running a Scan and extracting another owner's attachment
- **WHEN** one attachment's extraction passes the child process's memory limit
- **THEN** that attachment is marked failed after its attempts, the Scan finishes, and the other owner's attachment
  turns ready

#### Scenario: An honest file's context is unchanged

- **WHEN** a Word file, a PDF, and a workbook within the limits are each attached
- **THEN** each one's stored context is the context the in-process extraction produced

### Requirement: An attachment upload shares the tool caller limit

A Topic attachment upload, a file or a url, SHALL share the tool caller limit the chat turns and the MCP routes use,
so a burst of uploads from one caller is rejected with a 429 before anything is stored or fetched.

#### Scenario: A burst of uploads is rejected past the limit

- **WHEN** one user sends more attachment uploads in a minute than the tool caller limit allows
- **THEN** the uploads past the limit are rejected with a 429, nothing is stored for them, and no page is fetched
