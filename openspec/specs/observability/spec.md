# observability Specification

## Purpose
TBD - created by archiving change add-langfuse-observability. Update Purpose after archive.
## Requirements
### Requirement: Model calls are traced to Langfuse and grouped per Scan

When Langfuse keys are configured, every worker model call (generations and embeddings) SHALL emit an OpenTelemetry span exported to Langfuse, and all calls made while a Scan runs SHALL group under a single trace named `topic-scan` carrying the `topicId` and `scanId` as metadata. Generations SHALL link the registry prompt version that produced them when one served the prompt.

#### Scenario: A scan produces one grouped trace

- **WHEN** `runTopicScan` completes with Langfuse keys configured
- **THEN** Langfuse shows one `topic-scan` trace for that Scan with the scoring, report, and embedding calls nested inside it, carrying real token usage

#### Scenario: A registry-served generation links its prompt version

- **WHEN** a traced generation used a prompt served from the registry
- **THEN** its trace links the Langfuse prompt version that served it

### Requirement: Telemetry is zero-config and can never break the pipeline

Telemetry SHALL activate only when both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are set; without them the worker SHALL behave byte-identically to an untraced build. Telemetry failures (start, export, flush) SHALL never fail a Scan, a smoke run, or any pipeline operation.

#### Scenario: No keys means no behavior change

- **WHEN** the worker runs without Langfuse keys
- **THEN** no telemetry starts, no network calls go to Langfuse, and all pipeline outputs are unchanged

#### Scenario: A flush failure does not flip a passing run

- **WHEN** the telemetry flush at process end fails
- **THEN** the process still exits with the outcome the run earned

### Requirement: Spans are flushed before short-lived processes exit

Because the worker runs as short-lived processes, telemetry SHALL be flushed before `process.exit` on both success and failure paths of every entry point that makes model calls (the scan, attach, and search smokes today).

#### Scenario: A smoke run's spans survive its exit

- **WHEN** a smoke run finishes, passing or failing, with keys configured
- **THEN** its spans are flushed to Langfuse before the process exits

### Requirement: Every pipeline stage is a span on the Scan's trace, carrying its cost

Each pipeline stage — ingest, embed-filter, dedupe, scoring, and scan-report — SHALL emit its own span nested under the Scan's existing `topic-scan` trace, carrying that stage's dollar cost for this Scan and the counts it decided. A stage's cost SHALL be reported as that stage's own spend, not the Scan's running total. Model-call spans SHALL nest inside their stage's span rather than directly under the trace.

Token usage SHALL NOT be tallied a second time on the stage span: it is already carried by the model-call spans the stage nests, which the tracing backend rolls up. A stage that makes no model call therefore reports cost and counts and no usage, rather than zeroed usage.

The spans SHALL be emitted by the processes that run real Scans, not only by the smoke scripts.

#### Scenario: One Scan shows a span per stage

- **WHEN** a Scan runs with Langfuse keys configured
- **THEN** its `topic-scan` trace shows a span for ingest, embed-filter, dedupe, scoring, and scan-report, each carrying that stage's cost, with the model-call spans nested inside the stages that made them

#### Scenario: A scheduled Scan is traced, not only a smoke run

- **WHEN** the scheduled sweep runs a Scan with Langfuse keys configured
- **THEN** telemetry is started by that process and the Scan's spans are flushed before it exits

#### Scenario: A stage's cost reads as its own

- **WHEN** two paid stages run in the same Scan
- **THEN** each span reports the spend attributable to that stage, and the sum matches the Scan's recorded per-stage breakdown

#### Scenario: A free stage reports no token usage

- **WHEN** the dedupe stage's span is emitted
- **THEN** it carries its counts and zero cost without fabricated token usage

### Requirement: Model calls reach Langfuse beside Sentry

Every model call the api or the worker makes SHALL reach Langfuse when its keys are set, whether or not Sentry is running in the same process, and whatever Sentry samples. Langfuse SHALL record every model call, including one made inside a request Sentry did not sample. Langfuse's spans SHALL NOT be sent to Sentry, Sentry SHALL NOT record model calls of its own, and a Sentry span SHALL NOT be parented to a span Sentry never records. Without Sentry, Langfuse SHALL trace as it did, with a Scan's stages and model calls nested in one trace. The api and the worker SHALL start Sentry before Langfuse, so each process makes the same choice.

#### Scenario: A chat reply in the api reaches Langfuse

- **WHEN** a signed-in user asks Carl a question in production, where Sentry and Langfuse are both running
- **THEN** the reply's model calls appear in Langfuse with their usage and cost, and they do not appear as spans in Sentry

#### Scenario: An unsampled request's model calls are still recorded

- **WHEN** Sentry's sampler leaves a chat request untraced
- **THEN** Langfuse still records every model call the request made

#### Scenario: A Scan still traces as one trace

- **WHEN** a Scan runs in the worker with Sentry running
- **THEN** Langfuse shows one trace for the Scan, with each stage's span and its model calls nested under it

#### Scenario: Without Sentry nothing changes

- **WHEN** Langfuse's keys are set and Sentry's are not, as in dev
- **THEN** model calls and Scan stages reach Langfuse exactly as before

### Requirement: A Podcast Episode render is traced with its cost, duration, and retries

Every published Podcast Episode's render SHALL be one trace in the existing telemetry, named for the render and grouped
by its Topic and its Scan. The trace SHALL record how long the render took, how many attempts each chapter needed, the
speech tier it used, the cost, and the cost per minute of audio. A render that fails SHALL record its failure reason on
the Podcast Episode, and SHALL be reported to Sentry under an `episode` stage with the Scan, the Topic, and the reason.
A render that is skipped SHALL log which check skipped it. Telemetry SHALL stay optional, and a render with no
telemetry keys runs the same.

#### Scenario: A published Podcast Episode's trace shows its cost per minute

- **WHEN** a Podcast Episode publishes
- **THEN** its trace records the render's duration, each chapter's attempt count, the tier, the cost, and the cost per
  audio minute

#### Scenario: A failed render is reported

- **WHEN** no chapter renders, or a script call fails for good
- **THEN** the Podcast Episode is saved as failed with the reason, and Sentry receives a report under the `episode`
  stage naming the Scan and the Topic

#### Scenario: A left-out chapter is reported

- **WHEN** a chapter is left out
- **THEN** the Podcast Episode publishes, and Sentry receives a report under the `episode` stage naming the Podcast
  Episode, the Topic, the Scan, and how many chapters were left out

#### Scenario: A skipped render says why

- **WHEN** the budget check skips a render
- **THEN** the worker's log names the Scan and the budget check, and no Podcast Episode row is written

