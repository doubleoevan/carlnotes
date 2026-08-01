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

