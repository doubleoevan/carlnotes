# Spec Delta

## Purpose

Keeps the mobile app able to do what the web does against the api: every api capability the web reaches is reachable
from the app or listed in a reviewed inventory with its reason, checked in preflight from each app's reachable imports.

## ADDED Requirements

### Requirement: Every api capability the web reaches is reachable from the app or listed with a reason

Preflight SHALL run a client parity check. The check SHALL fail when the web reaches an api client capability, an
exported function of an api client module, that the mobile app does not reach, unless the inventory lists that
capability with a reason or the prompt that owns it. The check SHALL name each unmatched capability and the web module
that reaches it.

#### Scenario: A new web-only capability fails preflight

- **WHEN** a web page imports a new api client function that no mobile screen reaches, and the inventory has no entry
  for it
- **THEN** the check fails and names the function and the web module that imports it

#### Scenario: A listed capability passes

- **WHEN** the web reaches a capability the inventory lists with a reason or an owning prompt
- **THEN** the check passes for that capability

#### Scenario: A capability both apps reach needs no entry

- **WHEN** both apps reach a capability, such as the Add to AI setup read
- **THEN** the check passes for it with no inventory entry

### Requirement: Reachability follows imports through shared modules

The check SHALL walk each app's modules from its route files through relative, alias, and workspace package imports,
and SHALL count a capability as reached by an app when any module the app reaches names it in an import. A direct
import from the app is not required.

#### Scenario: A shared hook carries the capability

- **WHEN** a hook in the shared core package imports an api client function and a mobile screen imports that hook
- **THEN** the mobile app reaches the capability

#### Scenario: A reached file is not a reached function

- **WHEN** a mobile screen imports one function from an api client module that exports two
- **THEN** only the imported function counts as reached by the mobile app

### Requirement: A stale inventory entry fails the check

The check SHALL fail when the inventory lists a capability the mobile app now reaches, or a capability that no api
client module exports, so a shipped feature retires its entry in the same change.

#### Scenario: A deferred capability ships

- **WHEN** a mobile screen starts reaching a capability the inventory lists as deferred
- **THEN** the check fails until the entry is removed

#### Scenario: A listed capability was renamed

- **WHEN** an api client function the inventory names no longer exists
- **THEN** the check fails and names the entry

### Requirement: The inventory is one reviewed document

The inventory SHALL be a markdown document in the mobile app's folder holding the web-only capability table the check
reads, the page and action inventory with each web-only item's reason or owning prompt, and the roles each account,
Team, and Topic action was verified with, naming every role left unverified. Each capability row SHALL carry a reason
or a prompt.

#### Scenario: An entry without a reason fails

- **WHEN** a capability row has an empty reason cell
- **THEN** the check fails and names the row

#### Scenario: The mobile-only capabilities are reported

- **WHEN** the check runs and a capability is reached by the mobile app alone
- **THEN** the check prints it as information and does not fail
