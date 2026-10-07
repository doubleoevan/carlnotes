## MODIFIED Requirements

### Requirement: A model call is bounded by a timeout

Every model call routed through the LiteLLM proxy SHALL be bounded by a request timeout, configurable by the
environment. A call that outlives it SHALL abort so the Scan fails and records its error, instead of leaving the Scan
`running` indefinitely. Without this bound a single stalled proxy request holds a Scan open forever, which reads as a
Scan still in progress instead of one that broke, and blocks the Topic from being scanned again. Inside that bound, the
proxy SHALL give each model in its model list that the app calls its own timeout, set above the longest call that the
model makes. A streamed reply SHALL also get a limit on its first chunk. The proxy SHALL retry a call that times out
once. The worker's own timeout SHALL exceed the longest proxy timeout run twice, so the worker never aborts a call that
the proxy is still retrying.

#### Scenario: A stalled model call fails its Scan instead of hanging it

- **WHEN** a model request through the proxy stops responding for longer than the timeout
- **THEN** the request aborts, the Scan finishes with status `failed` and its error recorded, and the Topic is not left
  with a `running` Scan

#### Scenario: A hung call is retried

- **WHEN** a scoring call hangs past the score model's timeout at the proxy
- **THEN** the proxy sends the call again once, and the Resource is scored if the second call returns

#### Scenario: A long call is not cut off

- **WHEN** the score model takes 100 seconds to score a long Resource
- **THEN** neither the proxy nor the worker aborts the call, and the Resource is scored
