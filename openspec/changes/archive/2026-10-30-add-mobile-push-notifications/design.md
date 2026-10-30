# Design

## Context

See proposal.md for the motivation and specs/push-notifications/spec.md for the behavior.

- **The digest path.** `runTopicScan` starts `sendScanEmailWorkflow` as an abandoned child named `scan-email-<scanId>`,
  behind `patched("scan-email-workflow")`. The email workflow waits up to 10 minutes for a podcast episode's outline,
  then plans and sends the digest in batches of 100. `packages/pipeline/notify.ts` selects the recipients in
  `loadUnsentRecipients`: an active subscription with email on, joined to `users`, minus the rows that the Scan's
  `topic_email_sends` already hold. A manual or creation Scan sends a report to whoever ran it instead. The digest
  still sends when a Scan finds nothing ("nothing new"). The `topic-scan-email` spec also says recipients are
  frequency-matched, but the query has no frequency filter. Push reuses the same query through one helper, so the two
  deliveries can never disagree. The frequency gap is older than this change and stays out of it.
- **Mentions.** `apps/api/chat/room.ts` saves a member's post, then calls `saveChatMentions`. That call writes one
  `room_mentions` row per named member and per replied-to author, never for the sender. `@all` writes no rows, and
  Carl's replies write none. The room hides a mention from a blocked author or in a reported message through
  `toUnblockedAuthorFilter` and `toUnreportedFilter`, which live in `apps/api` and so are out of the worker's reach.
  Message text is encrypted at rest.
- **Sessions.** Better Auth stores sessions in Redis and in the `sessions` table (`storeSessionInDatabase: true`).
  The mobile app's sign-out is `exitSession(signOut)`, and a revoked session is retired through `retireSession`.
- **Mobile.** `expo-notifications` ~58.1 is already installed for the icon badge. On iOS, `appIconBadge.ts` asks for
  permission with alerts and sounds off the first time a count shows. That counts as a launch-time ask, and it sets
  the iOS authorization before the push prompt could. `nativeIntent.ts` maps a site url to a native route and sends a
  visitor's signed-in path through sign-in.
- **Settings.** The account screen composes `packages/core/components/AccountFields` sections from per-app
  `AccountFieldElements`. Mobile already has `PreferenceSwitch`, which mirrors the web's `Switch` on the email
  column of `TopicSubscriptionsTable`.

## Goals / Non-Goals

**Goals:**

- One delivery module in `packages/pipeline` for both kinds, behind Temporal retries, with send records that make a
  retry skip accepted sends.
- A device binding that cannot outlive the session that made it, so an account switch on a shared phone is safe by
  construction instead of by client discipline.
- No new cron. Receipts are read from the same workflow that sent the push.

**Non-Goals:**

- Web push. The web has no service worker push delivery, and the Notifications section is mobile-only. This is a
  platform difference, recorded in `apps/mobile/parity.md`.
- Setting the icon badge from a push. The count sums mentions, note changes, and invitations, and the api computes
  it per request. A per-recipient count at send time would need that sum moved into the pipeline, and a count that
  is stale by the time the user looks is worse than the bare count the poll corrects on open.
- Push for Carl's room replies, `@all`, manual-scan reports, note comments, or invitations. Each kind follows an
  existing in-app or email state, and these have none that this change extends.
- Per-device or per-Topic push switches. The account-level switches and the Topic's email subscription cover what was
  asked.

## Decisions

### A push device is a row keyed by token and bound to a session

`push_devices` holds the `expo_push_token` (unique), `user_id` (cascade from `users`), `session_id` (cascade from
`sessions`), `platform` (`ios` or `android`), `app_version`, `last_seen_at`, and timestamps. `POST /api/push-devices`
upserts on the token and overwrites the user, session, version, and last-seen time. So a second account that
registers the same phone takes the row over. `DELETE /api/push-devices` with the token removes the row only if it
belongs to the caller's session.

Binding to the session makes sign-out, revocation, and account closing remove the row through the cascade, even if
the app's own unregister call never arrives. The delivery query also joins `sessions` with `expires_at > now()`,
because an expired session row can stay until Better Auth cleans it up. Better Auth 1.7.13's `deleteSession` and
`deleteUserSessions`, which `signOut`, `revokeSession`, and `revokeSessions` call, delete the Postgres row after the
Redis copy unless `preserveSessionInDatabase` is set. `apps/api/auth.test.ts` pins that option unset, so the cascade
is the only unbinding the api needs.

