# Native accounts and collaboration

## Native Tasting Notes

`app/topics/[topicId]/notes/[noteId].tsx` and `app/teams/[teamId]/notes/[noteId].tsx` open `components/note/NoteScreen`.
The route checks membership in the owning page and fresh permissions before displaying server content.
Public readers do not need a draft store. Draft records include their Topic or Team page context.
`NoteEditor`, `NoteViewer`, `NoteToolbar`, `CreateNote`, `NoteComments`, `NoteConflictNotice`, and `NoteUnreadBadge`
adapt actual shared core components. The native editor and reader use the same pinned enriched HTML 1.1.1 as web.
The existing patch preserves web initialization and qualifies iOS React headers for the current native build.
Generated `ios/` and `android/` projects are ignored; Expo configuration remains their source.

One screen-level KeyboardAvoidingView owns avoidance with the measured header offset. Every KeyboardAvoidingView pads
on both platforms. Edge-to-edge Android draws under the keyboard and never resizes its window.
The editor has bounded internal scrolling. The full-width toolbar stays below the title and above the body.
`common/ScrollIndicator.tsx` supplies its persistent orange horizontal thumb and `ScrollBox`'s vertical thumb.
A Done control below the body appears while the software keyboard is open and explicitly blurs the editor.
The screen gives the metadata 16 points of top padding. The top-right Close note control returns to the owning Topic or Team route and its table position;
iOS edge-swipe navigation remains available.
The visible Comments button beside Close opens the shared thread in the existing native Sheet, matching web's phone layout.
The sheet uses BottomSheetTextInput for keyboard handling. Read-only notes show the thread without a composer.
The standard ghost Button makes the title pencil actionable and focuses the existing name input; pencil and close use foreground contrast.
A link sheet captures the selected
range before blurring. Metadata uses canEdit for rename, isNoteOwner for visibility, and canDelete for confirmed deletion.
Deleting a comment opens a native confirmation with the web's shared wording before invoking the shared delete handler.
Creation offers only server-returned visibilities. Read-only notes expose no editor, toolbar, or comment composer.

`noteRead.ts` validates note access and page membership before recovering an offline draft. A confirmed denial retires the draft even when the other read fails.
`stores/noteDraftStore.ts` owns one controller per account/note. Mounted editors acquire and release it; closed clean controllers leave memory, while pending drafts survive until saved. `noteDraftStorage.ts` supplies AsyncStorage, subscribable
account activation, and a live-session dispatch fence. `providers/NoteDraftProvider` connects AppState and Query online
and focus managers. Ordered, coalesced writes use `carlnotes.note-drafts.v1:` independently of the feed build identity.
Pending text survives route unmount and cold restart after storage completes. A storage failure is visible and keeps
text in memory; it cannot promise survival after process termination. Unknown schemas are left untouched.

Recover an offline note from Local drafts on its Topic or Team. Uncached notes and creation need a connection. Reconnect checks
permissions before retrying open or closed drafts, at their original base version. A conflict remains durable and stops
transport until deliberate Reload succeeds. Failed Reload and transport failures preserve text. Successful sign-out,
account replacement, revoked editing access, and accepted deletion retire controllers and remove the affected drafts.
Failed sign-out or deletion preserves them. App or route unmount alone never clears drafts.

Rollback requires a compatible rebuilt runtime because enriched HTML is native code. Preserve the draft prefix and
schema when reverting JS; never clear AsyncStorage as a rollback step. Older clients that do not understand a newer
schema must leave its bytes intact. Finish pending saves or copy text before deliberately signing out or uninstalling.

The shared badge hook refreshes on open, foreground, reconnect, and every 45 focused online seconds. Failed reads keep
confirmed counts; failed note opens never acknowledge a read. Native badges expose actual counts to accessibility and
explain edits/comments on tap or long press. The visible count caps at 9+.

