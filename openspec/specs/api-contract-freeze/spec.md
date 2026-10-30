# api-contract-freeze Specification

## Purpose
Freezes the request and response shapes an app version was built against as standalone JSON Schema, and fails
preflight on any api change an installed build of that version could not read or send.

## Requirements

### Requirement: A freeze writes the app's reachable contract as standalone JSON Schema

`bun run contract:freeze` SHALL write `contracts/<app-version>.json` holding, for every api capability the app
reaches through its own imports and the shared packages, the route, the method, and the request and response schemas
as JSON Schema generated from the contract schemas. The file SHALL hold no TypeScript import and SHALL not change
when a current schema changes. The freeze SHALL fail when a reached capability has no registry entry.

#### Scenario: A freeze covers a shared reach

- **WHEN** a mobile screen reaches an api capability only through a hook in the shared core package
- **THEN** the snapshot includes that capability's route, method, and schemas

#### Scenario: A current schema changes after the freeze

- **WHEN** a response schema gains a field after the snapshot was written
- **THEN** the snapshot file is unchanged until the next freeze

#### Scenario: A reached capability is unregistered

- **WHEN** the app reaches a client function with no registry entry
- **THEN** the freeze fails and names the function

### Requirement: Submitted and released versions are declared and each has a snapshot

A release file SHALL name each app version that was submitted or released, its status, its platforms, and its date.
Preflight SHALL fail when a declared version that is not retired has no snapshot. A version that is not declared,
such as a development version, needs none.

#### Scenario: A submitted version lacks its snapshot

- **WHEN** the release file names 1.2.0 as submitted and `contracts/1.2.0.json` is missing
- **THEN** preflight fails and names the version

#### Scenario: A development version needs no snapshot

- **WHEN** the app's version is 1.3.0 and the release file does not name it
- **THEN** preflight passes with no snapshot for it

### Requirement: A response stays readable by every live snapshot

For every snapshot of an unretired version, preflight SHALL fail when a current response schema drops a property the
snapshot requires, changes a property to a type the snapshot does not accept, or adds a value to an enum the snapshot
froze. A new property, optional or required, SHALL pass. Tolerant display handling in the app is not permission to
extend a frozen enum.

#### Scenario: A required field is removed

- **WHEN** a frozen response required `name` and the current schema has no `name`
- **THEN** preflight fails and names the capability and the path

#### Scenario: A type is changed

- **WHEN** a frozen response's `count` was a number and is now a string
- **THEN** preflight fails

#### Scenario: A frozen enum is extended

- **WHEN** a frozen response enum has three values and the current schema has four
- **THEN** preflight fails even though the app maps an unknown value to its unknown case

#### Scenario: A compatible field is added

- **WHEN** the current response schema adds a property the snapshot did not have
- **THEN** preflight passes

### Requirement: A request accepted by a live snapshot stays accepted

For every snapshot of an unretired version, preflight SHALL fail when a current request schema adds a required
field, narrows a type, or removes an enum value the snapshot accepted. A new optional field, a widened type, or a new
enum value SHALL pass.

#### Scenario: A required parameter is added

- **WHEN** a request body gains a required field the snapshot did not have
- **THEN** preflight fails

#### Scenario: A request is loosened

- **WHEN** a request field becomes optional or an enum gains a value
- **THEN** preflight passes

### Requirement: In-process compatibility tests validate live responses against the frozen schemas

The test suite SHALL call each registered route that has a fixture in-process, with no server and no network, sending
the frozen request example over the existing stubs, and SHALL validate the response against the frozen response
schema with a JSON Schema validator. A route without a fixture SHALL be named by the registry test.

#### Scenario: A route drifts in a way the schema does not show

- **WHEN** a route starts returning a field as a string where the frozen schema says number
- **THEN** the compatibility test for that route fails and names the capability

#### Scenario: An old request shape still works

- **WHEN** the frozen request example for a route is sent to the current route
- **THEN** the route accepts it and the response validates

### Requirement: A snapshot is retired only once its traffic has drained

A snapshot SHALL be removed only when its version is marked retired in the release file, the platform minimums are
above it, and the version's request traffic has drained in analytics. The release path documentation SHALL state the
steps. The submit path SHALL stop before submitting a version whose snapshot is missing or differs from a fresh freeze.

#### Scenario: Submitting without a fresh freeze

- **WHEN** the submit script runs and the current schemas differ from `contracts/<app-version>.json`
- **THEN** the submit stops and names the freeze

#### Scenario: Retiring a version

- **WHEN** a version is marked retired and both minimums are above it
- **THEN** its snapshot may be deleted and preflight no longer checks against it
