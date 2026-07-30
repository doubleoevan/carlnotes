# Tasks

## 1. Split the payload

- [x] 1.1 `shared/contracts.ts`: flatten `SubscriptionRow` (drop `kind`, add `ownerName` and `audienceName`), add `InviteRow` for a sent invitation, and give `ActivityResponse` an `invites` array.
- [x] 1.2 `api/activity.ts`: join the Topic owner into both queries, and carry the granting audience's name on the subscription query.
- [x] 1.3 `api/activity.ts`: dedupe a Topic subscribed both directly and through an audience in favor of the direct row.

## 2. Make delete a real unsubscribe

- [x] 2.1 `api/topic/subscriptions.ts`: `deleteTopicSubscription` takes the caller's email and deletes the matching `topic_invites` row alongside the subscription.
- [x] 2.2 `api/index.ts`: pass the session user's email to it.

## 3. Two tables

- [x] 3.1 New `ui/src/components/table/InvitesTable.tsx`: topic, invitee, invited date, and a subscribed-or-pending status, with a footer totalling invited and subscribed. Read-only.
- [x] 3.2 `SubscriptionsTable.tsx`: drop the pending branch, add the Owner column, and render an audience-held row read-only with its audience named.
- [x] 3.3 `ActivityPage.tsx`: render both accordions, each only when its list is non-empty, the second titled "Your invitations".
- [x] 3.4 Remove the now-unreachable invite-response path: the route, `respondToInvite`, `inviteResponsePayload`, and `sendInviteResponse`. An invitee subscribes from the Topic and manages it from their own subscriptions table.

## 4. Prove the rules that are easy to break

- [x] 4.1 Test that the direct row wins when a Topic is subscribed both directly and through an audience.
- [x] 4.2 Test that an audience-held row is marked read-only and a direct one is not.
- [x] 4.3 Confirm against the live database that an invitation reads subscribed only when that invitee holds a subscription. The rule lives in the query's left joins, so it is checked by running `loadActivity`, not by an offline test.

## 5. Verify

- [x] 5.1 Run the gate: `bash scripts/preflight.sh`.
- [x] 5.2 Confirm the payload `loadActivity` returns carries every state: an editable subscription, an audience-held read-only one, and invitations in both the subscribed and pending states. The rendered page needs an owner sign-in and was not driven.

## 6. Delete controls

- [x] 6.1 `TablePagination`: show the control row once there are more rows than the smallest page size, and show the pager within it only when the chosen page size actually splits them, so a single page never reads "Page 1 of 1".
- [x] 6.2 `revokeTopicInvite` plus a `DELETE /topics/:id/invite` route: withdraw an invitation on a Topic the caller owns, taking that invitee's subscription with it. The invitee's email travels in the body, since an email is personal data and does not belong in a url.
- [x] 6.3 Both tables delete with a tooltipped X icon rather than a text button, and withdrawing an invitation asks for confirmation first.

## 7. The invite reactivation disclaimer

- [x] 7.1 Carry the Topic's visibility on the subscription row, so the table can tell an invite Topic from a public one.
- [x] 7.2 Toast the next-scan disclaimer when Active switches back on for an invite Topic, matching what the Topic page does on a fresh subscribe.