Recaps use `safeNoteMarkdown` and `markdown-to-jsx/native` to render the same transformed tree as web. Keep raw HTML
inert, drop images, and allow only exact stored HTTP(S) Finding URLs. Headings one through six use the compact display
role. Findings stay before the page recap; Topic roast places its recap after the prompt. Diary Source footnotes and
permitted timing/cost details keep their shared composition. This supersedes Prompt 45's enriched-markdown proposal.
A Finding inspection is not a source open. Only explicit source links/previews and the first actual inline play record
one. `common/ShareMarkdownButton` shares the same `toNotesMarkdown` content as Copy through the native sheet; every
outcome leaves the Finding and its feedback mounted. `ScrollBox` supplies an action row for both accessible controls.

## Native menu pages, forms, and footer

`app/profiles/[userId].tsx`, `app/teams/index.tsx`, `app/teams/[teamId].tsx`, `app/activity.tsx`,
`app/account.tsx`, and `app/plans.tsx` use `layout/PageScreen`. It owns the reading column, compact heading/byline
spacing, filter/action toolbar, refresh, safe areas, and shared footer. The header logo opens Home and the hamburger menu opens Account and the other pages. The retained `/settings` route renders Account, and no bottom tab bar is shown. The hidden tab navigator preserves Feed/Search route state.

`table/DataTable.tsx` adapts core's table composition. `TableScroll.tsx` fixes the first column while the remaining
columns scroll horizontally. `ScrollIndicator` keeps an orange thumb visible while content overflows. Pagination
has 12 points of bottom padding. Rows remains an anchored dropdown. Small result sets hide pagination.
Domain table columns, sorting, and totals live in core. Native row actions use the existing clients and permission gates.

`topic/TopicEditorChoiceSheet` renders core's `TopicEditorChoice` in a bottom sheet, the native form of the web's
dialog: New Topic (Home, the page action menu, and the Team screen, which presets its team) and Edit topic offer "Do
it myself", which opens the form unchanged, or Carl, which opens the new-topic chat or the Topic's private chat in
edit mode (`toEditTopicChatHref`). The Team edit sheet's new topic stays the form, as on web.
`topic/EditTopicModal` uses core's Topic draft, Source editor, Team choices, and save flow. `team/EditTeamModal`
uses shared TeamFields and saveTeam. Team Up, add-to-Team, member/follower invitations, avatar selection, reporting,
and account fields stay native. Native adapters own the system time pickers and destructive confirmations.
A failed Team save retains its created identity, accepted memberships, and unsent invitations for retry.
`useTeamFields` shares name availability checks across clients and ignores replies for a changed name.
`topic/TopicAttachmentLink` opens owner downloads through `common/useDownloadedFilePreview`, which downloads with
the signed-in client, opens the native file preview, and deletes the downloaded copies when the parent view
unmounts. Attachment content reuses the safe Markdown renderer and bounded orange scrollbox, with explicit edit/done
controls. `SessionTextInput` preserves the Nightshift field border and fill when a caller changes its size. Report
issue hides its extra visible label to match web.

Every file action calls `useFilePicker` from `common/FilePickerMenu` with the action's accept list from
`@carlnotes/contracts/attachmentTypes`. An action that takes images offers Photo library, Take photo, and Files in a
`Sheet`; one that takes no images opens Files directly. The photo library asks for no permission, and the camera asks
only when Take photo is picked and takes photos alone. With camera access off, a notice offers Open Settings. A pick
that returns after the account changed is dropped. `src/pickedFiles.ts` turns picker assets into one `PickedFile` shape,
and `common/pickedFileCache` resizes an image through core's `toResizedImage`, re-encoding without EXIF (PNG for a
source that can be transparent, JPEG otherwise), deletes picked copies, and empties the picker, resizer, and preview
caches from `_layout` at launch and on an account change. `chat/useChatAttachments` binds core's hook to
`expo-file-system` reads and `showClientError`, resizes photos before the read, and deletes each picked copy once the
draft holds its data url. `topic/TopicAttachmentEditor`'s `TopicAttachButton` (the prompt's paperclip and the "add an
attachment" link) stages Topic files from the shared Topic accept list, resized, and rejects one over
`TOPIC_ATTACHMENT_MAX_BYTES` with the api's own `TOPIC_ATTACHMENT_TOO_LARGE_LINE` before it uploads. A staged copy is
deleted on remove, after its upload, and when the form closes. `avatar/avatarUpload`'s `useAvatarPicker` serves the user
avatar, the Team screen's avatar, and the Team edit sheet: images only, re-encoded at the web's 512-pixel rule, and sent
as the multipart `avatar` field.

