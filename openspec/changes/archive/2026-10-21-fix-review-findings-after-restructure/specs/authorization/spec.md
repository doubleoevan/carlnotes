## MODIFIED Requirements

### Requirement: One gate answers every authority and entitlement check

The system SHALL route every authority check (who may act on a resource) and every entitlement check (what a plan
allows) through a single `isAllowed(user, capability, resource)` gate. A role or plan read that is not a gate decision,
such as which controls a page renders or which rows a footer counts, SHALL go through the helpers beside the gate:
`isAdminRole`, `isLeaderRole`, `isPaidPlan`, and `isPremiumPlan` in `packages/contracts/enums.ts`, which the api's gate
module re-exports. No `===` or `!==` comparison on a role, plan, or tier value SHALL appear outside those two modules,
in the api or the web app; call sites SHALL ask the gate or a helper instead of branching on role or plan themselves.
A test SHALL enforce it over `apps/api` and `apps/web/src`, matching `===` and `!==` against any name ending in `role`,
`plan`, or `tier` whatever its case, and a role or plan literal compared with anything, skipping only the gate module,
the dev seed script, and a smoke section whose comparisons are assertions. The helpers' own comparisons sit in
`packages/contracts/enums.ts`, outside the scanned folders.

Topic authority SHALL be resolved inside the gate as an effective role, not a boolean from one table: owner when the
Topic's `owner_id` matches, the member's strongest team role across the teams holding the Topic — the owning team and
every team it is shared into, and a direct per-topic grant if one is later added. Query builders SHALL reach the same
decision through query fragments the gate module exports, so a feed query and a route handler can never disagree, and
no inline `owner_id` or visibility comparison SHALL survive at any call site.

An unauthorized read or write of a private or team Topic SHALL answer 404, indistinguishable from a missing id, so a
hidden Topic's existence is not disclosed. The other private reads SHALL answer the same way: a non-admin's request for
another user's activity, and a kept chat attachment the user does not own, answer 404. The invite-visibility gate keeps
its named 403 answer for an invite Topic's page alone, since walking an invitee through sign-in is its purpose; a
private or team Topic's page answers 404.

#### Scenario: An authority decision goes through the gate

- **WHEN** a route needs to know whether a user may read, edit, or delete a Topic, run a manual Scan, or view the admin
  console
- **THEN** it calls `isAllowed(user, capability, resource)` and acts on the answer, performing no direct role, plan, or
  ownership comparison of its own

#### Scenario: No scattered role or tier checks remain

- **WHEN** the api and web app sources are inspected for authority and entitlement logic
- **THEN** `===` and `!==` comparisons on a role, plan, or tier name, `teamRole`, `previousPlan`, and `.plan` included,
  exist only inside the gate module and the enums helpers, inline `owner_id` comparisons only inside the gate module
  and its exported fragments, and every other call site defers to them

#### Scenario: Membership grants through the gate

- **WHEN** a team member acts on a team Topic
- **THEN** the gate resolves their effective role from membership and answers each topic capability from it; team-side
  questions read `team_members` through the `toTeamRole` and `loadChatRoom` helpers routes consume, never inline in a
  route

#### Scenario: A hidden Topic does not exist

- **WHEN** a user with no grant requests a private or team Topic, or writes to one
- **THEN** the answer is 404, identical to a Topic id that matches nothing

#### Scenario: The web app reads roles and plans through the helpers

- **WHEN** a page decides whether to show a leader's or an admin's control, or a paid or premium plan's feature
- **THEN** it calls `isLeaderRole`, `isAdminRole`, `isPaidPlan`, or `isPremiumPlan`, and a footer that counts leaders
  filters with the same helper

#### Scenario: Another user's activity does not exist for a non-admin

- **WHEN** a signed-in user without the admin console capability requests the activity of another user id
- **THEN** the answer is 404, identical to a user id that matches nothing

#### Scenario: Someone else's kept attachment does not exist

- **WHEN** a user deletes a kept chat attachment by an id they do not own
- **THEN** the answer is 404, identical to an attachment id that matches nothing

#### Scenario: An invite Topic's gate still names itself

- **WHEN** a user who may not view an invite Topic requests its page
- **THEN** the answer is 403 with the gate naming the Topic, while the same request for a private or team Topic
  answers 404
