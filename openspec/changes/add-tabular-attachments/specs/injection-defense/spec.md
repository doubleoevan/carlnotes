## ADDED Requirements

### Requirement: A Topic's merged scan context fences each attachment as data

`buildTopicScanContext` SHALL wrap each attachment's context in a per-call nonce delimiter, the same structural defense the prompt writer already applies to interpolated values, so a cell or a sentence cannot close its own block.

The merge currently joins the Topic prompt and every attachment context with blank lines and no delimiter at all. That was tolerable while every attachment context was model-written prose. It is not tolerable once a tabular attachment's context is verbatim untrusted rows.

Fencing SHALL apply to every attachment kind, not only tabular. A summary is model-written text over untrusted input and was never trustworthy either.

#### Scenario: Each attachment context is fenced in the merge

- **WHEN** a Topic with two ready attachments builds its scan context
- **THEN** each attachment's context appears inside its own delimiter carrying the call's nonce

#### Scenario: A cell cannot escape its block

- **WHEN** an attachment's context includes the delimiter tag
- **THEN** that tag is removed from the value before wrapping, so the merged context has exactly one opening and one closing delimiter for that attachment

## MODIFIED Requirements

### Requirement: The scanner fails open and is optional

The scanner SHALL be defense in depth behind unconditional structural sanitization: when its url is unset, or it is unreachable, errors, or exceeds its timeout, the text SHALL be treated as unflagged and the Scan SHALL proceed. A scanner outage SHALL NOT fail a Scan or a request.

A tabular attachment is the one exception, and it fails closed against a *configured* scanner. When a scanner url is set and its screen does not complete, the attachment SHALL be failed instead of projected, because its context reaches the Scan prompt verbatim with no model step in between. Every other attachment kind SHALL continue to fail open, since its text is rewritten by the summarizer before any Scan prompt includes it.

An unset scanner url SHALL NOT fail a tabular attachment. A deployment running without a scanner has stated that it accepts unscreened text throughout, and failing every spreadsheet would make the feature unavailable there instead of defending anything.

A configured scanner that then fails SHALL have the degradation logged and reported, since a scanner that was meant to be answering and is not is an incident.

An unset url SHALL NOT be logged or reported per call. It is a deployment's stated configuration instead of a failure, and it is the steady state for every screen in that deployment, so reporting it would send one report per screened text and bury the failures that do matter. A deployment that runs without a scanner therefore SHALL know it from its own configuration, not from its error stream.

#### Scenario: An unreachable scanner does not stop a Scan

- **WHEN** the scanner service is down or times out during a Scan
- **THEN** the content is treated as unflagged, the failure is logged and reported, and the Scan completes normally

#### Scenario: An unreachable scanner fails a tabular attachment

- **WHEN** the scanner is down or times out while screening a tabular attachment
- **THEN** that attachment is failed with a reason naming that its contents could not be checked, and no projection is stored

#### Scenario: An unset scanner url disables scanning

- **WHEN** the scanner url is not configured, as in a self-hosted deployment
- **THEN** no scan call is attempted, every pipeline output is unchanged from an unscanned build, and a tabular attachment is projected normally

#### Scenario: An unset scanner url is not an incident

- **GIVEN** a deployment running with no scanner url configured
- **WHEN** any number of texts are screened
- **THEN** nothing is logged or reported for the missing scanner, so the error stream carries only real failures