Alternatives: binding to the user only, with the app unregistering on sign-out. This leaks another account's pushes
whenever the unregister request fails offline. Storing the token on the session row would put a column on Better
Auth's own table, and rotation would be awkward.

### Token rotation and registration timing live in one mobile module

`apps/mobile/src/pushRegistration.ts` reads the token with `getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID })`.
It registers when a session starts and permission is granted, and again when `addPushTokenListener` reports a new
token, sending the previous token so the api removes its row. `useSignOut` calls the unregister before `exitSession`
signs out and ignores its failure, which keeps React Native out of `sessionExit.ts` and its tests. The pure rules, the
permission mapping and the registration payload, live in `pushRules.ts` so tests can load them. The requests go through
`packages/client/pushClient.ts` (`sendPushDevice`,
`sendDeletePushDevice`, `sendPushPreference`), because the route contracts and the client parity
check name every route by its client function. A client function passes the token through and keeps nothing, so no
universal package holds a token or sends a push. The token never reaches
analytics or Sentry. The monitoring redaction in `packages/contracts/monitoringRedaction.ts` gains an
`ExponentPushToken[...]` pattern for error messages from either side.

### The preferences are two nullable columns on users

`users.is_topic_push_enabled` and `users.is_chat_mention_push_enabled` are nullable booleans. Null means the user
never chose, and delivery treats null as off. A registration from a granted phone sets each null column to true with
`coalesce`, so both switches turn on with the first grant and a switch turned off stays off on every phone. Better
Auth's `additionalFields` return the columns on the session, as `inviteAccess` is returned, and
`POST /api/users/me/push-preferences` saves one kind at a time.

Alternatives: a preferences table, which is overhead for two flags, and per-device switches, which contradict "one
switch for each kind" in account settings.

### Recipient selection is shared with the digest

`notify.ts` extracts `loadDigestSubscribers(topicId, userIds?)`, the active, email-on subscription join that
`loadUnsentRecipients` uses today, and both deliveries call it. The Topic push then keeps the subscribers with
`is_topic_push_enabled` true, joins their live push devices, and drops the (recipient, device) pairs that
`push_notification_sends` already records for the Scan. The push does not depend on whether the email was accepted,
and the push records do not affect the digest.

The filters now take the recipient as an id or a column, so one query filters every mentioned member. Mention
recipients come from the message's `room_mentions` rows, minus the author, filtered at send time by
`is_chat_mention_push_enabled`, by a `team_members` row for the message's Team, by a `team_topics` row when the
message has a Topic, and by the block and report filters. Those two filters move from `apps/api` to
`packages/db/contentFilters.ts` so that the api and the pipeline import one copy.

### Two workflows on their own task queue, with a durable wait for receipts

`apps/worker/workflows/sendPushNotifications.ts` defines `sendScanPushWorkflow({ scanId })` and
`sendChatMentionPushWorkflow({ roomMessageId })` on a `push-notifications` task queue. Its worker registers in
`temporal.ts` beside the scan email worker. Each workflow runs one send activity, then
`sleep(PUSH_RECEIPT_WAIT_MS)` for 15 minutes, then `checkPushReceipts` for its event. Retries use the scan email's
policy, now shared from `deliveryRetryPolicy.ts`: 15 seconds doubling to 10 minutes, at most 10 attempts. A final
failure is reported without a token.

- `runTopicScan` starts the scan push as an abandoned child named `scan-push-<scanId>`, next to `startScanEmail` and
  behind `patched("scan-push-workflow")`, only for a scheduled Scan that succeeded. The activity returns skipped if
  the Scan has no new Findings. The push does not wait for the podcast episode outline, since it does not name the
  episode.
- The api starts the mention push through `startChatMentionPushWorkflow(roomMessageId)` in
  `packages/pipeline/temporalClient.ts`, with the id `chat-mention-push-<roomMessageId>`. It starts only after
  `saveChatMentions` wrote at least one row, and it is not awaited by the response: a failure is caught and reported.
  `WorkflowExecutionAlreadyStartedError` is ignored, which makes a duplicate start a no-op.

Alternatives: sending inside `sendScanEmailWorkflow` would hold Topic pushes behind the 10-minute podcast outline
wait and give one workflow two jobs. Sending a mention push inline in the api would lose retries and receipts on a
restart. A receipt cron would add a schedule and a scan over all recent sends, where a per-workflow sleep reads
exactly its own tickets.

### One delivery module over one server SDK wrapper

