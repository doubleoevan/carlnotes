## ADDED Requirements

### Requirement: A connected AI app can stop a running Scan

`stop_scan` SHALL stop a Topic's running Scan through the same path as the topic page's stop control, under the same
authority and with the same outcome: what it kept stays, what it spent stays charged, and its daily scan returns. A stop
with nothing running SHALL say so and SHALL NOT be an error.

#### Scenario: The owner stops a Scan over MCP

- **WHEN** the Topic's owner calls `stop_scan` while a Scan runs
- **THEN** the Scan's workflow is cancelled, the result says it stopped, and no report or Podcast Episode follows

#### Scenario: Stopping with nothing running

- **WHEN** `stop_scan` arrives for a Topic whose Scan already finished
- **THEN** the result says nothing was running

#### Scenario: A caller without authority

- **WHEN** a caller who is neither the owner nor an admin calls `stop_scan`
- **THEN** the result says only the owner or an admin may stop it, and the Scan keeps running

#### Scenario: A visitor calls the tool

- **WHEN** an unconnected client calls `stop_scan`
- **THEN** the result says an account is needed and nothing stops

#### Scenario: The workflow cannot be reached

- **WHEN** the cancel call fails
- **THEN** the result says the stop did not go through, and the failure is reported
