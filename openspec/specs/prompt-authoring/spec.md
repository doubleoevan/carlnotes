# prompt-authoring Specification

## Purpose
TBD - created by archiving change add-versioned-prompts-scan-report. Update Purpose after archive.
## Requirements
### Requirement: Model-facing prompts live as versioned markdown files

Every model-facing prompt in the worker SHALL live as one markdown file under `worker/prompts/` with YAML frontmatter carrying exactly `title`, `version`, `model tier`, `description`, and `updated`, followed by a `{{variable}}`-templated body. Git history is the audit trail; the `version` integer SHALL be bumped (with `updated`) only on meaningful wording changes, not formatting or variable plumbing. The initial set is `summarize-resource.md`, `summarize-topic-scan.md`, `search-topic.md`, and `attach-context.md`.

A template SHALL place every untrusted placeholder after its instructions, never inside the instruction region, and SHALL restate the task after its last untrusted block — the delimited text is content to evaluate, never instructions, then the task and the required output. A template SHALL NOT ask for output that a plain-text surface cannot render, such as markdown links.

#### Scenario: A prompt file carries frontmatter and a templated body

- **WHEN** a prompt file under `worker/prompts/` is read
- **THEN** it has the five frontmatter keys and a body whose runtime inputs appear as `{{variable}}` placeholders

#### Scenario: A meaningful wording change bumps the version

- **WHEN** a prompt's wording changes in a way that can change model output
- **THEN** the frontmatter `version` is incremented and `updated` is set, while formatting-only edits leave both untouched

#### Scenario: Instructions come first and are restated last

- **WHEN** a template interpolates untrusted content
- **THEN** the placeholder appears below the instructions and app-authored restatement text follows it as the body's last content

### Requirement: Thin loaders write prompts by stripping frontmatter and interpolating variables

Each prompt SHALL be served registry-first: the builder fetches the prompt's `production` version from Langfuse by name (in-memory cache, bounded fetch timeout) and SHALL fall back to the bundled markdown file when keys are absent, the fetch fails, or the fetch times out — a Scan can never fail or hang on the registry. The builder then writes the model-ready prompt from whichever text arrived: it strips the frontmatter block and every template comment (`<!-- … -->`), and replaces each `{{variable}}` with its runtime value, returning the text along with the registry prompt object when one served. Langfuse's own `compile` SHALL never be called — `writePrompt` is the sole interpolator. A prompt MAY contain a tier-gated span between `<!-- premium-tier -->` and `<!-- /premium-tier -->` markers; the builder SHALL include the span's wording only when the premium tier is addressed, and marker comments SHALL never appear in the written prompt.

Interpolation SHALL be untrusted by default. `writePrompt`'s untrusted variable map is its required argument, and trusted values SHALL be passed only through a separate, explicit map — so the call an author writes without thinking is the safe one, and every trusted value is a visible opt-out a reviewer can see. Untrusted values SHALL be wrapped in per-call nonce delimiters with the delimiter pattern and backticks stripped from the value first, as `injection-defense` requires. Untrusted inputs SHALL still be capped in the builder before writing, so a huge input cannot inflate token spend.

#### Scenario: A written prompt contains values, not placeholders or frontmatter

- **WHEN** a builder writes its prompt with runtime values
- **THEN** the returned text contains the interpolated values and contains neither `{{` placeholders, frontmatter, nor template comments

#### Scenario: Untrusted values are delimited and trusted ones are not

- **WHEN** a builder writes a prompt carrying both a fetched-content value and the scan date
- **THEN** the content renders inside per-call nonce delimiters and the date renders bare, having been passed through the explicit trusted map

#### Scenario: The premium-tier span is gated by tier

- **WHEN** the score prompt is written for the cheap tier
- **THEN** the premium-tier span is absent, and writing for the premium tier includes it

#### Scenario: Registry failure serves the bundled prompt

- **WHEN** Langfuse keys are absent, or the registry fetch fails or times out
- **THEN** the builder writes the prompt from the bundled markdown, byte-identical to a registry-less build, and the pipeline proceeds

#### Scenario: Every prompt builder writes non-empty

- **WHEN** the scan smoke test runs each prompt builder with sample inputs
- **THEN** each returns a non-empty prompt, proving the template loaded and interpolated

### Requirement: New prompts follow the versioned-prompt pattern from the start

A new model-facing prompt — including one introduced by a new Source ingester — SHALL ship as a versioned markdown file under `worker/prompts/` with a thin loader, never as an inline string literal, and SHALL pass every untrusted input through the loader's untrusted map with the task restated after it. The convention SHALL be documented as the `prompt-authoring` skill (canonical at `.agents/skills/`, symlinked from `.claude/skills/`, listed in `AGENTS.md`).

#### Scenario: A new ingester ships its prompt versioned

- **WHEN** a new Source ingester needs a model prompt
- **THEN** the prompt lands as a `worker/prompts/*.md` file with frontmatter and a thin loader, following the documented skill

#### Scenario: A new prompt's untrusted inputs are delimited by default

- **WHEN** a new prompt interpolates any source-derived or user-derived text
- **THEN** that value goes through the untrusted map, so it is nonce-delimited without the author doing anything extra

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

