## ADDED Requirements

### Requirement: A Topic's merged scan context reaches every prompt as fenced data

`buildTopicScanContext` SHALL label each attachment's context with a line naming its file, so verbatim rows read as that file's content and never blend into the Topic prompt around them.

The security fence itself SHALL stay where it already lives: every prompt that includes the merged context SHALL interpolate it through the prompt writer's untrusted map, whose per-call nonce delimiter wraps the whole merge and whose stripping removes any delimiter tag a cell tries to forge. The merge SHALL NOT pre-wrap attachments in that same delimiter form, because the writer strips every delimiter tag a value includes — any nonce, not only its own — so a fence written at the merge would be removed at interpolation.

An embedding consumer takes the merged context bare. A vector has no instructions to obey, so there is no fence for it to need.

#### Scenario: Each attachment context is labeled in the merge

- **WHEN** a Topic with two ready attachments builds its scan context
- **THEN** each attachment's context sits under a line naming its file

#### Scenario: A cell cannot escape the prompt's fence

- **WHEN** a merged context holding a forged delimiter tag is interpolated into a prompt as untrusted
- **THEN** the forged tag is stripped and the whole merge sits inside one per-call nonce delimiter

#### Scenario: Every generative consumer interpolates the merge as untrusted

- **WHEN** a prompt template includes the merged scan context
- **THEN** the context passes through the prompt writer's untrusted map, never its trusted one

## MODIFIED Requirements

### Requirement: The scanner fails open and is optional

The scanner SHALL be defense in depth behind unconditional structural sanitization: when its url is unset, or it is unreachable, errors, or exceeds its timeout, the text SHALL be treated as unflagged and the Scan SHALL proceed. A scanner outage SHALL NOT fail a Scan or a request.

A table file is the one exception, and it fails closed against a *configured* scanner. When a scanner url is set and its screen does not complete, the attachment SHALL be failed instead of written as table text, because its context reaches the Scan prompt verbatim with no model step in between. Every other attachment kind SHALL continue to fail open, since its text is rewritten by the summarizer before any Scan prompt includes it.

An unset scanner url SHALL NOT fail a table file. A deployment running without a scanner has stated that it accepts unscreened text throughout, and failing every spreadsheet would make the feature unavailable there instead of defending anything.

A configured scanner that then fails SHALL have the degradation logged and reported, since a scanner that was meant to be answering and is not is an incident.

An unset url SHALL NOT be logged or reported per call. It is a deployment's stated configuration instead of a failure, and it is the steady state for every screen in that deployment, so reporting it would send one report per screened text and bury the failures that do matter. A deployment that runs without a scanner therefore SHALL know it from its own configuration, not from its error stream.

#### Scenario: An unreachable scanner does not stop a Scan

- **WHEN** the scanner service is down or times out during a Scan
- **THEN** the content is treated as unflagged, the failure is logged and reported, and the Scan completes normally

#### Scenario: An unreachable scanner fails a table file

- **WHEN** the scanner is down or times out while screening a table file
- **THEN** that attachment is failed with a reason naming that its contents could not be checked, and no table text is stored

#### Scenario: An unset scanner url disables scanning

- **WHEN** the scanner url is not configured, as in a self-hosted deployment
- **THEN** no scan call is attempted, every pipeline output is unchanged from an unscanned build, and a table file is written as table text normally

#### Scenario: An unset scanner url is not an incident

- **GIVEN** a deployment running with no scanner url configured
- **WHEN** any number of texts are screened
- **THEN** nothing is logged or reported for the missing scanner, so the error stream carries only real failures
