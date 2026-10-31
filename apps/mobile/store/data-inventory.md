# Data inventory

What the CarlNotes app, the api it calls, and each SDK and native module collect, for Apple's App Privacy answers and
Google's Data safety form. Every row names the code that sends or stores the data. Read the code again before each
submission: a row that no longer matches its module is wrong, not the module.

The dependencies are in `apps/mobile/package.json`, and the request headers are in `apps/mobile/src/deviceTelemetry.ts`.
PostHog is in `apps/mobile/src/visitAnalytics.ts`, and Sentry is in `apps/mobile/src/monitoring.ts` and
`monitoringRedaction.ts`. The saved feed is in `apps/mobile/src/queryCache.ts` and `queryCacheRules.ts`, and the session
cookie is in `apps/mobile/src/authClient.ts`. The permissions are in `apps/mobile/app.config.ts`, and the voice modules
are in the Voice section of `apps/mobile/AGENTS.md`. The server events are
in `packages/server/analytics.ts` and `apps/api/currentUser.ts`, and account deletion is in `apps/api/users.ts`. Store
purchases are in `apps/mobile/src/storePurchases.ts` and `apps/api/storeBilling.ts`.
`apps/web/src/pages/PrivacyPage.tsx` shows what the policy already discloses.

"Tracking" below is Apple's definition: linking data with third-party data for advertising, or sharing it with a data
broker. The app does none of it, so every row says no.

## What is collected

The published Privacy policy still says mobile events can include SDK identifiers and approximate location, which this
inventory does not find; the policy text needs the same update before the store forms are filed.

