# Proposal

## Why

A follower learns about a scheduled Scan's new Findings only from the digest email, and a Team member learns about a
chat mention only when they next open the app, because the icon badge and the room badges change only while the app
runs. The mobile app is in the stores now, with app links and a release path, so a push notification is the missing
delivery for the two events people already wait on. Push adds a delivery and replaces nothing: the digest
email, the unseen `room_mentions` rows, and the badges stay as they are.

## What Changes

- A signed-in phone registers its Expo push token with the api through the existing session, after the user grants
  notification permission and again on each later sign-in. A `push_devices` row records the token, the platform, the
  app version, the last time the device was seen, and the session that registered it.
- A push device is bound to one session. Signing out, a revoked or expired session, and closing the account remove
  the binding, and a token registered by a second account moves to that account. No device receives another account's
  private notification.
- A scheduled Scan that succeeds with new Findings sends a push to its digest recipients who turned on Topic pushes.
  The push names the Topic and the count of new Findings, and opening it opens the Topic.
- A saved room mention sends a push to each mentioned member who turned on mention pushes, never to the author, and
  only while the member still has access to the room and has not blocked the author or reported the message. The push
  names the sender and the room, never the message text, and opening it opens the room.
- The worker sends both kinds from Temporal workflows on their own task queue, through one pipeline delivery module
  over Expo's server SDK. A `push_notification_sends` row records each accepted send per event, recipient, and device,
  so a retry never repeats an accepted send. A durable 15-minute wait then reads Expo's receipts, and a
  `DeviceNotRegistered` receipt deletes the device.
- The app asks for permission in context: after the user's first Topic follow, or the first time they open a Team chat
  room. A sheet explains the value before the system prompt. The app stops asking for the iOS badge permission at
  launch. The badge permission is requested with the push permission instead.
- The account screen gains a **Notifications** section with one switch for Topic pushes and one for mention pushes.
  Both switches turn on when permission is first granted. After a denial, the section explains how to allow
  notifications in the system settings and links to them.
- The Expo push access token lives in Doppler as `EXPO_PUSH_ACCESS_TOKEN`. Tokens, the access token, and send contents
  stay out of the universal packages, analytics, and error reports.
- The store data inventory, the release checklist, the mobile guide, and the user docs cover push notifications.

## Capabilities

### New Capabilities

- `push-notifications`: push device registration and ownership, the two notification kinds and their recipients and
  copy, durable delivery with receipts, the in-context permission request, the account switches, and opening a push.

### Modified Capabilities

- `mobile-chat`: the app icon badge no longer asks for the iOS badge permission at launch. The push permission request
  includes the badge, and a push leaves the badge count to the app's own poll.
- `mobile-store-delivery`: the release acceptance list covers push permission, delivery, opening a push in each app
  state, and sign-out unbinding.
- `topic-scan-email`: a digest reaches only subscribers who can still read the Topic, so a Topic made private stops
  reaching followers with no role on it. The Topic push reads the same recipients.

## Impact

- `packages/db/schema/`: new `push_devices` and `push_notification_sends` tables, and two nullable push preference
  columns on `users`, through a Drizzle migration. The block and report query filters move from `apps/api` to
  `packages/db` so the worker can use them too.
- `packages/server/`: an Expo push module over `expo-server-sdk` 8, which reads `EXPO_PUSH_ACCESS_TOKEN`.
- `packages/pipeline/`: `pushNotify.ts` (recipients), `pushDelivery.ts` (sends and records), and `pushReceipts.ts`
  (receipts). The digest's recipient query becomes one shared helper. The Temporal client gains the start of the
  mention push workflow.
- `apps/worker/`: a `sendPushNotifications` workflow file and its activities on a `push-notifications` task queue. A
  patch-guarded child start sits beside the scan email start in `runTopicScan`.
- `apps/api/`: the push device routes, the push preference route, the mention push start after `saveChatMentions`, and
  the session field that returns the preferences.
- `apps/mobile/`: the registration lifecycle, the permission sheet, the notification tap handler, the Notifications
  account section, the badge permission change, and the stories for each new state.
- `packages/core/`: a shared `NotificationsSection.tsx` beside `AccountFields`, which gains a `Switch` element, and the
  push copy.
- `packages/contracts/`: the push device payloads, the push preference payload, the notification kind enum, and the
  push token redaction pattern. A new contract snapshot is frozen for the release.
- Docs: the mobile, api, worker, pipeline, server, and db AGENTS.md files, `apps/mobile/parity.md`, the store data
  inventory and release checklist, the user docs page on notifications, and the README's env list.
- External services: Expo push service and FCM v1 credentials in EAS, the Expo dashboard's enhanced push security
  setting, and a Doppler secret in each environment.
