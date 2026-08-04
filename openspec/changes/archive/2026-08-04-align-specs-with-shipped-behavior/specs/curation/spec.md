## MODIFIED Requirements

### Requirement: Embed-filter gates paid stages on topic-context relevance

Curation SHALL embed the topic's effective context (`topicScanContext` — the topic's own `context` merged with its attachments' `context`) and drop, as filtered, any Resource whose cosine similarity to that context embedding is below the relevance threshold for that Resource's kind. The threshold SHALL be held per kind rather than shared across all of them: a `watch` or `listen` Resource is described by a short blurb where a `read` Resource carries its whole body, so the same similarity means something different for each, and one shared bar drops media for the length of its description rather than for its relevance. Every kind's threshold SHALL be defined, so no kind falls back to an unstated default. This gate SHALL run before either paid stage (Firecrawl fetch, LLM scoring), so a Resource that fails it incurs no fetch or scoring spend — only the cheap embedding the gate itself required. When the topic's effective context is empty, the filter SHALL fall back to embedding the topic `name`, mirroring the search ingester.

#### Scenario: A below-threshold Resource is filtered before any paid stage

- **WHEN** a Resource's similarity to the topic-context embedding is below its kind's relevance threshold
- **THEN** it is dropped as filtered and no Firecrawl fetch or scoring call is made for it (its embedding already ran, for the gate)

#### Scenario: An above-threshold Resource proceeds to fetch and scoring

- **WHEN** a Resource's similarity to the topic-context embedding is at or above its kind's threshold
- **THEN** it proceeds to the fetch stage

#### Scenario: A video is judged against the bar for its own kind

- **WHEN** a `watch` Resource scores below the `read` threshold but at or above the `watch` threshold
- **THEN** it survives the gate and proceeds to fetch and scoring, rather than being dropped for carrying a description instead of an article

#### Scenario: Empty effective context falls back to the topic name

- **WHEN** the topic's effective context is empty
- **THEN** the embed-filter compares against the embedding of the topic `name` rather than an empty context

#### Scenario: The ceiling defers embedding rather than charging past it

- **WHEN** the Scan's spend ceiling is already reached and further candidates remain unembedded
- **THEN** those candidates are counted as deferred, no embedding call is made or charged for them, and they stay eligible for a later Scan
