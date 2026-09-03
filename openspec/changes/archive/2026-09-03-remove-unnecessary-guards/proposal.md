## Why

A guard audit judged every limit, expiry, gate, and friction point against one bar: does it defend
something real? Five guards defend nothing, and a dozen more defend something real in a shape that
hurts legitimate users — most of them by lying or dead-ending when they trip. The invite path is the
worst offender, and it sits directly on the referral funnel.

## What Changes

- Invite acceptance loses its bot check: signup already has the one bot gate that matters, and the
  route rejects any session-less caller anyway.
- A link's use limit becomes a plan attribute, and containment applies only where it contains
  anything: a link to a currently-public Topic is accepted past its expiry and use count, since the
  Follow button already grants the same.
- No referred visitor dead-ends: an expired or exhausted team link becomes a join request, a full
  team is named as full instead of "used up", and an exhausted private-topic link tells the visitor
  to ask for a fresh one.
- Creating a link returns the target's live link instead of inserting a duplicate and spending a
  daily-quota slot per click.
- Deleting a led team never blocks and never strands members: an empty team deletes, a populated one
  hands leadership to its oldest member and the leader leaves.
- The profile table and preview counts show every public topic, not just those with 3 findings.
- A batch of honest-failure fixes: limits name themselves and their recovery path when they trip,
  silent clips gain markers or toasts, and mis-sized constants are resized.

## Impact

- Affected specs: invite-links, invitations, teams, public-profiles
- Affected code: api/invite/, api/team/, api/profiles.ts, api/share/preview.ts, api/auth.ts,
  api/chat/, shared/plans.ts, shared/contracts.ts, worker/attach.ts, ui invite/team/chat/share/note
  components
