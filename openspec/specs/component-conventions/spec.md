# component-conventions Specification

## Purpose
Make ordinary React feature-component modules predictable while retaining private implementation details, shared props, stable identities, and Nightshift contracts. Provide actionable reports and a bounded path to adoption.

## Requirements

### Requirement: The checker classifies files before applying conventions

The checker SHALL classify candidate feature-component files as checked, excluded with a reason, or requiring review. It SHALL exclude routes, entrypoints, stories, tests, fixtures, generated files, Nightshift contracted implementations, and explicitly designated compound UI primitives. A directory name alone SHALL NOT designate a compound primitive.

#### Scenario: Framework and generated modules retain their conventions

- **WHEN** the inventory encounters route exports, an application entrypoint, a story, a test, a test fixture, or generated source
- **THEN** it excludes that file from these conventions and identifies the exclusion reason

#### Scenario: Primitive exceptions have explicit ownership

- **WHEN** a primitive is mapped to a Nightshift contract or explicitly designated as a compound primitive with its exact path and reason
- **THEN** its existing exports and filename are exempt from feature-component conventions
- **AND** existing contract and parity checks continue to apply

#### Scenario: A folder does not create an exception

- **WHEN** an ordinary component is placed in a primitives directory without a contract mapping or explicit compound designation
- **THEN** the checker does not exempt it solely because of its directory

#### Scenario: Unsupported syntax remains visible

- **WHEN** the checker cannot classify an exported wrapper or resolve the primary component structurally
- **THEN** the inventory marks the file as requiring review with its path and reason
- **AND** strict validation cannot count that file as passing

### Requirement: One primary exported component matches its filename

An ordinary feature-component module SHALL expose one primary React component whose public name matches the filename stem. Named exports and named default exports SHALL be supported, including module-level memo and ref wrappers. Type-only exports SHALL NOT count as components or satisfy the component-name requirement. Additional public runtime helpers, hooks, and constants SHALL be reported.

#### Scenario: One named component passes

- **WHEN** `FeatureCard.tsx` exports `FeatureCard` with no other runtime exports
- **THEN** the export and filename checks pass

#### Scenario: A named default or wrapped component passes

- **WHEN** `FeatureCard.tsx` exports a named default `FeatureCard`, or a module-level `FeatureCard` wrapped with React memo or forwardRef
- **THEN** the checker recognizes one primary component named `FeatureCard`

#### Scenario: Multiple public components fail

- **WHEN** `FeatureCard.tsx` exports both `FeatureCard` and `FeatureRow`
- **THEN** the report identifies both components and the excess public component

#### Scenario: A type cannot disguise a mismatched component

- **WHEN** `FeatureCard.tsx` exports a type named `FeatureCard` and a component named `OtherCard`
- **THEN** the report identifies the component-name mismatch

#### Scenario: Unnamed exports and helper exports fail

- **WHEN** an ordinary component file exports an anonymous default component, no component, or a component alongside a runtime helper, hook, or constant
- **THEN** the report identifies the missing primary identity or extra runtime export
- **AND** comments, strings, and JSX text containing export-like text do not create false findings

### Requirement: Props naming follows ownership

A locally declared named type dedicated to a component's props SHALL use `ComponentNameProps`. Imported shared types, direct compositions of shared types, and small inline annotations SHALL be accepted without redundant aliases. Props-free components SHALL NOT require empty props types. Private supporting types and exported shared props or adapter types SHALL remain valid.

#### Scenario: A local dedicated props type has a discoverable name

- **WHEN** `FeatureCard` receives a local dedicated type named `Props` or `OtherCardProps`
- **THEN** the report names `FeatureCardProps` as the expected type name

#### Scenario: Shared and composed props pass

- **WHEN** a component consumes imported `PaginationState`, an imported props type, or a direct composition using shared types
- **THEN** it passes without renaming the shared contract or introducing an alias

#### Scenario: Supporting types remain independent

- **WHEN** a file contains a private data union, a module-level helper's options type, an exported adapter type, and a component's correctly named props
- **THEN** only the component-owned props declaration participates in the props-name rule

#### Scenario: Simple components need no extra types

- **WHEN** a component takes no props or a small inline annotation such as an optional class name
- **THEN** the checker accepts it without requiring a named props type

### Requirement: Private implementation details preserve component identity

