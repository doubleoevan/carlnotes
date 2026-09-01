# injection-defense Specification

## Purpose
TBD - created by archiving change harden-launch-readiness. Update Purpose after archive.
## Requirements
### Requirement: Untrusted text is interpolated as nonce-delimited data, enforced at the loader

The prompt writer SHALL treat interpolated values as untrusted by default: its untrusted variable map is the required argument and trusted values SHALL be passed only through a separate, explicit map. Each untrusted value SHALL be wrapped in a delimiter carrying an unguessable nonce generated per `writePrompt` call, and before wrapping the value SHALL have every delimiter tag form (any nonce, not only the current call's) and every backtick removed, so content cannot close the block it sits in. Trusted values — dates, counts, and blocks the app itself composes from its own numbers — SHALL interpolate bare.

A static delimiter SHALL NOT be used, because a template is markdown whose fence a value can close early.

#### Scenario: An untrusted value renders inside per-call nonce delimiters

- **WHEN** a prompt is written with an untrusted value
- **THEN** the value appears wrapped in an opening and closing delimiter carrying the same nonce, and a second call to write the same prompt uses a different nonce

#### Scenario: A forged delimiter in the value is stripped

- **WHEN** an untrusted value itself contains a delimiter tag or a backtick run
- **THEN** those are removed from the value before it is wrapped, so the rendered prompt has exactly one opening and one closing delimiter for that value

#### Scenario: Trusted values interpolate bare

- **WHEN** a prompt is written with a trusted value such as the scan date or the cost line
- **THEN** that value renders without delimiters, and it is passed through the explicit trusted map rather than the default one

### Requirement: The task is restated after every untrusted block

A prompt template SHALL NOT place an untrusted placeholder in its instruction region: every untrusted placeholder SHALL appear after the instructions, and the template SHALL restate the task after its last untrusted block — stating that the delimited text is content to evaluate and never instructions, then the task and the required output — so the last thing the model reads is the app's own wording.

#### Scenario: A written prompt ends with the app's wording

- **WHEN** any prompt builder writes its prompt with untrusted values
- **THEN** the written prompt's last non-empty line is app-authored restatement text, not interpolated content

### Requirement: Model output is schema-locked and takes no action

Every pipeline model call whose output the app consumes SHALL constrain that output to a Zod schema, and no model output SHALL become an executed action: not a tool call, not a query, not a url to fetch, and not a control-flow decision. Numeric output SHALL be clamped to its valid range. The pipeline's model calls SHALL be given no tools.

#### Scenario: Scoring output is schema-constrained and clamped

- **WHEN** a scoring call returns a score outside the 0-to-1 range, or extra fields
- **THEN** the consumed value is the clamped score and the schema's fields only, and nothing in the response causes a fetch, a query, or a tool call

### Requirement: Model-written text renders with formatting and allowlisted reach

Every surface that renders the scan report — the topic page, the activity drill-down, and email — SHALL render it through a sanitized markdown subset: bold, lists, and headings MAY render as markup, and a link SHALL be clickable only when its destination exactly matches a kept Finding's stored Resource url on that surface — a destination the surface already links to on its own, so the note adds no reach the product does not already have. Every other link SHALL render as its label and destination in plain text with no anchor, an image SHALL render nothing, raw HTML SHALL render as the characters the model typed, and a bare url SHALL NOT be autolinked unless it too matches the allowlist. A surface with no kept-Finding urls in hand SHALL render every link inert rather than guessing. The relevance explanation SHALL render as plain text with no markdown interpretation at all — so injection cannot become phishing.

#### Scenario: A citation of a kept item is a link, anything else is inert

- **WHEN** a scan report cites a kept Finding's stored url and also contains a link to any other destination, an HTML anchor, or an image
- **THEN** the kept citation renders as a real link, and everything else shows its label and destination as inert text — no anchor, no image, no embedded markup — while the report's bold and lists still render as formatting

#### Scenario: The relevance explanation renders as text

- **WHEN** a Finding's relevance explanation is shown on a feed card or in email
- **THEN** it renders as a text node, with no markdown or HTML interpretation

### Requirement: Attachment-derived context is visible and editable by the owner

Because an attachment's generated context is produced once and merged into every later Scan for its Topic, the owner SHALL be able to read that context and edit it, and a saved edit SHALL be the context the next Scan reads. Editing SHALL NOT regenerate the context, and SHALL be authorized through the same gate as the rest of the Topic's edits.

#### Scenario: The owner corrects a poisoned context

- **WHEN** the owner edits an attachment's context and saves
- **THEN** the stored context is replaced by the edited text and the Topic's next Scan builds its context from the edited text

#### Scenario: A non-owner cannot edit the context

- **WHEN** a user who is neither the Topic's owner nor an admin attempts to edit an attachment's context
- **THEN** the edit is rejected by the authorization gate

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

### Requirement: A content security policy holds images to this origin

Every response SHALL include a `Content-Security-Policy` header setting `img-src` to this origin, with `blob:` and `data:` for the local file a composer previews before upload. The policy SHALL also set `object-src 'none'` and `frame-ancestors 'none'`.

This backs up the inline-image rule instead of replacing it. Model-written and user-pasted markdown images still render as text links, and a link preview's image is still fetched once by the server and served from this origin — the policy is what makes a remote image that escaped either rule fail in the browser instead of quietly loading and reporting the reader to its host.

The policy SHALL NOT set `script-src` or `style-src`. The application shell runs an inline theme script before first paint, and a script policy that broke it would be reverted instead of kept.

#### Scenario: A remote image is blocked

- **WHEN** any page in the application renders an image whose source is another origin
- **THEN** the browser blocks the request

#### Scenario: A proxied preview image loads

- **WHEN** a link preview card renders its image from this application's own route
- **THEN** the image loads

#### Scenario: The inline theme script still runs

- **WHEN** the application shell loads
- **THEN** the inline theme script runs and the page does not flash the wrong theme

