## Why

A member invites someone by username. That person clicks the link they were sent and lands as a join
request, waiting on a leader to approve the invitation a teammate just addressed to them by name.

Naming a person is a deliberate act toward that one person. Making them wait afterward treats the
invitation as a filter, when what it is for is saving everyone the round trip. The leader approval
that belongs on an open link — a url that can be pasted anywhere, to anyone — was being applied to a
letter with a name on it.

## What Changes

- **An invitation addressed to the accepter admits them, whoever sent it.** Accepting SHALL join the
accepter outright when the invitation names their account in `invited_user_id` or carries an email
address they own. A member's invitation no longer waits on a leader when it names its recipient.
- **An email invite matches someone who signed up afterward.** `invited_user_id` resolves at creation
and is never backfilled, so an invitation sent before the account existed matches by address, the way
the activity and topic paths already match an invite to a person.
- **An outstanding invitation still admits through an open link.** Accepting a link that names nobody
SHALL join the accepter outright when a separate live invitation to the same Team addresses them, so
which invitation they happened to open does not decide whether they get in.
- **An open link with nothing addressing the accepter still writes the join request.** A member's
url can travel anywhere, so it remains the one path a leader approves.
- **The addressing invitation is spent when it admits.** Being admitted through it SHALL consume it,
so it does not sit in the recipient's invitations list looking unanswered after it has done its work.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `teams`: an invitation addressed to the accepter admits them outright, and an open link admits when
a separate live invitation addresses them.
- `invitations`: an addressing invitation is consumed when it admits its recipient through another
invitation.

## Impact

- **Modified**: `api/invite/invites.ts`, where `acceptTeamInvite` decides between joining and writing
a join request, and its tests.
- **Reused**: `toInviteRefusal` for liveness, so revocation, expiry, and a spent limit behave exactly
as they do on both existing paths. `joinTeam` already activates a waiting join request row instead of
writing a second one, so admission is one write in every case.
- **Unchanged**: the member limit still refuses and refunds the use, an accepter already on the team
still spends nothing, and a link that addresses nobody still admits nobody on its own.
