# eval-harness Specification

## Purpose
TBD - created by archiving change harden-launch-readiness. Update Purpose after archive.
## Requirements
### Requirement: A script measures pipeline precision, recall, and cost per topic on a labeled corpus

A bun script SHALL run the real curation path — embedding, the relevance gate, dedupe, and tiered scoring — against a checked-in corpus of about 50 labeled items per topic, and report precision, recall, and cost per topic. The corpus SHALL be fixtures rather than live ingestion, so labels stay stable and runs stay comparable. The script SHALL be a package.json script and SHALL NOT be part of the test suite or the push gate, since it spends money.

#### Scenario: The harness reports the three numbers per topic

- **WHEN** the eval script runs against the labeled corpus
- **THEN** it prints precision, recall, and dollar cost for each topic fixture, computed from the pipeline's own kept-versus-labeled outcome and the Scan Budget's recorded spend

#### Scenario: Labels come from fixtures, not a live search

- **WHEN** the harness runs twice without the corpus changing
- **THEN** both runs score the same items, because no ingester fetches live results

### Requirement: The corpus measures the scanner in both directions

Because Topics here are full of AI content, the corpus SHALL include a set of articles that discuss prompt injection in benign prose, and the harness SHALL report the scanner's false-positive rate over that set. The corpus SHALL also include a set of known injection payloads, and the harness SHALL report the scanner's catch rate over that set. The scanner's configured threshold SHALL be set from those measured rates rather than from the scanner's shipped default.

Both rates SHALL be reported together, because either alone can be satisfied by a broken scanner: one that flags nothing scores a perfect false-positive rate, and one that flags everything scores a perfect catch rate. A single rate cannot distinguish a working scanner from a failed-open one.

#### Scenario: Benign injection prose is measured, not assumed

- **WHEN** the harness runs the benign-injection set through the scanner
- **THEN** it reports the fraction flagged, and that number is what the configured threshold is chosen against

#### Scenario: A scanner that catches nothing cannot score well

- **WHEN** the scanner flags none of the known attack payloads
- **THEN** the harness reports a catch rate of zero alongside its false-positive rate, so the failure is visible rather than reading as a clean result

### Requirement: The measured numbers are published in the README

The README SHALL carry the harness's precision, recall, cost-per-topic, and both scanner rates, so the published claims about the pipeline are measured rather than asserted.

#### Scenario: The README states measured numbers

- **WHEN** the eval harness has been run for the launch corpus
- **THEN** the README reports its precision, recall, cost per topic, and scanner false-positive rate

### Requirement: promptfoo cases test the podcast episode script writer

The repo SHALL include promptfoo cases for the podcast episode script prompts under `evals/`, run by one package script
through the local LiteLLM proxy. The cases SHALL assert that every chapter cites a Finding id from the input, that the
script says nothing that the input Findings and their stored content do not support, that a chapter paraphrases its
source and has at most three short quotations of it with the source named, that the title and the description are
specific to the chapters and within their length limits, that the whole script runs 30 minutes or less, and that a thin
input yields a short script instead of a padded one. A chapter's length is a goal, and no case SHALL grade it. The cases
cost real model spend, so they SHALL NOT run as part of `bun test`.

#### Scenario: A chapter that cites an unknown Finding fails the case

- **WHEN** the script writer returns a chapter whose Finding id is not in the input
- **THEN** the case fails

#### Scenario: A chapter that copies its source fails the case

- **GIVEN** an input Finding whose stored content has five quotable sentences
- **WHEN** the script writer returns a chapter that quotes four passages of it, or quotes one without naming the source
- **THEN** the case fails

#### Scenario: A thin input yields a short script

- **WHEN** the input has two Findings
- **THEN** the script has two chapters and runs under seven minutes

#### Scenario: The cases are not part of the test suite

- **WHEN** `bun test` runs
- **THEN** no promptfoo case runs and no model is called