- `packages/server/expoPush.ts` constructs `new Expo({ accessToken: Bun.env.EXPO_PUSH_ACCESS_TOKEN })` from
  `expo-server-sdk` 8 on first use. It exports `chunkPushMessages` (100 messages per request), `sendPushMessageChunk`,
  which returns a ticket per message in order, `readPushReceipts(ticketIds)`, which reads in chunks of 300, and
  `isRetryablePushServiceError` (a 429, a 5xx, or no response). The SDK retries a 429 itself. The api checks a token's
  format with the contracts' `EXPO_PUSH_TOKEN_PATTERN`, which the error redaction also uses. The secret is named
  `EXPO_PUSH_ACCESS_TOKEN`, not `EXPO_ACCESS_TOKEN`, because the EAS CLI reads `EXPO_ACCESS_TOKEN` as its own login.
- `packages/pipeline/pushNotify.ts` exports `sendScanPush` and `sendChatMentionPush`, which pick the recipients, and
  `pushDelivery.ts` sends, records, and builds each message (title, body, and `data: { url, recipientUserId, kind }`),
  with the words in `pushNotificationCopy.ts` and the receipt
  check, `checkPushReceipts`, in `pushReceipts.ts`. `pushWorkflows.ts` holds the queue name and the chat mention
  push's workflow name with no imports, so the workflow bundles and the api's Temporal client share one copy. Each
  message
  targets one token, so each
  ticket maps to one (recipient, device) pair. `channelId` is `topic-scans` or `chat-mentions`, so Android users can
  silence one kind in the system settings. The body is cut at a word to stay under 4096 bytes with its data.
- Results: an `ok` ticket inserts its `push_notification_sends` row right after the chunk returns. An error ticket
  of `DeviceNotRegistered` deletes the device. An error ticket of `MessageRateExceeded`, an HTTP 429, or a 5xx makes
  the activity throw a retryable failure after the chunk's `ok` rows are recorded. Any other 4xx, or
  `InvalidCredentials`, is kept as the send's final error while the later chunks still go, so one bad chunk never
  stops a Topic's push. A chunk rejected with `PUSH_TOO_MANY_EXPERIENCE_IDS` names its tokens by Expo project: the
  send retires every token outside `MOBILE_APP_EXPO_PROJECT_NAME` and sends the chunk again, since the api can only
  check a token's format, never its project. Registration is rate limited per user, and an account keeps its ten
  phones seen most recently, which bounds what one account can add to a send.

### Send records

`push_notification_sends` holds `kind` (`topic-scan` or `chat-mention`), `scan_id` (cascade), `room_message_id`
(cascade), `recipient_user_id` (cascade), `push_device_id` (set null), `ticket_id`, `receipt_status` (null, `ok`, or
`error`), `receipt_error`, `sent_at`, and `receipt_checked_at`. A check constraint requires `scan_id` for
`topic-scan` and `room_message_id` for `chat-mention`. Unique indexes on (`scan_id`, `recipient_user_id`,
`push_device_id`) and on (`room_message_id`, `recipient_user_id`, `push_device_id`) make the record idempotent, with
`onConflictDoNothing`. Rows of the other kind leave the column null, and Postgres treats nulls as distinct, so the two
kinds never collide. `checkPushReceipts` reads its event's rows that have a ticket and no receipt, writes each
receipt, deletes the device on `DeviceNotRegistered`, and reports any other error code with the event id. A receipt
that is still missing after the wait is recorded as `error` with `receipt-missing` and reported. The service keeps
receipts for 24 hours, so a second read would not help.

### Permission and the sheet

`apps/mobile/src/pushPermission.ts` owns the state. `readPushPermission()` returns `granted`, `denied`, or
`undetermined`, and treats an iOS grant without `allowsAlert` as `denied`. `askForPushPermission()` requests alerts,
sounds, and the badge, then registers. A device-local flag in SecureStore, `push-permission-sheet-shown`, records
that the sheet was shown. The sheet `PushPermissionSheet` renders `PushPermissionPrompt`, which composes the existing
`Sheet` and `Button`,
with its copy in `packages/core/lib/pushCopy.ts`. It opens after a successful first follow in `TopicPageActions` and
`TopicSubscriptionsTable`, and on the first room screen mount, while permission is undetermined and the flag is
unset. On Android, the two channels are created before the request, as Android 13 requires.

`appIconBadge.ts` stops requesting. It sets the count only if the current permission allows the badge on iOS, and
always on Android.

### The Notifications section is shared logic with a native switch

