# Tasks

## 1. Session binding check

- [x] 1.1 Confirm with a test against Better Auth's adapter (stubbed pool, per `packages/db/quotas.test.ts`) whether
  `signOut` and `revokeSession` delete the `sessions` row while `secondaryStorage` is on, and record the result in
  design.md. If either keeps the row, add an explicit `push_devices` delete to the matching hook in
  `apps/api/authHooks.ts`, with a test that the hook deletes the session's devices.

## 2. Schema and shared filters

- [x] 2.1 Add `packages/db/schema/pushDevices.ts` with `push_devices` and `push_notification_sends` as designed
  (unique token, session and user cascades, kind check constraint, the two unique indexes), and add
  `is_topic_push_enabled` and `is_chat_mention_push_enabled` (nullable booleans) to `users`. Run `bun run db:generate`
  and verify the generated SQL creates both tables, the indexes, and the check constraint. If a parallel worktree's
  migration has a newer `when`, apply the SQL by hand in dev and regenerate at ship time.
- [x] 2.2 Move `toUnblockedAuthorFilter` and `toUnreportedFilter` to `packages/db/contentFilters.ts`, update every
  `apps/api` import, and verify the existing block, report, and mention tests still pass unchanged.
- [x] 2.3 Add a schema test that closing an account and deleting a session cascade their `push_devices` rows, and
  update `packages/db/AGENTS.md` with the new tables and the filters module. The cascades are Postgres behavior, so the
  test is the live rolled-back `bun run smoke:push-devices`, which passes against the dev database.

## 3. Contracts and server SDK

- [x] 3.1 Add `packages/contracts/pushDevices.ts` with the registration and unregister payloads (token, platform,
  app version, optional previous token), the push preference payload, and the `PushNotificationKind` enum, with zod
  tests for an accepted and a rejected payload.
- [x] 3.2 Add the `ExponentPushToken[...]` pattern to `packages/contracts/monitoringRedaction.ts` and verify that its
  test redacts a token inside an error message for both the server and the native client.
