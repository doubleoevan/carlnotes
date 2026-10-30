# image-capture-selection Specification

## Purpose
Decide which image captures a push to main checks. A push checks every image capture its changes can reach, and an empty
result never replaces a selection that could not be made.

## Requirements

### Requirement: A push is compared with the last commit the workflow checked green

A push run SHALL diff its commit against a base: the commit of the latest successful UI tests run on main, if that
commit is an ancestor of the pushed one. Otherwise the base SHALL be the push's previous commit, if it is a real
ancestor and not the all-zero commit. Without either, the run SHALL select everything and name the reason.

#### Scenario: A push of three commits checks all three

- **WHEN** one push brings three commits and the last green run checked the commit before them
- **THEN** the selection covers the files changed across all three commits

#### Scenario: A superseded run loses nothing

- **WHEN** a push run is cancelled because a newer push arrived
- **THEN** the newer run's base is still the last green run's commit, so the cancelled run's changes are selected again

#### Scenario: A failed run keeps its changes selected

- **WHEN** the last run on main failed on a changed image capture
- **THEN** the next push run's base is the green run before it, and the failed image capture is selected again

#### Scenario: A first run diffs against the push's previous commit

- **WHEN** no successful run exists yet, and the push's previous commit is an ancestor of the pushed one
- **THEN** the run's base is the push's previous commit

#### Scenario: A rewritten history selects everything

- **WHEN** neither the last green commit nor the push's previous commit is an ancestor of the pushed commit, or git
  cannot find either one after a force push
- **THEN** the run selects every image capture, with the reason in the summary

### Requirement: A changed file selects every image capture whose import graph reaches it

The selection SHALL walk each story file's runtime imports through relative paths, the app's `@/` alias, and workspace
package paths. A story's graph SHALL include the graph of its app's component browser preview, which wraps every story.
A story SHALL be selected if any changed file is in its graph. A changed file in the card entry's graph SHALL select
every MCP card image capture. A type-only import SHALL not count.

#### Scenario: A component change selects the stories that render it

- **WHEN** a push changes `apps/web/src/components/common/IconButton.tsx`
- **THEN** the IconButton stories and every story whose graph imports IconButton are selected, and an unrelated story
  is not

#### Scenario: A shared core change selects both apps

- **WHEN** a push changes a component in `packages/core/components/` that web and mobile stories both render
- **THEN** the web stories, the native stories, and the MCP cards that reach it are selected

#### Scenario: A component every story wraps selects everything

- **WHEN** a push changes the toast host that the web preview mounts around every story
- **THEN** every web story is selected

#### Scenario: A server-only change selects nothing

- **WHEN** a push changes only `apps/worker/` and `packages/pipeline/` files that no story or card imports
- **THEN** no image capture is selected

### Requirement: A shared input selects everything

A change to any of these SHALL select every image capture of each platform it reaches, with the reason:

- a Nightshift token source or a stylesheet written from one
- a global stylesheet
- a file in the web or mobile component browser's own folder, `apps/web/.storybook/` or `apps/mobile/.rnstorybook/`
- the dependency manifests or the lockfile, or the Bun version
- a Vite, Metro, Expo, or Tailwind config
- the capture tooling, the capture container, or the UI tests workflow

#### Scenario: A token change selects every image capture

- **WHEN** a push changes a color in `packages/nightshift/colors.ts`
- **THEN** every web, MCP, and native image capture is selected, and the summary names the token source as the reason

#### Scenario: A lockfile change selects every image capture

- **WHEN** a push changes only `bun.lock`
- **THEN** every image capture is selected

### Requirement: A file a build config or the capture tooling imports belongs to it

A change to a file that a Vite, Metro, or Expo config imports, or that the capture tooling imports, SHALL select every
image capture that config or the tooling selects, with the reason.

#### Scenario: A plugin the Vite config loads selects every web image capture

- **WHEN** a push changes only a plugin that `apps/web/vite.config.ts` imports
- **THEN** every web and MCP image capture is selected, and the summary names the plugin and the config

### Requirement: An uncertain mapping selects everything

The selection SHALL select every image capture, and name what it could not place, if any of these happens:

- an in-repo import does not resolve to a file
- a story file cannot be parsed
- the diff or the story index cannot be read
- a changed file's effect on the image captures cannot be placed

It SHALL never return an empty selection because of an error.

#### Scenario: An unresolved import selects everything

- **WHEN** a story imports an `@/` path that resolves to no file
- **THEN** the run selects every image capture and the summary names the import

#### Scenario: A failed diff selects everything

- **WHEN** git cannot diff the base and the pushed commit
- **THEN** the run selects every image capture instead of none

#### Scenario: A failure while selecting selects everything

- **WHEN** a git command the selection runs fails, or reading the import graph throws
- **THEN** the run selects every image capture, and the summary names the failure

### Requirement: An approved baseline change selects its own image capture

A push that adds, changes, or removes a baseline image SHALL select that image's story while the story exists, so the
run shows whether the approved image matches the code. A baseline removed along with its story SHALL select nothing.

#### Scenario: An approval is checked by the next run

- **WHEN** a push commits the approved Button baselines with no other change
- **THEN** the Button image captures are selected and marked passed

#### Scenario: A deleted baseline of a removed story selects nothing

- **WHEN** a push deletes the baselines of a story that no longer exists
- **THEN** no image capture is selected for it, and the web job does not fail on a missing story

### Requirement: A selection of nothing says so and captures nothing

A run SHALL select nothing only if the diff was read and no changed file reached an image capture. The capture jobs
SHALL then be skipped, never reported as passed. The summary SHALL say that no image capture was selected and list the
changed files.

#### Scenario: A docs-only push skips the capture jobs

- **WHEN** a push changes only `apps/docs/` content that no story imports
- **THEN** the capture jobs show as skipped, and the summary says no image capture was selected and why

### Requirement: Nightly and dispatched runs select everything

A scheduled run SHALL select every image capture, whatever changed. A dispatched run SHALL select every image capture
unless it asks for affected image captures. Affected image captures on a ref other than main SHALL be diffed against
that ref's merge base with main.

#### Scenario: The nightly run checks every story

- **WHEN** the nightly run starts after a day with no pushes
- **THEN** it captures every web story, MCP card state, and native story

### Requirement: The selection is recorded

Each run SHALL record its selection as JSON: the base and head commits, the mode (`all`, `affected`, or `none`), each
reason, the changed files, and the selected story ids per platform. The run's summary SHALL show the mode, the
reasons, and the selected count out of the total per platform.

#### Scenario: The summary explains a push's selection

- **WHEN** a push selects 12 of 456 web stories
- **THEN** the summary shows 12 of 456, the base commit, and the changed files that selected them