A feature-component file SHALL permit module-level constants, small private helpers, private supporting types, and private subcomponents. Rendered subcomponents and adapter component identities SHALL remain stable across parent renders. The convention SHALL NOT require moving private implementation details into separate files or creating components during render.

#### Scenario: Private module-level support passes

- **WHEN** a primary component uses a private module-level subcomponent, constant, and helper
- **THEN** those declarations do not count as additional public components

#### Scenario: Render-time component definitions are reported

- **WHEN** a parent defines a rendered child component or memoized child inside its render function
- **THEN** the stable-identity lint rule reports the nested component

#### Scenario: Callbacks and supplied adapters remain valid

- **WHEN** a component uses an ordinary event callback, an inline render callback, or a component supplied through props
- **THEN** those forms are not rejected merely for being functions inside the component

### Requirement: Inventory is deterministic and report-only

The inventory SHALL report each candidate's classification, diagnostics with path and location, and totals for checked, excluded, requiring-review, and violating files. Results SHALL be sorted and reproducible. Convention findings SHALL return success in report mode. Invalid configuration, parse failures, and tool failures SHALL return failure. Inventory SHALL NOT rewrite source or suppress existing quality gates.

#### Scenario: Legacy findings do not block the inventory

- **WHEN** report mode scans a tree containing a valid component and a component with several runtime exports
- **THEN** it exits successfully, lists the violations, and reports accurate totals in both human-readable and JSON output

#### Scenario: A failed scan cannot look clean

- **WHEN** a parser, configuration validation, or delegated lint invocation fails
- **THEN** report mode exits nonzero and names the failure

#### Scenario: Output is reproducible

- **WHEN** two inventories inspect unchanged files
- **THEN** their sorted JSON results are identical, without timestamps or absolute machine paths

### Requirement: Strict validation is limited to adopted examples

Strict validation SHALL fail on convention violations or unresolved classifications in an explicitly selected file set. This first change SHALL enforce only its representative migration set in preflight. Legacy findings elsewhere SHALL remain report-only. Exclusion records and the adopted set SHALL reject stale paths, duplicate entries, and missing reasons where a reason is required.

#### Scenario: A migrated component regresses

- **WHEN** a migrated component adds a second exported component or a misnamed local props type
- **THEN** strict validation and preflight fail naming the path and violated convention

#### Scenario: An untouched legacy module remains visible

- **WHEN** an unmigrated component violates the convention
- **THEN** inventory reports it without making this new convention fail preflight

#### Scenario: Scope mistakes fail

- **WHEN** a designated exception or adopted path is stale, duplicated, or lacks its required reason
- **THEN** validation fails instead of silently reducing coverage

### Requirement: Fixture tests distinguish allowed and rejected forms

Automated fixtures SHALL cover passing and failing export forms, props ownership, private support, stable identities, exclusions, unsupported syntax, and report versus strict exit behavior. Tests SHALL assert diagnostic categories and locations. Built-in lint fixtures SHALL run the repository's Biome version, and structural fixtures SHALL test the uncovered relationships.

#### Scenario: The fixture suite exercises every convention

- **WHEN** the convention fixture suite runs
- **THEN** each allowed form passes and each rejected form reports the expected category and source location
- **AND** exclusion fixtures prove that test or route syntax is not mistaken for feature-component code

### Requirement: Representative migrations retain behavior and appearance

The first migration SHALL cover a web component's named props, a module with multiple runtime exports, and a shared core component with web and mobile adapters. It SHALL preserve rendered structure, classes, accessibility, interactions, state across rerenders, Nightshift contracts, and existing shared-component relationships. Direct consumers and stories SHALL use the resulting module paths.

#### Scenario: Extracting a public loading component preserves callers

- **WHEN** the loading component is extracted from the link preview card and consumers are updated
- **THEN** loading, ordinary link, and YouTube card states render and behave as before

#### Scenario: Shared thinking text retains its state

- **WHEN** the migrated ThinkingLine receives updated presentation props
- **THEN** the mounted phrase and adapter identity remain stable
- **AND** both apps still consume the same core component and retain their existing appearance

#### Scenario: Validation proves a bounded migration

- **WHEN** the implementer completes the migration
- **THEN** the adopted set passes strict checks, existing contract and parity gates pass, and before/after visual evidence shows no unintended differences
- **AND** remaining legacy violations appear in the report without being migrated in this change
