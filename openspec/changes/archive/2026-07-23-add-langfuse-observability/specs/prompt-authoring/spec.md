# prompt-authoring Delta

## MODIFIED Requirements

### Requirement: Thin loaders write prompts by stripping frontmatter and interpolating variables

Each prompt SHALL be served registry-first: the builder fetches the prompt's `production` version from Langfuse by name (in-memory cache, bounded fetch timeout) and SHALL fall back to the bundled markdown file when keys are absent, the fetch fails, or the fetch times out — a Scan can never fail or hang on the registry. The builder then writes the model-ready prompt from whichever text arrived: it strips the frontmatter block and every template comment (`<!-- … -->`), and replaces each `{{variable}}` with its runtime value, returning the text along with the registry prompt object when one served. Langfuse's own `compile` SHALL never be called — `writePrompt` is the sole interpolator. A prompt MAY contain a tier-gated span between `<!-- premium-tier -->` and `<!-- /premium-tier -->` markers; the builder SHALL include the span's wording only when the premium tier is addressed, and marker comments SHALL never appear in the written prompt.

#### Scenario: A written prompt contains values, not placeholders or frontmatter

- **WHEN** a builder writes its prompt with runtime values
- **THEN** the returned text contains the interpolated values and contains neither `{{` placeholders, frontmatter, nor template comments

#### Scenario: The premium-tier span is gated by tier

- **WHEN** the score prompt is written for the cheap tier
- **THEN** the premium-tier span is absent, and writing for the premium tier includes it

#### Scenario: Registry failure serves the bundled prompt

- **WHEN** Langfuse keys are absent, or the registry fetch fails or times out
- **THEN** the builder writes the prompt from the bundled markdown, byte-identical to a registry-less build, and the pipeline proceeds

#### Scenario: Every prompt builder writes non-empty

- **WHEN** the scan smoke test runs each prompt builder with sample inputs
- **THEN** each returns a non-empty prompt, proving the template loaded and interpolated

## ADDED Requirements

### Requirement: Prompts sync up to the registry and git stays canonical

A sync script SHALL push each bundled prompt's body (frontmatter stripped, premium markers kept) to Langfuse as a `production`-labeled version, carrying the frontmatter `version` and model tier in the prompt config. The sync SHALL be idempotent: a byte-identical body SHALL create no new version, and a prompt missing from the registry SHALL be created. Git is the source of truth: registry UI edits are experiments that the next sync overwrites. The sync SHALL fail loudly when Langfuse keys are missing.

#### Scenario: First sync creates the prompts

- **WHEN** the sync runs against an empty Langfuse project
- **THEN** every bundled prompt appears in the registry with the `production` label

#### Scenario: An unchanged re-run creates no versions

- **WHEN** the sync runs again with no wording changes
- **THEN** no new prompt versions are created

#### Scenario: A registry UI edit is overwritten by the next sync

- **WHEN** a prompt was edited in the Langfuse UI and the sync runs with the git body differing
- **THEN** the sync creates a new `production` version from the git body, superseding the UI edit
