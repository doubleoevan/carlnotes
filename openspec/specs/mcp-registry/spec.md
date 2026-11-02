# mcp-registry Specification

## Purpose
Give registry clients a validated description of CarlNotes' hosted MCP server while keeping ownership verification and publication under the operator's control.

## Requirements

### Requirement: The repository describes its hosted server for registry discovery

The repository SHALL contain root `server.json` naming `com.carlnotes/carlnotes`, titled CarlNotes, with a description, explicit version, schema URL, and GitHub repository. It SHALL advertise `https://carlnotes.com/mcp` as a `streamable-http` remote. It SHALL describe the hosted service without credentials, local packages, or a Topic-specific URL.

#### Scenario: A registry client reads the manifest

- **WHEN** a client reads `server.json`
- **THEN** it finds the production remote, the `com.carlnotes` namespace, version `1.0.0`, and repository `https://github.com/doubleoevan/carlnotes`
- **AND** no placeholder, access token, client secret, or local install command appears

#### Scenario: The manifest describes the common endpoint

- **WHEN** the advertised remote is inspected
- **THEN** it contains one Streamable HTTP URL ending in `/mcp`, with no Topic identifier or deprecated SSE endpoint

### Requirement: Registry metadata passes the publisher's validator

The manifest SHALL pass `mcp-publisher validate server.json` before hand-off. Validation evidence SHALL identify the publisher version and command outcome. A local JSON parse alone SHALL NOT count as registry validation.

#### Scenario: The completed manifest validates

- **WHEN** the official publisher validates the committed candidate from the repository root
- **THEN** validation exits successfully with no errors
- **AND** any warnings are recorded and resolved or explicitly explained

#### Scenario: Validation is unavailable

- **WHEN** the publisher cannot be run
- **THEN** readiness remains unverified and the hand-off identifies the missing validation instead of claiming success

### Requirement: Validation does not publish or claim directory approval

Local checks and normal builds SHALL NOT publish the manifest, log into the registry, change DNS, submit directory forms, or create reviewer accounts. Documentation SHALL distinguish validated metadata from ownership verification and directory acceptance. Publication SHALL remain an operator action governed by the originating row's manual instructions.

#### Scenario: A maintainer checks the repository

- **WHEN** the maintainer runs its validation commands
- **THEN** no registry record or directory submission is created or updated

#### Scenario: The operator prepares a submission

- **WHEN** the operator reads the hand-off
- **THEN** it identifies domain-based verification for the `com.carlnotes` namespace as manual work
- **AND** it does not claim that GitHub authentication alone grants that namespace
