## Context

`isAllowed` is the one gate, and the admin override lives inside it: an admin is answered yes before any per-capability rule runs. `canSeeTopic` is the visibility rule underneath, and it knows nothing about roles — an admin with no invite fails it like anyone else.

`setTopicSubscription` calls `canSeeTopic` directly rather than going through the gate. The topic page authorizes through the gate, so an admin opens an invite Topic, sees the Follow control, presses it, and gets a 403 from a write that asked a different question than the page did.

## Goals / Non-Goals

**Goals:**
- An admin can put any invite Topic into their own feed.
- The write and the page agree about who may act.

**Non-Goals:**
- Subscribing anyone else. An admin acts only on their own subscription row, exactly as every other user does.
- Any new read access. An admin can already read every Topic; this changes whose feed it appears in.
- Changing what a subscription is worth. Counts, emails, and the activation-forward Findings rule are untouched.

## Decisions

### Ask the gate, do not special-case the admin

The fix is to call `isAllowed(userId, "topic:view", topic)` where `canSeeTopic` is called now. Adding an `isAdmin` branch to `setTopicSubscription`, or teaching `canSeeTopic` about roles, would both put the override in a second place and leave the two able to disagree. The gate already holds it.

The guards above the check stay as they are and keep doing the work the override must not undo: a private Topic is rejected on its visibility, and a Topic the caller owns is rejected on ownership. Neither reads the role, so neither weakens when the visibility check does.

### An admin subscription is an ordinary subscription

It counts toward the Topic's subscriber count, the same as anyone's. Excluding it would mean teaching the count about roles, and the count is recomputed from the rows rather than nudged, so a role-aware exclusion would have to live in the recount query and in every place that reads it. An admin following a Topic is a subscriber; the number stays a count of rows.

## Risks / Trade-offs

- **An owner sees a subscriber they did not invite.** → True, and visible in their count. An admin already has full read access to the Topic, so the subscription reveals a reading that was always permitted rather than granting a new one.
- **The override now reaches a write, not just a read.** → The write it reaches only ever creates the caller's own row. The rules that protect somebody else's data — a private Topic, another user's subscription — are enforced above the gate call and do not consult the role.
