## ADDED Requirements

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