`account/AccountBudget`, `AccountFields`, and `PlanCard` adapt shared compositions. Account pause checkpoints use
server-provided cutoffs and core's budget calculations. An admin without a budget override has no pause checkpoints.
`avatar/UserAvatarPicker` reveals its camera overlay on the first tap; the next tap opens the picker menu.
`font-display` uses Architects Daughter and `font-sans` uses Karla from Nightshift's generated Uniwind font tokens.
The Text primitive supplies a default class, without an inline family overriding a selected type role.

`layout/Footer` adapts `core/components/Footer` in scrolling page content. Its words and links match web. Compact links
retain native hit slop. Privacy, Terms, License, docs, Releases, Source Code, and Nightshift use existing web
destinations in iOS's dismissible browser sheet. Android uses its browser custom tab. Note editors and modal forms,
sign-in, and sign-up keep their focused layout without a footer. Session prompts center vertically beside their links
while retaining native touch targets. Plans are bought through the store, and a paid plan is managed where it is billed,
as Store payments describes. Admin retains its explicit web handoff.

Topic loading uses `core/components/TopicSkeleton` with the web section order, native card shapes, and a pulse that
stops for reduced motion. Known Topic names stay visible, and a known Topic without a podcast omits its player.
The initial loading scroll area fills the available content space. A separate footer scroll area is mounted only
after loading ends, so it cannot squeeze the skeleton. `TopicFeedStatus.stories.tsx` covers loading and retry states.

`layout/PageSkeleton` uses the same core composition and utility classes as web for Profile, Teams, Activity,
Account, and Team. `common/SkeletonPulse` shares native reduced-motion behavior with Topic loading. Placeholders
expose one busy accessibility label and hide decorative descendants. Loaded pages remain visible during refresh.
The PageSkeleton stories mirror the web story names, including the separately loading Profile topics table.

## Menu parity audit

`search/PageActionMenu.tsx` and web's same-named adapter render core's `PageActionMenu`: page options, New topic
when the page has no equivalent button, Add to AI, then Report issue. Pull-to-refresh remains on the page.
`layout/UserMenu.tsx` uses core's `UserMenuItems` for destinations, grouping, selection, and Admin visibility.
`common/AddToAiDialog.tsx` uses core's `AddToAi` for provider ordering, instructions, and copy feedback. Platform
adapters supply icons, storage, clipboard, and presentation. Cursor and VS Code offer copyable setup on a phone;
the web retains desktop install links. The production MCP URL is used on mobile.
`common/ChoiceSelect.tsx` supports Lucide icons for both the selected value and options. Topic visibility matches
web's Lock, Globe, and Mail. Sharing a Topic opens the native report form instead of a browser handoff.
The Account route uses `useAccount` from core, so a partial or failed budget load never shows incomplete totals.

## Live counts, badges, and visitor access

