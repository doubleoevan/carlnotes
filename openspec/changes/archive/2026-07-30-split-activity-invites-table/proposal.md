## Why

The Activity page packs two different things into one table. A subscription is a standing relationship the user manages; a pending invite is a question waiting on a yes or no. Sharing a table forces every subscription column to render a placeholder on invite rows, and forces the invite's approve/deny into the slot where the switches live.

Two defects sit in the same table, both found while reading the schema for this change:

The table shows no Topic owner, so a reader has no way to tell whose Topic they subscribed to.

An audience-held subscription renders with working-looking Active, Emails, and Delete controls that do nothing. `loadActivity` ORs the direct and audience paths then dedupes by topic id, discarding which path granted the subscription, while all three writes are scoped to `subscriber_user_id = <caller>`. For an audience-held row that matches no row: zero rows are written, the route answers `{ok: true}`, and the reload shows the control snapped back.

Deleting a subscription on an invite Topic is also not the unsubscribe it claims to be. It removes the `subscriptions` row but leaves `topic_invites`, so `canSeeTopic` still grants access through the invite and the Topic returns to the page as a pending invite.

## What Changes

- Split the one accordion into two: "Your subscriptions" for real subscriptions, "Your invites" for pending invites. Each renders only when non-empty.
- Add an Owner column to both tables.
- Render an audience-held subscription read-only, naming the audience that granted it, so a control that cannot act is visibly inert rather than silently ignored.
- Make Delete a true unsubscribe on an invite Topic: it removes the invite alongside the subscription, so access ends and the Topic does not return as pending.
- Split the Activity payload's single `subscriptions` array into `subscriptions` and `invites`, dropping the `kind` discriminator.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `activity-page`: the combined subscriptions-and-invites requirement becomes two, one per table, plus the Owner column, the read-only audience row, and the invite-aware delete.

## Impact

- `shared/contracts.ts`: `ActivityResponse` gains `invites`; `SubscriptionRow` stops being a discriminated union and gains `ownerName` and `audienceName`. A breaking payload change, consumed only by the Activity page.
- `api/activity.ts`: both queries join the owner, the subscription query keeps the granting path, and the dedupe prefers the direct row so a user who is subscribed both ways keeps their controls.
- `api/topic/subscriptions.ts` and its route: `deleteTopicSubscription` takes the caller's email and deletes the matching invite.
- `ui/src/components/table/`: a new `InvitesTable`, and `SubscriptionsTable` loses its pending branch.
- No database migration. Every column this reads already exists.
