## MODIFIED Requirements

### Requirement: A scanner sidecar screens untrusted text before it enters the pipeline

An LLM Guard container SHALL run as a scanner service that the `worker` reaches over HTTP through one seam, with a bounded timeout. It SHALL be called once per layer, with one detector set per layer and no second model judging the first:

- attachment text, before context generation: injection, secrets, and invisible-and-bidi-character detection
- fetched source content, before scoring: injection and invisible-and-bidi-character detection
- an owner-supplied url's page, before the url is exposed to a reader: the fetched-content detector set

The third layer screens the url itself rather than what a Scan later does with it. A url written into a Topic prompt becomes a Source the moment the Topic saves, and is otherwise readable by everyone the Topic is visible to before anything has judged it. Screening at scoring time is too late for that, because it decides only whether a fetched page becomes a Finding.

Personal details SHALL be redacted in place rather than rejecting the text: an accepted verdict carries the scanner's redacted text, and every caller SHALL use that text rather than the original, so personal details reach neither a model nor the database. The redaction SHALL cover the entity types that are damaging to store — government identifiers, payment details, phone numbers, email addresses, bank details — and SHALL NOT cover personal names, because names are the substance of the content this product handles and flagging them would redact nearly every document. A scanner that returns no redacted text SHALL fall back to the original, since silently dropping a body is worse than not redacting it.

The scanner SHALL NOT sit in the error-reporting path. Content is kept out of outgoing error events by never attaching it and by a local send-time scrub (see `monitoring-analytics`), because a network call inside error reporting makes a scanner outage generate the errors it is being asked to screen.

The injection threshold SHALL come from configuration whose default is the value the eval harness measured, not the scanner's shipped default.

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

### Requirement: The scanner fails open and is optional

The scanner SHALL be defense in depth behind unconditional structural sanitization: when its url is unset, or it is unreachable, errors, or exceeds its timeout, the text SHALL be treated as unflagged and the Scan SHALL proceed. A scanner outage SHALL NOT fail a Scan, an attachment, or a request.

A configured scanner that then fails SHALL have the degradation logged and reported, since a scanner that was meant to be answering and is not is an incident.

An unset url SHALL NOT be logged or reported per call. It is a deployment's stated configuration rather than a failure, and it is the steady state for every screen in that deployment, so reporting it would send one report per screened text and bury the failures that do matter. A deployment that runs without a scanner therefore SHALL know it from its own configuration, not from its error stream.

#### Scenario: An unreachable scanner does not stop a Scan

- **WHEN** the scanner service is down or times out during a Scan
- **THEN** the content is treated as unflagged, the failure is logged and reported, and the Scan completes normally

#### Scenario: An unset scanner url disables scanning

- **WHEN** the scanner url is not configured, as in a self-hosted deployment
- **THEN** no scan call is attempted and every pipeline output is unchanged from an unscanned build

#### Scenario: An unset scanner url is not an incident

- **GIVEN** a deployment running with no scanner url configured
- **WHEN** any number of texts are screened
- **THEN** nothing is logged or reported for the missing scanner, so the error stream carries only real failures