The root layout mounts core's `useUpdateBadges` once for the signed-in account: every 45 seconds while the app is in
the foreground and online it reads the chat mention count and the waiting topic invitations, reloads the chat rooms
into `chatRoomStore` when the count changes, and drops a response from a replaced account. `useNoteBadges` keeps its
own 45-second poll in `NoteDraftProvider`. `common/UpdateCountBadge.tsx` adapts core's `updateCounts`: one summed
count on `common/CountBadge.tsx`, the web's screen reader text as the accessible label, a press that follows the
badge's destination, and a long press that lists each group under its heading in a sheet, the tooltip's native
replacement. `MenuTriggerUpdateCountBadge` sits on the hamburger, decorative, with the button's name reading the
count. `PageUpdateCountBadge` sits beside a Topic or Team name and opens its chat room through `chatNavigation.ts`'s
`toChatRoomHref`, which names the team room with `chatTeamId`. The placements are the web's: the menu button, the
Profile, Teams, and Activity items, the chat launcher pill, the room choice list, the Topic and Team headers, the Feed's
Topic cards, the name links in tables, the Activity and Teams titles, and the profile avatar. `appIconBadge.ts` puts
the same sum on the app icon, the web tab title's counterpart. It never asks for a permission: iOS badges the icon
once the notification permission allows the badge, and a push never sets the count. A signed-in, focused Topic screen
sends about five requests a minute: the counts
once a minute, and the mention count, the invitations, and the note badges every 45 seconds, plus a room list reload
when the mention count changes. `apiRequestSettings.ts` leaves the session cookie off a call that asks for
`credentials: "omit"`, the public counts reads, so the edge shares them with a signed-in app too.

A visitor's Home shows `layout/HomeHero.tsx`, the phone web's hero from `core/lib/homeHero.ts`, which scrolls with the
search bar and the tags as the feed's list header, under the pinned brand row. A user's search bar and tags stay pinned. Every account action
a visitor presses goes through `openSessionScreen` with the web's cta from `core/lib/signupPrompts.ts`, which the
sign-up screen shows as its first line, and the screen they left opens again once the session arrives in this
process. `topic/TopicGateNotice.tsx` is the invite-only gate on the Topic and Podcast Episode screens. The chat
launcher shows for a visitor and opens `NoConversationSheet`, the web's `NoConversationPanel` as a sheet. `invite/[token].tsx` accepts an
invitation the way the web page does, with `invite/InviteNotice.tsx` for its states, and `carlnotes://invite/<token>`
opens it. The reviewed inventory of web-only capabilities, the components each app builds on its own, the page and
action inventory, and the roles each action is to be verified with are in [parity.md](parity.md).
`scripts/check-client-parity.ts` reads its web-only capabilities in preflight. `scripts/check-component-parity.ts`
reads its Separately built components table, and fails on a component both apps define under one name that does not
render or adapt its same-name component in `packages/core/components/`, unless a row lists it with its kind and
reason. A change that shares such a component removes its row in the same change.

## Push notifications

