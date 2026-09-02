## 1. The addressed-to read

- [x] 1.1 Add the check for whether an invitation is addressed to the accepter: their resolved account, or an email they own
- [x] 1.2 Add the lookup for a separate live invitation to one Team addressing one user, reusing `toInviteRefusal` for liveness
- [x] 1.3 Confirm the read is covered by an index on `invites` by team and invited user, adding one if not
      (`invites_team_invited_user_unique` already covers it, and makes the read return one row or none)

## 2. Admission

- [x] 2.1 In `acceptTeamInvite`, admit outright when the invitation is addressed to the accepter, whoever created it
- [x] 2.2 Admit outright when a separate live invitation addresses them, and spend that invitation when it admits
- [x] 2.3 Leave the member limit path alone: a refusal still refunds the use and answers exhausted
- [x] 2.4 Leave the open-link path alone: a member's link addressing nobody still writes the join request

## 3. Tests

The admission decision is extracted as the pure `isAutomaticInvite` so it can be tested without a
database. No api test in this repo touches the database, so the writes each decision causes are
covered by the live walkthrough in 4.2 instead of by a unit test.

- [x] 3.1 A live invitation addressing the accepter admits them
- [x] 3.2 No invitation addressing the accepter admits nobody, so an open link still writes a join request
- [x] 3.3 A revoked, expired, or spent invitation admits nobody
- [x] 3.4 The invitation being accepted never vouches for itself

## 4. Ship

- [x] 4.1 Run `bun run check`
- [ ] 4.2 Walk the flow against the running app: a member invites by username, the recipient clicks that link and lands
      active with no join request. A member's open link still lands a stranger as a join request. An email invite sent
      before signup admits its recipient once they have an account. A waiting request row activates instead of
      duplicating, and the addressing invitation is spent and gone from the recipient's list
