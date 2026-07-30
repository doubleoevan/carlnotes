## Context

A subscription is a `subscriptions` row whose subscriber is either a user or an audience, enforced by a database check constraint. An invite is a `topic_invites` row keyed by Topic and **email**, so a Topic can be shared before the invitee has an account. Accepting an invite inserts or reactivates the subscription; the invite row stays.

`canSeeTopic` grants access to an invite Topic when the caller is invited **or** holds an active subscription. The feed's subscribed section is stricter: it requires an active subscription, direct or through an audience.

## Goals / Non-Goals

**Goals:**
- A reader can tell whose Topic a row is about.
- A control that cannot act does not look like one that can.
- Delete means the user is out: no access, no reappearing row.
- Each table's columns describe every row in it.

**Non-Goals:**
- Managing audiences. The user cannot join or leave one from here, and this change does not add that.
- Surfacing `subscriptions.frequency`. The digest cadence stays where it is, unexposed.
- Changing who may see a Topic. Only the invite that Delete leaves behind changes.

## Decisions

### Two tables, not one with a discriminator

The single table forced `subscribedAt`, `isActive`, and `isEmailEnabled` to be absent on invite rows, which the payload modelled as a union and the table paid for with a placeholder-cell branch per row. Splitting lets each table's header describe every row under it.

The payload splits the same way: `subscriptions` and `invites`, each a flat row type. Dropping the `kind` field is what removes the branch from the component rather than moving it.

### An audience-held subscription is read-only, not hidden

Excluding these rows would hide a Topic the user actually receives in their feed, with nothing on the page explaining where it came from. So the row renders, its switches are disabled, its Delete is absent, and the Owner cell names the audience that granted it.

This is the honest rendering of what the server already enforces: `setTopicSubscription`, `setSubscriptionEmailEnabled`, and `deleteTopicSubscription` all scope to `subscriber_user_id = <caller>`, which no audience-held row satisfies. Before this change those three writes silently affected zero rows and still answered `{ok: true}`.

A user subscribed both directly and through an audience keeps their controls: the dedupe prefers the direct row, since that is the one they can act on.

### Delete removes the invite too

On an invite Topic, deleting only the subscription leaves `topic_invites` intact, so `isInvited` keeps granting access and the Topic returns to the page as a pending invite — an unsubscribe that neither revokes nor forgets. Delete now removes both, so access ends and the row does not come back. Re-entry requires a fresh invite from the owner, which matches what "delete for good" already promises in the confirmation dialog.

This needs the caller's email, since invites are keyed by email rather than user id. The route already reads the session user for `respondToInvite`, so it passes the same email here.

Deactivating is untouched. Active off still only flips `is_active`, and the invite stays, which is what makes it reactivatable.

### The owner is a join, not a denormalized column

Both queries already join `topics`; the owner name is one more join to `users`. Storing it on the Topic would duplicate a mutable field for a page that reads it twice.

## Risks / Trade-offs

- **Delete is now irreversible on an invite Topic.** The user cannot re-accept; the owner must re-invite. That is the point, but it is a real reduction in what Delete leaves recoverable, and the dialog copy has to carry it.
- **The payload change is breaking.** `ActivityResponse.subscriptions` loses its `kind` field and gains siblings. Only the Activity page reads it, and the typed client makes a missed call site a compile error rather than a runtime one.
- **A read-only row still shows switch positions the user cannot change.** Showing the audience's actual settings is more informative than blanking them, but a reader could misread a disabled "on" as their own preference. The Owner cell naming the audience is what disambiguates it.