| Data | Collected by | Purpose | Linked to the account | Tracking | Shared with | Retention or deletion path |
| --- | --- | --- | --- | --- | --- | --- |
| Email address, name, avatar | The api, on sign-up and in Account. Apple, Google, or GitHub supply them on a provider sign-in, with a private relay address if the person hides their email with Apple | The account, sign-in, and the emails the person turns on | Yes | No | None. Resend delivers the emails the account turns on | Deleted with the account (`deleteUser` in `apps/api/users.ts`), purged within 30 days, backups within 90 |
| Hashed password | The api, on an email sign-up | Email sign-in | Yes | No | None | Deleted with the account |
| Session cookie | `@better-auth/expo` through `expo-secure-store`, with the `carlnotes` prefix (`authClient.ts`). The gate cookie of an email sign-up sits beside it | Staying signed in | Yes | No | None | Removed on sign-out and when the api reports the session ended. Account deletion revokes every session |
| Topics, prompts, sources, attachments, findings, scan recaps, bookmarks, ratings, read marks, subscriptions | The api, as the person creates and reads them | The product: what Carl reads, keeps, and shows | Yes | No | The model providers the privacy policy names, for scoring and summaries | Deleted with the topic or the account |
| Chat messages, Tasting Notes, comments, replies, mentions, reports, blocks | The api | The chat, team rooms, notes, and moderation | Yes | No | None outside the service. A report reaches the admin console | Deleted with the account. A report keeps the quoted content until an admin resolves it |
| Team memberships and invitations | The api | Teams | Yes | No | None | Deleted with the team or the account |
| Store purchases: the plan, billing interval, status, period end, the store, and the store's transaction id | `react-native-purchases` in `storePurchases.ts`, configured with an anonymous id and logged in before a purchase or a restore with a random id the api saves for the account, never the account id, buys through the App Store or Google Play. `collectDeviceIdentifiers` is never called. The api reads the subscription from RevenueCat on `POST /billing/store/sync` and the RevenueCat webhook, and stores it in `billing_subscriptions`. The storefront country goes with the purchase's server events | Granting, restoring, and showing the plan the person bought, on the web and in the app | Yes | No | Apple or Google take the payment. RevenueCat validates the purchase and keeps the customer record under the random id | The api's row and the RevenueCat customer record are deleted with the account. The store subscription bills until it is canceled in the store |
| Podcast Episode listening position and completion | The api, and `podcastEpisodeCheckpoint.ts` on the device for the account's own last Podcast Episode: id, position, completion, rate, time | Resuming a Podcast Episode and the listener count | Yes | No | None | The device copy is removed on sign-out. The server copy goes with the account |
| App icon badge count | `expo-notifications` in `appIconBadge.ts`, from the api's update counts. It asks for nothing: the badge shows only once the notification permission allows it | The count of new findings, invitations, and messages on the icon | Yes, on the device only | No | None | Cleared on sign-out. Nothing leaves the device |
| Expo push token, with the platform, app version, and last time the phone registered | `expo-notifications` in `pushRegistration.ts`, only after the person allows notifications, sent to the api through `pushClient.sendPushDevice` and stored in `push_devices` bound to the session. The token is also kept in `expo-secure-store` (`push-token`) to replace it when it changes, and deleted from the phone on sign-out. The two account switches are stored on the account | Delivering the notifications the person turned on: new findings on a followed topic, and chat mentions | Yes | No | Expo's push service, which forwards to Apple Push Notification service or Firebase Cloud Messaging. A notification includes the topic or room name, the sender's username, a finding's title, and a link, never a message's text | Removed on sign-out, when the session ends or is revoked, when the push service reports the app uninstalled, and with the account. Send records with each receipt are deleted with the account or the scan or message |
| Platform, OS version, device model, app version, build number | `deviceTelemetry.ts`, as headers on every api and auth request, as Sentry tags, and on every PostHog event. No advertising, vendor, installation, or account identifier is read | Support, the forced-update check, and separating platforms in the dashboards | Yes on an api request, which the session identifies. No on a PostHog event | No | Sentry, PostHog | Up to 12 months in the error and analytics stores. Not stored with the account |
| Server usage events: signup, topic created, scan completed, podcast episode played, team joined, account deleted, and the others `packages/server/analytics.ts` sends | The api, keyed to the account id with the plan and the device headers above (`toAnalyticsProperties` in `apps/api/currentUser.ts`) | Product analytics | Yes, by account id. No name or email | No | PostHog | Up to 12 months |
| Screen views by route pattern and visit events: plays, completions, sign-up taps, shares, follows, naming a public Topic at most | `visitAnalytics.ts`. Persistence is memory only, session replay and autocapture are off, geoip is off, remote flags are off, `$device_id` and `$device_name` are deleted before send, and `$process_person_profile` is false | Product analytics | No. No person profile is created and no identifier survives the app process | No | PostHog | Up to 12 months. Nothing is stored on the device |
| Crash and error reports: stack trace, release, update id, the route pattern, the device row above | `monitoring.ts`, `sendDefaultPii: false`, traces sampled at 0.1. `redactMobileEvent` drops the user, request bodies, headers, cookies, tokens, emails, navigation params, console and UI breadcrumbs, and replaces every URL with its origin or a route pattern | Fixing crashes | No | No | Sentry | Up to 12 months. Nothing is stored on the device beyond the SDK's queue |
| Saved Feed and the last visible Topic page | `queryCache.ts`, AsyncStorage key `carlnotes:feed:<userId>` | Reading what was already loaded while offline | Yes, keyed by the account's user id on the device | No | None. Nothing leaves the device | Removed on sign-out, on a session the api ends, and on a build identity change. Account deletion retires the session first |
| Tasting Note drafts | `noteDraftStorage.ts`, AsyncStorage prefix `NOTE_DRAFT_PREFIX` from `packages/core/lib/noteDrafts.ts` (`carlnotes.note-drafts.v1:`) | Keeping typed text through an offline stretch or a restart | Yes, per account and note, on the device | No | None | Removed on a successful save, sign-out, revoked access, and accepted deletion |
| Appearance choice | AsyncStorage, `theme.ts` | Light or dark | No | No | None | Stays until changed. Not account data |
| Avatar photo | `expo-image-picker` with the Photos permission, `expo-image-manipulator` to resize, then the api. No camera. The picker records nothing; its microphone purpose line is the voice row's, which the picker's config would otherwise remove | The profile avatar the person chooses | Yes | No | Cloudflare R2 holds the file | Deleted with the account, or replaced |
| Team avatar | `expo-image-picker`, the same way, through `teamClient.sendTeamAvatarBody` | The team's avatar | Yes, to the team | No | Cloudflare R2 | Deleted with the team |
| Topic attachments | `expo-document-picker` in `TopicAttachmentEditor.tsx` for the chosen file, sent through `uploadTopicAttachmentBody`. `expo-file-system` in `TopicAttachmentLink.tsx` downloads an owner's attachment to the app's cache to open it, and removes the file when the screen closes. Chat attachments are deferred to Prompt 53 | What the person attaches to a topic on purpose | Yes | No | Cloudflare R2. The model providers read a topic attachment on a scan | Deleted with the topic or the account |
| Microphone recording of a spoken question | `expo-audio` in `voiceRecorder.ts`, only after a mic tap and the system's microphone prompt (`voicePermission.ts`). The recording is AAC in a `voice-recording-*` cache file, sent through `voiceClient.sendTranscription`, then deleted. The api transcodes it in memory and has Google's Gemini transcribe it with storage turned off. The api never stores the recording | Asking Carl, or Carl and Vienna, a question out loud | Yes, the request carries the session | No | Google, which transcribes it and may log it for up to 55 days for abuse monitoring only, and never trains on it | The cache file is deleted once sent, on cancel, on a failure, on sign-out, and by the launch sweep (`voiceCacheFiles.ts`). The api keeps none. The transcript is a chat message, as the chat row says |
| A spoken answer's audio | `spokenAnswerAudio.ts` plays the audio that `voiceClient.fetchSpokenAnswerAudio` returns for a reply's text, from a `spoken-part-*` cache file | Carl reading his reply out loud | Yes, the request carries the session | No | Google, which speaks the reply's text, as the Privacy policy names | Each part's file is deleted once it plays, on stop, on a failure, on sign-out, and by the launch sweep. Nothing is kept on the server |
| Spoken question timings | `voiceClient.sendSpokenQuestionEvent` and `sendSpokenEvent`: how long the recording, the transcription, and the wait for the first word took, and a play tap | Measuring how fast a spoken answer starts | Yes, by account id. No audio or text | No | PostHog | Up to 12 months |
| Last chosen AI provider in the Add to AI dialog | AsyncStorage, `AddToAiDialog.tsx` | Preselecting the provider next time | No | No | None | Stays until changed. Not account data |
| Install integrity evidence | `@expo/app-integrity`: App Attest on iOS, Play Integrity on Android, on an email sign-up only | Proving the sign-up comes from a genuine install | No. The api verifies the evidence and keeps the result of the check | No | Apple or Google issue the evidence | The evidence is not stored with the account |
| Apple sign-in nonce | `expo-crypto` in `appleSignIn.ts`: a random UUID and its SHA-256, sent to Apple's sheet | Binding the Apple credential to this request | No | No | Apple | Discarded after the sign-in |
| IP address | The api and its hosts, Expo's update server, YouTube when a video is loaded | Security, rate limits, delivering an update, playing a video | No in the app's own stores. The viewer and listener counters hash it one way | No | Expo (EAS Update), YouTube (Google) on a loaded video | The api keeps no IP log of its own. Each provider's policy covers its logs |
| Update check | `expo-updates`: platform, runtime version, update id | Loading a compatible EAS Update | No | No | Expo | Per Expo's policy |
| Network state | `expo-network`, read in the app only | Pausing reads while offline | No | No | None | Never stored |
| Clipboard | `expo-clipboard`, write only, on the share sheet's copy and the podcast feed's Copy | Copying a link the person asked for | No | No | None | Never read |