Push is a delivery beside the topic scan email and the badges, with no web counterpart. `pushPermission.ts` reads the
permission (`pushRules.ts`'s `toPushPermission` reads an iOS grant without alerts as refused), makes the Android
channels `topic-scans` and `chat-mentions`, asks for alerts, sounds, and
the badge, and owns the in-context sheet: `offerPushPermission` opens it after a follow in `TopicPageActions` or
`TopicSubscriptionsTable` and when `ChatRoomPanel` mounts, only while the phone was never asked and never showed the
sheet (`push-permission-sheet-shown` in SecureStore). Nothing asks at launch. `pushRegistration.ts` registers the Expo
push token for the signed-in session through `pushClient.sendPushDevice`, again on each session and token change,
keeps the token in SecureStore (`push-token`) so a rotation names the old one, retries a failed registration on each
return to the foreground, and `useSignOut` unregisters it and forgets it before `exitSession` signs out, ignoring a
failure, since the session's end deletes the binding on the server anyway.
`components/push/PushNotifications.tsx` is mounted at the root: it registers, opens a tapped push through
`pushNotificationRouting.ts` (the push's site link through `toLinkedPath` for the account it was sent to, and Home for
anything else) from the foreground, the background, or a cold start, and hides the banner of a push for the screen on
display. `PushPermissionSheet` there renders `PushPermissionPrompt` with the shared `Sheet` and `Button`. Account's
Notifications section is core's `NotificationsSection` through the `Switch` account field element, with
`Linking.openSettings()` after a refusal.

Release: push needs a store build, since the plugin adds the iOS push entitlement. Set `EXPO_PUSH_ACCESS_TOKEN` in
Doppler before turning on enhanced push security in the Expo dashboard, upload the FCM V1 service account key with
`eas credentials`, and set the `GOOGLE_SERVICES_JSON` EAS file variable that `app.config.ts` reads. The push rows of
`store/release-checklist.md` and the push token row of `store/data-inventory.md` cover the store forms.

## Store payments

The app sells plus and premium as in-app subscriptions through RevenueCat on every storefront, and never opens Stripe
checkout or the portal. `src/storePurchases.ts` is the store adapter over `react-native-purchases`: it configures
RevenueCat once at launch with an anonymous id and the build's public key (`EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` or
`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`), logs in with the billing state's `revenueCatAppUserId` before each purchase
and restore, logs out from `_layout`'s account effect once no one is signed in, reads the offering and the storefront
the store account buys from, buys or switches a plan (on Google with the replaced product), restores purchases, and
opens where a paid plan is managed. User changes, purchases, and restores run one at a time in the order they started.
Each purchase and restore then calls `POST /billing/store/sync`, and `hooks/useStoreBilling.ts` writes the billing state
it returns into the account's queries and refreshes the session. `src/storeProducts.ts` holds the pure package and price
mappings, tested in `storeProducts.test.ts`.

Every entry point reads core's purchase offers: `usePurchaseOffers` from `core/stores/purchaseOffersStore`, which takes
the billing state that Account already has. `src/storePurchases.ts` records the store's offering there. Before the
store's offering loads, in a build without the key, and with an offering that lacks a plan, every entry point is
read-only. A Stripe subscriber reads "Your plan is billed on the web." with no link, and a store subscriber's Manage
plan opens the store's subscription page. The entry points are the Plans screen, Account's Upgrade and Manage plan, the
failed-payment notice, the spend meter, the chat budget notice and the spoken answer's budget alert, the Topic-limit
notice, the scan failure's Upgrade, the scan button's daily quota alert, the settings card's paused frequency, the edit
sheet's daily allowance, plan-limited frequency, and podcast upgrade line, and the paused mic. A notice takes
`canPurchase` as a prop so its stories show both states, and its parent reads the offers. `account/PlansLink` is the
app's one plans link.

Account's settings show Restore purchases in a build with the key, and a store subscriber's Close your account section
names the store, since closing the account cannot cancel a store subscription. The device checks are the Store
purchases rows of `store/release-checklist.md`.

## Telemetry

`src/visitAnalytics.ts` sends the web visit event names through the native PostHog SDK. Screen paths, URL fields, and public Topic attribution use `contracts/reportedPath` and `contracts/visitAnalytics`. Anonymous identifiers and queues live only in memory. Person profiles, replay, autocapture, and remote feature flags are disabled. Backgrounding flushes the queue. `deviceTelemetry.ts` supplies platform, OS version, device model, and app version/build to both visit events and API/auth headers. These descriptions never grant access.

`src/monitoring.ts` configures Sentry crash reporting, Expo Router render-error handling, and sampled navigation timing. `monitoringRedaction.ts` builds on the shared content redaction and removes native request bodies, headers, user identity, and navigation params. Development events carry a development environment. SDK source maps retain the existing Expo plugin configuration. `Common/TelemetryCheck` is a development-only, explicit send-and-flush check. Dashboard verification remains separate.

The system browser sheet has a separate cookie store from the native SecureStore session. Admin and hosted account flows can require web sign-in. Do not copy session cookies into a browser URL or claim automatic sign-in.

`hooks/useTopicScan.ts` adapts core's serialized scan polling to route focus, app activity, and connectivity. It refreshes only the Topic page and shares web's backoff.