`NotificationsSection` is `packages/core/components/NotificationsSection.tsx`, over a pure `NotificationsCard`, whose
switch states come from `toNotificationSwitchStates`, so the stories and the tests need no session. It reads the
preferences from the session,
saves through the push preference client function, and renders through `AccountFieldElements` with a new `Switch`
element. The mobile element is `PreferenceSwitch`. The platform state comes in as props: `permission`,
`onRequestPermission`, and `onOpenSettings`, where the last one is `Linking.openSettings()` on mobile. The web adds a
`Switch` element mapping to its shadcn `Switch` so that the type stays complete, but does not render the section.

Reuse, for the report: the Card, Heading, Text, and the new Switch elements, `PreferenceSwitch`, `Sheet`, and
`Button` are component reuse. `NotificationsSection`, `pushCopy`, the payload contracts, and the redaction pattern
are shared logic. The permission and registration modules and the tap handler are native replacements with no web
counterpart.

### Opening a push

`PushNotifications` in `apps/mobile/src/components/push/PushNotifications.tsx`, mounted in `app/_layout.tsx` beside
`PushPermissionSheet`, registers the phone and uses
`useLastNotificationResponse()`, which covers a cold start and a return from the background. It accepts `data.url`
only if `isSiteUrl` passes and `data.recipientUserId` matches the session user. Otherwise it routes Home. It routes
through `toLinkedPath`, the same rules as an app link. The pure rules are `toPushOpenPath` and `isPushForPath` in
`apps/mobile/src/pushNotificationRouting.ts`. The banner check compares the path with the room's team, so another
Team's room of the same Topic still shows its banner. A tap for another account opens Home and stays unopened until
that account signs in. `setNotificationHandler` hides the banner when
the push's
mapped path equals the current route, which a module-scope value updated from `usePathname` holds. Otherwise it
shows the banner and adds the push to the notification list.

## Risks / Trade-offs

- [A crash between Expo accepting a chunk and the insert of its rows sends that chunk again on retry] → The rows are
  inserted immediately after each chunk returns, so the window is one chunk of at most 100 phones. Delivery is at
  least once, the same trade-off the digest makes.
- [A later Better Auth option or upgrade keeps the database session row on sign-out] → The auth test pins
  `preserveSessionInDatabase` unset, and the delivery join on `expires_at` still drops an ended session.
- [An iOS user who granted only the badge cannot be prompted again] → The section treats that grant as denied and
  links to the settings. The release checklist covers it.
- [FCM v1 credentials or enhanced push security are not set up when the build ships] → The migration plan orders the
  dashboard steps before the store build, and the acceptance list sends a real push on both platforms.
- [A Topic push names the first new Finding on the lock screen of a private Topic] → The phone's own preview setting
  governs lock screen text. The push includes the Finding's title only, never its summary or a source's text.
- [A popular Topic sends many chunks in one activity] → Chunks go out one after another under a ten-minute limit, with
  a heartbeat after each one and a 30-second heartbeat timeout, so a stuck attempt is cancelled and stops between
  chunks instead of sending beside its retry. The recipients are a subquery of the digest's, never a list of ids, so
  a large Topic stays inside Postgres's parameter limit. A request that hangs inside the SDK, which has no timeout of
  its own, can still finish after its attempt was cancelled and repeat that one chunk.
- [The digest reached followers of a Topic made private] → The digest recipient query now requires read access, as
  `canSeeTopic` does: any subscriber of a public or invite Topic, and on a private Topic only its owner and its teams'
  members. This changes the email delivery too, which is the `topic-scan-email` delta.
- [`push_notification_sends` grows with every push] → It keeps one row per push and phone, like `topic_email_sends`
  keeps one per email, with indexes on the phone and the recipient so the cascades stay cheap. Pruning waits until
  the table's size calls for it.

## Migration Plan

1. Merge the migrations with the code. The tables, indexes, and nullable columns are additive, each migration takes a
   3-second lock timeout, and deploys run migrations automatically.
2. Add `EXPO_PUSH_ACCESS_TOKEN` to Doppler for dev and prd, then turn on enhanced push security in the Expo
   dashboard. Turning it on first would make every send fail.
3. Upload the FCM v1 service account key to EAS credentials and add `google-services.json` as an EAS file variable.
   The APNs key is managed by EAS.
4. Deploy the api and the worker. The routes stay idle until a build with registration ships.
5. Freeze the contract for the next app version with `bun run contract:freeze`, then ship a store build, since
   `expo-notifications` entitlements and the Android channels are native changes.
6. Rollback: the worker's patch marker keeps old Scans replaying. To stop pushes without a deploy, unset the access
   token while enhanced security is on. Every send then fails as a reported failure, and the Scans and posts are
   untouched.
