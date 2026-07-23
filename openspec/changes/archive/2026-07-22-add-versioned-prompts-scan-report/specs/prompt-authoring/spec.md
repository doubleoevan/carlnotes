# prompt-authoring Delta

## ADDED Requirements

### Requirement: Model-facing prompts live as versioned markdown files

Every model-facing prompt in the worker SHALL live as one markdown file under `worker/prompts/` with YAML frontmatter carrying exactly `title`, `version`, `model tier`, `description`, and `updated`, followed by a `{{variable}}`-templated body. Git history is the audit trail; the `version` integer SHALL be bumped (with `updated`) only on meaningful wording changes, not formatting or variable plumbing. The initial set is `summarize-resource.md`, `summarize-topic-scan.md`, `search-topic.md`, and `attach-context.md`.

#### Scenario: A prompt file carries frontmatter and a templated body

- **WHEN** a prompt file under `worker/prompts/` is read
- **THEN** it has the five frontmatter keys and a body whose runtime inputs appear as `{{variable}}` placeholders

#### Scenario: A meaningful wording change bumps the version

- **WHEN** a prompt's wording changes in a way that can change model output
- **THEN** the frontmatter `version` is incremented and `updated` is set, while formatting-only edits leave both untouched

### Requirement: Thin loaders write prompts by stripping frontmatter and interpolating variables

Each prompt SHALL be loaded by a thin TS builder that keeps its existing exported name and call site: it reads the markdown, strips the frontmatter block and every template comment (`<!-- … -->`), and replaces each `{{variable}}` with its runtime value, returning a plain string. Writing SHALL be synchronous and SHALL NOT parse YAML at runtime. A prompt MAY contain a tier-gated span between `<!-- premium-only -->` and `<!-- /premium-only -->` markers; the builder SHALL include the span's wording only when the premium tier is addressed, and marker comments SHALL never appear in the written prompt.

#### Scenario: A written prompt contains values, not placeholders or frontmatter

- **WHEN** a builder writes its prompt with runtime values
- **THEN** the returned string contains the interpolated values and contains neither `{{` placeholders, frontmatter, nor template comments

#### Scenario: The premium-only span is gated by tier

- **WHEN** the score prompt is written for the cheap tier
- **THEN** the premium-only span is absent, and writing for the premium tier includes it

#### Scenario: Every prompt builder writes non-empty

- **WHEN** the scan smoke test runs each prompt builder with sample inputs
- **THEN** each returns a non-empty string, proving the markdown loaded and interpolated

### Requirement: New prompts follow the versioned-prompt pattern from the start

A new model-facing prompt — including one introduced by a new Source adapter — SHALL ship as a versioned markdown file under `worker/prompts/` with a thin loader, never as an inline string literal. The convention SHALL be documented as the `prompt-authoring` skill (canonical at `.agents/skills/`, symlinked from `.claude/skills/`, listed in `AGENTS.md`).

#### Scenario: A new adapter ships its prompt versioned

- **WHEN** a new Source adapter needs a model prompt
- **THEN** the prompt lands as a `worker/prompts/*.md` file with frontmatter and a thin loader, following the documented skill
