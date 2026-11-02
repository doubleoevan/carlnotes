# Proposal

## Why

The app icon badge counts the waiting updates only while the app runs. A user who leaves the app closed sees a stale
number, or none, until they open it again. iOS sets the badge from a push's `badge` field without the app running, so
every push can carry the recipient's current count.

## What Changes

- Each Topic push and mention push sets the recipient's update count as the app icon badge: their unseen chat
  mentions, unread note edits and comments, and pending topic invitations, the same sum the apps show.
- The count is read per recipient account when the push sends, so every phone of one account shows the same number.
- The note badge reads, the pending topic invitation filter, and the unseen chat mention filter move to
  `packages/db`, so the api's reads and the push sender share one copy.
- Android launchers draw their own badge and ignore the count.

## Capabilities

### New Capabilities

### Modified Capabilities

- `push-notifications`: a push sets its recipient's update count as the app icon badge.
- `mobile-chat`: the app icon count changes when a push arrives, not only while the app is open.

## Impact

- `packages/db/updateCounts.ts`, `packages/db/inviteFilters.ts`, and `packages/db/noteBadges.ts` (moved from the api).
- `packages/pipeline/pushNotify.ts` and `pushDelivery.ts` set `badge` on each push message.
- `apps/api/activity.ts`, `apps/api/chat/mentions.ts`, and `apps/api/invite/` read the shared filters.
- A few small reads per push recipient in the worker, at most five recipients at a time.