Modules that read only values the rows above name, or nothing: `expo-application`, `expo-constants`, `expo-device`, and
`expo-localization`. `expo-font`, `expo-image`, `expo-linking`, `expo-router`, `expo-splash-screen`, `expo-system-ui`,
and the UI libraries send nothing of their own. `expo-web-browser` is the system browser sheet, with its own cookie
store, and is never given the session. `react-native-sse` is the room stream, and it sends the session headers above.
`react-native-webview` and `react-native-youtube-iframe` are the YouTube player, limited to the player document.
`expo-apple-authentication` opens Apple's sheet and returns the credential the first row covers. `expo-audio` plays
audio in the background and records a spoken question after a mic tap. The config plugin sets the microphone purpose
line and `recordAudioAndroid: true`, and keeps background recording off.

## Apple App Privacy answers

Collected and linked to the person's identity, not used for tracking: Contact info, User content, Audio data,
Identifiers, Purchases, and Usage data. The Expo push token is a device identifier linked to the account and used for
app functionality only. Contact info is the email address and name. User content is the topics, findings, notes,
messages, comments, and attachments they create, and photos they choose as an avatar. Identifiers are the account id, on
server events. Usage data is product interaction, on server events keyed to the account. Audio data is a spoken
question's recording, for app functionality. The api keeps none of it, but Google may log it for abuse monitoring for up
to 55 days, longer than the real-time servicing Apple exempts, so it is declared. Purchases is the purchase history of a
plan bought in the app, for app functionality.

