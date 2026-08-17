## MODIFIED Requirements

### Requirement: A scanner sidecar screens untrusted text before it enters the pipeline

An LLM Guard container SHALL run as a scanner service that the `worker` reaches over HTTP through one seam, with a bounded timeout. It SHALL be called once per layer, with one detector set per layer and no second model judging the first:

- attachment text, before context generation: injection, secrets, and invisible-and-bidi-character detection
- fetched source content, before scoring: injection and invisible-and-bidi-character detection

Fetched source content SHALL be screened as the same bounded prefix that scoring reads, rather than in full. The bound SHALL be one value serving both, so the screened text and the scored text cannot drift apart, and every consumer that reads a Resource's stored body SHALL stay at or under that prefix or screen what it reads itself. A stored body can run to tens of thousands of characters — a video's transcript routinely does — while only its first several thousand ever reach a model, so screening the whole body spends the scanner's bounded timeout on text nothing will read and risks the timeout expiring, which fails open and drops the screening altogether. Screening the scored prefix means the scanner sees every character a model sees.

Personal details SHALL be redacted in place rather than rejecting the text: an accepted verdict carries the scanner's redacted text, and every caller SHALL use that text rather than the original, so personal details reach neither a model nor the database. The redaction SHALL cover the entity types that are damaging to store — government identifiers, payment details, phone numbers, email addresses, bank details — and SHALL NOT cover personal names, because names are the substance of the content this product handles and flagging them would redact nearly every document. A scanner that returns no redacted text SHALL fall back to the original, since silently dropping a body is worse than not redacting it.

The scanner SHALL NOT sit in the error-reporting path. Content is kept out of outgoing error events by never attaching it and by a local send-time scrub (see `monitoring-analytics`), because a network call inside error reporting makes a scanner outage generate the errors it is being asked to screen.

The injection threshold SHALL come from configuration whose default is the value the eval harness measured, not the scanner's shipped default.

#### Scenario: A long body is screened as the prefix that will be scored

- **WHEN** a Resource's fetched content is longer than the scoring prefix, as a video transcript typically is
- **THEN** the scanner is sent that prefix rather than the whole body, and the text scored is the text screened

#### Scenario: No model reads a character the scanner did not

- **WHEN** any consumer reads a Resource's stored body — scoring it, or answering a chat turn from it
- **THEN** what it reads falls within the screened prefix, so unscreened text never reaches a model

#### Scenario: Personal details are redacted rather than rejected

- **WHEN** an uploaded document contains a phone number or an email address but nothing a detector rejects
- **THEN** the document is accepted, and the text the summarizing model reads and the context stored carry the scanner's redactions rather than the original values

#### Scenario: Flagged attachment text fails the attachment with a visible reason

- **WHEN** the scanner flags an attachment's extracted text
- **THEN** the attachment's status becomes failed with the reason recorded and shown to the owner, and its context never reaches a Scan

#### Scenario: Flagged fetched content drops the Resource under its own reason

- **WHEN** the scanner flags a Resource's fetched content
- **THEN** the Resource is dropped as filtered under a scanner drop reason, counted with the other drop causes, and named in the scan report

#### Scenario: A flagged url is never exposed

- **WHEN** the scanner flags the page behind an owner-supplied url Source
- **THEN** the Source is failed with the flagged detectors as its reason, and its url is never returned to a reader who does not own the Topic

#### Scenario: One pass per layer

- **WHEN** a text is scanned for a layer
- **THEN** exactly one scan call is made for it and no model is asked to judge the scanner's verdict
