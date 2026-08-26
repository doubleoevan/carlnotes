## MODIFIED Requirements

### Requirement: One gate answers every authority and entitlement check

The system SHALL route every authority check (who may act on a resource) and every entitlement check (what a plan allows) through a single `isAllowed(user, capability, resource)` gate. No `role ===` or plan/`tier ===` comparison SHALL appear outside the gate module; call sites SHALL ask the gate instead of branching on role or plan themselves.

Topic authority SHALL be resolved inside the gate as an effective role, not a boolean from one table: owner when the Topic's `owner_id` matches, the member's strongest team role across the teams holding the Topic — the owning team and every team it is shared into, and a direct per-topic grant if one is later added. Query builders SHALL reach the same decision through query fragments the gate module exports, so a feed query and a route handler can never disagree, and no inline `owner_id` or visibility comparison SHALL survive at any call site.

An unauthorized read or write of a private or team Topic SHALL answer 404, indistinguishable from a missing id, so a hidden Topic's existence is not disclosed. The invite-visibility gate keeps its current named answer, since walking an invitee through sign-in is its purpose.

#### Scenario: An authority decision goes through the gate

- **WHEN** a route needs to know whether a user may read, edit, or delete a Topic, run a manual Scan, or view the admin console
- **THEN** it calls `isAllowed(user, capability, resource)` and acts on the answer, performing no direct role, plan, or ownership comparison of its own

#### Scenario: No scattered role or tier checks remain

- **WHEN** the api source is inspected for authority and entitlement logic
- **THEN** `role ===` / `plan ===` / `tier ===` and inline `owner_id` comparisons exist only inside the gate module and its exported fragments, and every other call site defers to them

#### Scenario: Membership grants through the gate

- **WHEN** a team member acts on a team Topic
- **THEN** the gate resolves their effective role from membership and answers each topic capability from it; team-side questions read `team_members` through the `toTeamRole` and `loadChatRoom` helpers routes consume, never inline in a route

#### Scenario: A hidden Topic does not exist

- **WHEN** a user with no grant requests a private or team Topic, or writes to one
- **THEN** the answer is 404, identical to a Topic id that matches nothing