- [x] 3.3 Add `expo-server-sdk` 8 to `packages/server`, write `packages/server/expoPush.ts` (`chunkPushMessages`,
  `sendPushMessageChunk`, `readPushReceipts`, `isRetryablePushServiceError`, reading `EXPO_PUSH_ACCESS_TOKEN`; the
  token format check is the contracts' `EXPO_PUSH_TOKEN_PATTERN`), and test the chunking and the result mapping
  with a stubbed fetch. Add the variable to the README env list and `packages/server/AGENTS.md`, with the reason it is
  not named `EXPO_ACCESS_TOKEN`.

## 4. Api routes

- [x] 4.1 Add `POST /api/push-devices` (session required, `isPushToken` check, upsert on token that takes over the
  user and session, `coalesce` of both preferences to true) and `DELETE /api/push-devices` (removes the row only for
  the caller's session). Test a visitor's 401, a first registration, a second account taking over the token, a
  rotation with a previous token, and a delete from another session that changes nothing.
- [x] 4.2 Return both preferences through Better Auth `additionalFields` and add
  `POST /api/users/me/push-preferences`, with tests for saving each kind and a visitor's 401.
- [x] 4.3 Start the mention push after `saveChatMentions` writes at least one row, without awaiting it in the
  response, and report a start failure. Test that a post with a mention starts one workflow, that a post without one
  starts none, and that a failed start still returns the posted message.
- [x] 4.4 Add the routes to `apps/api/apiRouteContracts.test.ts` and the contract fixtures, and update
  `apps/api/AGENTS.md`. Verify with `bun scripts/check-contract-freeze.ts`.

## 5. Pipeline delivery

- [x] 5.1 Extract `loadDigestSubscribers` in `notify.ts` and switch `loadUnsentRecipients` to it. Verify that the
  existing `notify.test.ts` assertions pass unchanged.
- [x] 5.2 Write `packages/pipeline/pushNotify.ts` `sendScanPush`: skip a Scan that is not succeeded or has no new
  Findings, select the digest subscribers with Topic pushes on and live devices (session not expired), skip recorded
  pairs, send, record `ok` tickets per chunk, delete `DeviceNotRegistered` devices, and throw retryable or final
  failures as designed. Test recipients against unfollowed, email-off, push-off, null-preference, expired-session,
  and already-sent cases, plus a partial-chunk retry that sends only the unrecorded phones.
- [x] 5.3 Write `sendChatMentionPush` with the send-time access checks (Team member, Topic still held by the Team,
  not blocked, not reported, message exists, author excluded). Test each exclusion, a reply, and a token that moved
  to another account between the plan and the send.
- [x] 5.4 Write the copy builders: a Topic push with the Topic name, the count, and the first Finding's title cut at
  a word under the 4096-byte payload limit, and a mention push with the room name and "mentioned you" or "replied to
  you", never the text. Test singular and plural, a long title, a Topic room, and a Team room.
- [x] 5.5 Write `checkPushReceipts`: record receipts, delete the device on `DeviceNotRegistered`, report other codes
  without the token, and mark missing receipts. Test each outcome.
- [x] 5.6 Add `startChatMentionPushWorkflow` to `temporalClient.ts`, ignoring an already-started workflow, with a
  test. Update `packages/pipeline/AGENTS.md` with the module and the retry, receipt, and batching limits (100
  messages per request, 4096-byte payload, 600 per second per project, receipts after about 15 minutes and kept for
  24 hours).

## 6. Worker

- [x] 6.1 Write `apps/worker/workflows/sendPushNotifications.ts` (both workflows, the send, the 15-minute sleep, the
  receipt check, and the final-failure report) and `sendPushNotificationsActivities.ts`. The worker has no Temporal
  test environment, so, as for the scan email, the activity tests prove which outcome throws a retryable or a final
  failure and what a failure report names, and the workflow bundle check builds the workflow.
- [x] 6.2 Register the `push-notifications` worker in `apps/worker/temporal.ts`, and start `sendScanPushWorkflow`
  from `runTopicScan` beside `startScanEmail` behind `patched("scan-push-workflow")`, only for a succeeded scheduled
  Scan. No run workflow test exists to extend, so the start's guard is the patch and the trigger check, and the
  activity's own skip covers a Scan with nothing new. Verify with `bun scripts/check-workflow-bundles.ts`, and update
  `apps/worker/AGENTS.md`.

## 7. Mobile registration, permission, and opening

- [x] 7.1 Add the `expo-notifications` config plugin options to `app.config.ts` (the Android channels `topic-scans`
  and `chat-mentions` are runtime calls in `pushPermission.ts`, made before the request), plus
  `android.googleServicesFile` from the EAS file variable. Verify with
  `bunx expo config --type public` that the plugin and the file are present.
- [x] 7.2 Write `apps/mobile/src/pushPermission.ts` and `pushRegistration.ts` (read state with iOS alert-less grants
  as denied, request alerts, sounds, and badge, register on session start and on token rotation, unregister before
  sign-out in `exitSession`). Test the pure state mapping and the rotation payload.
- [x] 7.3 Remove the launch-time request from `appIconBadge.ts` so the badge is set only if the permission allows it.
  Verify on the iOS simulator that a fresh install with a count shows no prompt. Unverified: no simulator run, at the
  user's request.
- [x] 7.4 Write `PushPermissionSheet` from the existing `Sheet` and `Button`, with the copy in
  `packages/core/lib/pushCopy.ts`, shown after the first follow in `TopicPageActions` and `TopicSubscriptionsTable`
  and on the first room screen mount. Add stories for the sheet in light and dark and at the largest text size, and
  test the show-once rule. The sheet's words and choices are `PushPermissionPrompt`, with a `Push/PushPermissionPrompt`
  story. The show-once rule reads SecureStore, which a pure test cannot reach, so it is unverified on a device.
- [x] 7.5 Write `PushNotificationRouter` and the foreground handler in `app/_layout.tsx`. Test the pure routing rule
  (site link to its path, another account or a non-site link to Home, the open room hides the banner), then on the
  simulator open a Topic push and a mention push from the foreground, the background, and a closed app. The pure rule
  is tested; the simulator runs were skipped at the user's request (the machine is out of memory) and are unverified.

## 8. Account Notifications section

- [x] 8.1 Add `NotificationsSection` and the `Switch` element to `packages/core/components/AccountFields.tsx`, with
  tests for both-off before a grant, both-on after the first grant, a kept-off switch, a save failure returning the
  switch to its saved value, and the denied state.
- [x] 8.2 Map `Switch` to `PreferenceSwitch` on mobile and to the shadcn `Switch` on web, render the section on the
  mobile account screen between Invitations and Blocked people with `Linking.openSettings()` for the guidance button,
  and add stories for loading, granted, denied, saving, save failure, and the largest text size in both palettes.
  Compare the switches against the web's email `Switch` at phone width.
- [x] 8.3 Record in `apps/mobile/parity.md` that the Notifications section, the permission sheet, and the tap handler
  have no web counterpart and why, with the component reuse, shared logic, and native replacements listed apart.
  Verify with `bun scripts/check-client-parity.ts` and `bun scripts/check-component-parity.ts`.

## 9. Docs and release

- [x] 9.1 Add `apps/docs/src/content/docs/account/notifications.md` (what each kind says, the switches, the link to
  the email subscription, allowing notifications in the system settings) and run `bun run docs:embed`. Verify the page
  builds with `bun run build:docs`. The page builds. The dev embed could not reach the model endpoint (ECONNRESET with
  the machine out of memory), and production embeds on deploy.
- [x] 9.2 Update `apps/mobile/store/data-inventory.md` with the push token, the platform, the app version, and Expo's
  push service as a processor, and add the push items from the acceptance list to
  `apps/mobile/store/release-checklist.md`. Update `apps/mobile/AGENTS.md` with the registration, permission, and
  release steps (Doppler secret, enhanced push security order, FCM credentials). The Privacy page names Expo, APNs,
  and FCM as the push processor and the push token in device storage, with its Last updated date moved.
- [x] 9.3 Update the root AGENTS.md routing table with a push notification row, and add the domain terms Push Device
  and push notification kinds to the `domain-model` skill.

## 10. Integration

- [x] 10.1 Run `bun run check` and verify that it passes, including the existing web regression tests.
- [ ] 10.2 Not run: the user asked for no simulator or emulator runs while the machine is out of memory, and a push
  needs a device build with the Expo access token and FCM credentials. The release checklist's push rows cover it.
  On a dev build on each platform, against the dev stack with `EXPO_PUSH_ACCESS_TOKEN`: follow a Topic,
  accept the sheet, run a scheduled Scan with new Findings, and receive the push. Have a second account mention the
  first and receive that push. Sign out and confirm no push arrives, then sign in with a second account on the same
  phone and confirm the first account's mention sends nothing. Record anything not verified.
