## ADDED Requirements

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
