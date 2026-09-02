## Context

Both kinds of team invitation are rows in `invites` and both accept paths end in the same function.
`acceptInvite` handles an invitation a leader or member sent to a named person, `acceptInviteToken`
handles a link, and each calls `acceptTeamInvite`. A direct invitation sets `invited_user_id`; a link
leaves it null.

`acceptTeamInvite` reads one thing to decide between a membership and a join request: the role of the
person who created the invitation being accepted. That is why an invitation a member addressed to one
person by name still waits on a leader, and why two invitations to the same person can disagree.

## Goals / Non-Goals

**Goals:**
- An invitation with a name on it admits that person, whoever sent it.
- Being addressed survives whichever invitation that person happens to accept.
- An open link a member shared still waits on a leader, since a url travels anywhere.

**Non-Goals:**
- Changing what a join request is, or how a leader activates one.
- Changing the token lifecycle. Limits, expiry, and revocation stay exactly as they are.
- Topic invitations. They have no join request to skip.

## Decisions

### An invitation has to address the accepter, and the creator's role does not matter

The check matches on `invited_user_id`, not on the creator's role. Addressing a person by name is a
deliberate act toward that one person, and the leader approval it was waiting on belongs to the case
that has no name on it. An invitation that addresses nobody is the general-purpose link a member might
paste anywhere, so it stays the path a leader approves.

That is the whole distinction: a letter with a name on it versus a url that travels. Neither depends
on who wrote it.

### An unresolved email matches only when the account verified it

`invited_user_id` resolves at creation, so an invitation sent before its recipient had an account
resolves to nobody and would never admit them. That is the ordinary flow for inviting someone new, so
the check falls back to matching `invites.email` against the account's address.

The address alone is not proof. `sendOnSignUp` sends a verification email but nothing blocks an
unverified account, so anyone could sign up as an address someone else was invited at and be admitted
as them. The fallback therefore requires `users.email_verified`. An unverified account falls through
to the join request, which is the safe answer rather than a refusal.

*Alternative considered:* match on the address without checking verification. Rejected — it admits
whoever claims the address, which is the one thing the join request exists to prevent.

*Alternative considered:* resolve `invited_user_id` at signup for any pending invitation matching the
new account's address. Better in the long run, since it puts the resolution in one place instead of at
every read. Out of scope here, and it needs the same verification check to be safe.

### Liveness reuses the refusal the other paths use

An admitting invitation counts only when `toInviteRefusal` returns nothing for it: not revoked, not
expired, uses remaining. Reusing that function is what keeps a revoked leader invitation from
admitting anyone, without a second definition of what a live invitation is drifting alongside the
first.

### Admitting consumes the addressing invitation

The invitation did its work, so it is spent instead of left standing. Someone who revokes an
invitation expects that to mean something, and an invitation that admitted someone and still shows as
pending in their list is a lie about the state of the team.

This also keeps the accepted count honest for the sender's invite limit, which is computed from
invitations sent and answered.

### Admission is one write in every case

`joinTeam` writes the membership with `onConflictDoUpdate ... set: { isActive: true }`, so a person
who already sits in the members table as a waiting join request is activated instead of duplicated.
Being admitted is therefore the same operation whether or not a request was written first: the row
either appears active, or an inactive one becomes active, and the muted Subscriptions follow.

## Risks / Trade-offs

- **Any member can now admit anyone, by addressing them.** → That is the intent. A member could
already invite whoever they liked, and the approval step only delayed it. The bound that remains is
the one that matters: an open link still waits, so a url that leaks admits nobody.
- **An unverified account cannot be admitted by email.** → It falls to the join request, which a
leader can activate. A recipient who verifies is admitted normally, and the recipient invited by
username is unaffected.
- **Two invitations are spent for one admission.** → Both were used: the link brought the person in,
the addressing invitation decided they could stay. Spending one and not the other would misreport
whichever was left.
- **The check runs on every open-link acceptance.** → One indexed read on `invites` by team and
invited user, on a path that already performs several. Not a hot path. The email fallback adds one
read of the accepter's own row, and only when the invitation carries an address.

## Open Questions

Whether signup should resolve `invited_user_id` for pending invitations at the address it registers.
That would remove the email fallback from this path entirely and fix it for every other reader of
`invited_user_id`. Not needed for this change to be correct.
