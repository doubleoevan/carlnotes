## MODIFIED Requirements

### Requirement: A scanner sidecar screens untrusted text before it enters the pipeline

An LLM Guard container SHALL run as a scanner service that the `worker` reaches over HTTP through one function, with a
bounded timeout. It SHALL be called once per layer, with one detector set per layer and no second model judging the first:

- attachment text from a url and a chat attachment's text, before context generation: injection, secrets, and
  invisible-and-bidi-character detection
- a file that a Topic's owner uploads as an attachment: secrets and invisible-and-bidi-character detection, with no
  injection detection
- fetched source content, before scoring: injection and invisible-and-bidi-character detection

A file that a Topic's owner uploads SHALL skip injection detection because the owner chose to give Carl that file, the
way they type the prompt, and an owner's instructions in their own file are not an attack on them. Its text still
reaches every prompt inside the nonce-delimited fence. Injection detection also flags plain numbered lists, which is the
shape of the lists of names that owners attach.

Fetched source content SHALL be screened as the same bounded prefix that scoring reads, instead of in full. The bound
SHALL be one value serving both, so the screened text and the scored text cannot drift apart, and every consumer that
reads a Resource's stored body SHALL stay at or under that prefix or screen what it reads itself. A stored body can run
to tens of thousands of characters — a video's transcript routinely does — while only its first several thousand ever
reach a model, so screening the whole body spends the scanner's bounded timeout on text nothing will read and risks the
timeout expiring, which fails open and drops the screening altogether. Screening the scored prefix means the scanner
sees every character a model sees.

Personal details SHALL be redacted in place instead of rejecting the text. An accepted verdict includes the scanner's
redacted text, and every caller SHALL use that text instead of the original, so personal details reach neither a model
nor the database. The redaction SHALL cover the entity types that are damaging to store — government identifiers,
payment details, phone numbers, email addresses, bank details — and SHALL NOT cover personal names, because names are
the substance of the content this product handles and flagging them would redact nearly every document. A scanner that
returns no redacted text SHALL fall back to the original, since silently dropping a body is worse than not redacting it.

A file that a Topic's owner uploads SHALL keep its personal details. The owner chose to give Carl that file, and a
contact list or a roster is the file's substance.

The scanner SHALL NOT sit in the error-reporting path. Content is kept out of outgoing error events by never attaching
it and by a local send-time scrub (see `monitoring-analytics`), because a network call inside error reporting makes a
scanner outage generate the errors it is being asked to screen.

The injection threshold SHALL come from configuration whose default is the value the eval harness measured, not the
scanner's shipped default.

#### Scenario: A long body is screened as the prefix that will be scored

- **WHEN** a Resource's fetched content is longer than the scoring prefix, as a video transcript typically is
- **THEN** the scanner is sent that prefix instead of the whole body, and the text scored is the text screened

#### Scenario: No model reads a character the scanner did not

- **WHEN** any consumer reads a Resource's stored body — scoring it, or answering a chat turn from it
- **THEN** what it reads falls within the screened prefix, so unscreened text never reaches a model

#### Scenario: Personal details are redacted rather than rejected

- **WHEN** a chat attachment or a page attached by url contains a phone number or an email address but nothing a detector rejects
- **THEN** the text is accepted, and the text the summarizing model reads and the context stored include the scanner's
  redactions instead of the original values

#### Scenario: An owner's upload keeps its personal details and skips injection detection

- **WHEN** a Topic's owner uploads a numbered list of names with their phone numbers
- **THEN** the scanner runs no injection detection and no redaction on it, and the stored context includes every name and number

#### Scenario: Flagged attachment text fails the attachment with a visible reason

- **WHEN** the scanner flags an attachment's extracted text
- **THEN** the attachment's status becomes failed with the reason recorded and shown to the owner, and its context never
  reaches a Scan

#### Scenario: Flagged fetched content drops the Resource under its own reason

- **WHEN** the scanner flags a Resource's fetched content
- **THEN** the Resource is dropped as filtered under a scanner drop reason, counted with the other drop causes, and
  named in the scan report

#### Scenario: A flagged url is never exposed

- **WHEN** the scanner flags the page behind an owner-supplied url Source
- **THEN** the Source is failed with the flagged detectors as its reason, and its url is never returned to a user who
  does not own the Topic

#### Scenario: One pass per layer

- **WHEN** a text is scanned for a layer
- **THEN** exactly one scan call is made for it and no model is asked to judge the scanner's verdict

## REMOVED Requirements

### Requirement: The scanner fails open and is optional

**Reason**: Every attachment fails open now, a table file and a short document included, so the scenarios that failed
a table file on an unreachable scanner no longer hold.

**Migration**: Replaced by "The scanner fails open for every input and is optional".

## ADDED Requirements

### Requirement: The scanner fails open for every input and is optional

The scanner SHALL be defense in depth behind unconditional structural sanitization. If its url is unset, or it is
unreachable, errors, exceeds its timeout, or returns a response that rejects the text without naming a detector, the
text SHALL be treated as unflagged and the Scan SHALL proceed. A scanner outage SHALL NOT fail a Scan, a request, or an
attachment.

Every attachment SHALL fail open, a table file and a document stored as written included. Their text reaches the Scan
prompt with no model step in between, and the nonce-delimited fence around the topic context is the defense that holds
without the scanner. Failing an attachment on a busy or out-of-memory scanner would fail the owner's file for a reason
they cannot act on.

Only a detector that scores a text at or above the threshold SHALL reject it.

A configured scanner that then fails SHALL have the degradation logged and reported, since a scanner that was meant to
be answering and is not is an incident.

An unset url SHALL NOT be logged or reported per call. It is a deployment's stated configuration instead of a failure,
and it is the steady state for every screen in that deployment, so reporting it would send one report per screened text
and bury the failures that do matter. A deployment that runs without a scanner therefore SHALL know it from its own
configuration, not from its error stream.

#### Scenario: An unreachable scanner does not stop a Scan

- **WHEN** the scanner service is down or times out during a Scan
- **THEN** the content is treated as unflagged, the failure is logged and reported, and the Scan completes normally

#### Scenario: An unreachable scanner stores an attachment unscreened

- **WHEN** a configured scanner is down, runs out of memory, or times out on every try while screening a table file or a
  short document
- **THEN** the attachment is stored as written and becomes ready, and the failure is logged and reported

#### Scenario: A rejection that names no detector passes the text

- **WHEN** the scanner returns a rejection with no detector scores
- **THEN** the text is treated as unflagged, and the failure is logged and reported

#### Scenario: An unset scanner url disables scanning

- **WHEN** the scanner url is not configured, as in a self-hosted deployment
- **THEN** no scan call is attempted, every pipeline output is unchanged from an unscanned build, and a table file and a
  short document are stored as written normally

#### Scenario: An unset scanner url is not an incident

- **GIVEN** a deployment running with no scanner url configured
- **WHEN** any number of texts are screened
- **THEN** nothing is logged or reported for the missing scanner, so the error stream includes only real failures