Collected and not linked to identity, not used for tracking: Diagnostics (crash data, performance data), and Usage data
(the PostHog screen and visit events, which include no person profile or device identifier).

Data Not Collected, which the code shows: Location, Financial info, Health and fitness, Contacts, Browsing history,
Search history, Sensitive info, Advertising data, and Other user content outside the rows above.
Device ID is collected once the person allows notifications: the Expo push token, for app functionality only. Location
is off because geoip is off and no location module is installed. A search query goes to the api and
is not stored or sent to analytics. No vendor, advertising, or installation identifier is read. The microphone
records only after a mic tap, never in the background.

Tracking: No. The app has no advertising SDK, no data broker, and no cross-app identifier. The App Tracking
Transparency prompt is never shown.

## Google Play Data safety answers

- Does the app collect or share any of the required user data types: Yes.
- Is all of the user data collected by the app encrypted in transit: Yes. Every request is TLS to the api, Sentry,
  PostHog, Expo, RevenueCat, Apple, or Google.
- Do you provide a way for users to request that their data is deleted: Yes. In the app, Account, Close your account,
  Close account. On the web, `https://carlnotes.com/account`. Without either, email support@carlnotes.com with the
  subject "Delete my CarlNotes account". Requests are answered within 30 days. The policy's section is
  `https://carlnotes.com/privacy#delete-your-carlnotes-account`.
- Data types collected: Personal info (name, email address, user ids), Photos (an avatar the person chooses), Files and
  docs (attachments the person chooses), Messages (chat messages, notes, comments), Audio (voice or sound recordings: a
  spoken question, optional, for app functionality, not processed ephemerally since Google may log it for abuse
  monitoring), Financial info (purchase history: a plan bought in the app, for app functionality), App activity (app
  interactions), and App info and performance (crash logs, diagnostics). In-app search history is not retained. Device
  or other IDs: the Expo push token, once the person allows notifications, for app functionality.
- Data types shared: App info and performance with Sentry, App activity with PostHog, as the rows above say. The push
  token goes to Expo's push service as a processor that delivers the notification, which Play counts as a service
  provider, not sharing. A spoken question's recording goes to Google as the service provider that transcribes it. A
  purchase goes to RevenueCat as the service provider that validates it. No data is shared for advertising.
- Purposes: App functionality, Analytics, Account management, Fraud prevention and security (the install check).
- Optional or required: Email is required for an account. Name, avatar, attachments, messages, recordings, and
  purchases are optional.
- Independent security review: No.
- Government app: No.

## Encryption export declaration

`app.config.ts` sets `ITSAppUsesNonExemptEncryption` to `false`. The app encrypts nothing of its own. It uses TLS and
the system keychain only. The operating system supplies TLS for every connection. `expo-secure-store` keeps the session
cookie in the system keychain. The dependency audit ran against `apps/mobile/package.json` on the date below. It found
these modules that ship or call cryptography:

| Dependency | What it does | Used by the app |
| --- | --- | --- |
| `expo-crypto` | The platform's random bytes and digests | Yes, in `appleSignIn.ts`, for a random nonce and its SHA-256 hash. It hashes and encrypts nothing |
| `expo-secure-store` | The iOS keychain and Android's Keystore-backed storage | Yes, for the session cookie. The operating system encrypts the storage |
| `better-auth` and `@better-auth/expo` | The auth client. The server side signs and hashes. The client stores and sends the cookie | Yes, for sign-in. No encryption runs on the device |
| `@expo/app-integrity` | App Attest and Play Integrity, which the operating system signs | Yes, on an email sign-up. The operating system signs the attestation |
| `@sentry/react-native`, `posthog-react-native`, `expo-updates` | TLS to their hosts, nothing else | Yes. Transport encryption only |
| `react-native-purchases` | StoreKit and Google Play Billing, which the store signs, and TLS to RevenueCat | Yes, for a plan purchase and a restore. Transport encryption only |
| `react-native-sse`, `react-native-webview`, `expo-audio`, `expo-image`, `expo-file-system` | TLS through the platform's networking | Yes. Transport encryption only |

No dependency implements its own cipher. The declaration holds as long as this table does. Audit date: 2026-10-31.
The export classification is the account holder's to confirm in App Store Connect.
