# authorization Specification

## Purpose
TBD - created by archiving change add-authz-plans-billing. Update Purpose after archive.
## Requirements
### Requirement: One gate answers every authority and entitlement check
The system SHALL route every authority check (who may act on a resource) and every entitlement check (what a plan allows) through a single `isAllowed(user, capability, resource)` gate. No `role ===` or plan/`tier ===` comparison SHALL appear outside the gate module; call sites SHALL ask the gate rather than branch on role or plan themselves.

#### Scenario: An authority decision goes through the gate
- **WHEN** a route needs to know whether a user may edit or delete a Topic, run a manual Scan, or view the admin console
- **THEN** it calls `isAllowed(user, capability, resource)` and acts on the boolean, performing no direct role or plan comparison of its own

#### Scenario: No scattered role or tier checks remain
- **WHEN** the api source is inspected for authority and entitlement logic
- **THEN** `role ===` / `plan ===` / `tier ===` comparisons exist only inside the gate module, and every other call site defers to `isAllowed`

### Requirement: Admin is platform authority that bypasses entitlement and overrides Topic authority
A user whose `role` is `admin` SHALL pass every entitlement check regardless of plan, and SHALL be the single override permitted to edit or delete any Topic regardless of `topic.owner_id`. A non-admin's authority over a Topic SHALL remain its `owner_id`, and a non-admin's entitlements SHALL come from their plan.

#### Scenario: An admin acts on a Topic they do not own
- **WHEN** `isAllowed(admin, "topic:edit", topic)` or `isAllowed(admin, "topic:delete", topic)` is asked for a Topic the admin does not own
- **THEN** the gate allows it

#### Scenario: A non-admin non-owner is refused
- **WHEN** `isAllowed(user, "topic:edit", topic)` is asked for a user who is neither the owner nor an admin
- **THEN** the gate refuses it

#### Scenario: An admin bypasses an entitlement limit
- **WHEN** an admin is at or beyond a plan limit (for example the topic cap) and asks the gate for the gated capability
- **THEN** the gate allows it regardless of the limit

### Requirement: The plans catalog is an additive, rank-ordered capability map
The plans catalog SHALL define `free`, `plus`, and `premium`, each with an integer `rank` and a capability map holding the topic limit, daily scan limit, monthly spend backstop, and price. A higher-rank plan SHALL inherit every capability of the plans below it and MAY raise a limit. These limits SHALL live as configuration, not as literals scattered through call sites.

#### Scenario: A higher tier inherits and raises limits
- **WHEN** the catalog is resolved for `premium`
- **THEN** premium's limits are at least those of `plus` and `free`, and any raised limit is read from config

#### Scenario: The gate resolves entitlements from the effective plan
- **WHEN** `isAllowed(user, capability, resource)` evaluates an entitlement for a non-admin
- **THEN** it reads the limit from the user's effective plan's capability map and answers from that value

### Requirement: Manual scans are gated by the daily scan limit, soft with a card on file

`isAllowed(user, "scan:manual", topic)` SHALL enforce the effective plan's daily scan limit, counted per user per UTC day across the user's Topics (the shared scheduled-and-manual pool). Whether that ceiling is hard or soft SHALL follow the metered-overage rule in `subscription-billing` — soft with a card on file, hard without; an admin SHALL bypass it.

A manual Scan SHALL be charged to the user who started it, not to the Topic's owner. The Scan's recorded owner, which is what the daily count and the monthly spend sum read, SHALL be the acting user, and the Scan's model calls SHALL bill that user's LiteLLM key. For an owner scanning their own Topic these are the same person. For an admin scanning a Topic they do not own, the Topic owner's daily quota and monthly budget SHALL be untouched, so an admin's Scan can never make the owner's own scheduled Scans skip for quota.

A scheduled Scan SHALL remain charged to the Topic's owner, since no user started it.

#### Scenario: A manual scan within the daily limit is allowed
- **WHEN** a non-admin owner has run fewer scans this UTC day than their plan's daily scan limit
- **THEN** the gate allows the manual Scan

#### Scenario: A manual scan at the daily limit is gated
- **WHEN** a non-admin owner has reached their plan's daily scan limit
- **THEN** the gate denies the manual Scan unless the metered-overage rule makes the ceiling soft (a card on file), while an admin is never denied

#### Scenario: An admin's scan does not draw down the owner's quota
- **WHEN** an admin runs a manual Scan on a Topic they do not own
- **THEN** the Scan is recorded against the admin, the Topic owner's remaining scans for the day are unchanged, and the owner's monthly spend does not move

#### Scenario: An owner's own scan is charged to them
- **WHEN** a Topic's owner runs a manual Scan on their own Topic
- **THEN** the Scan is recorded against that owner, exactly as before

#### Scenario: An admin's scan cannot suppress the owner's scheduled scans
- **WHEN** an admin runs manual Scans on a free-plan user's Topics and the sweep later runs
- **THEN** that user's own Topics are still scanned, because the admin's Scans never entered their daily pool

