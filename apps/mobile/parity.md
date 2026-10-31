# Mobile parity inventory

The web is the reference. This file is the reviewed inventory beside the checks: the api capabilities the web reaches
that the app does not, each with its reason or the prompt that owns it, the page and action inventory with how each
screen reuses the web, and the roles each action was verified with. `bun scripts/check-client-parity.ts`, in
preflight, reads the first table: a web-reachable capability missing from the app fails unless a row names it, and a
row fails once the app reaches its capability, so a shipped feature retires its row in the same change. The Nightshift
component contracts have their own check, `check-component-parity.ts`, and the reuse rules stay in the AGENTS.md files.

## Web-only client capabilities

A capability is an exported function of a `packages/client` module, named `module.function`. Status is `web-only` for a
capability the app will never need, with the reason, or `deferred` for one an active prompt owns, with the prompt.

| Capability | Status | Reason or prompt |
| --- | --- | --- |
| `authClient.passSignupGate` | web-only | The web's Turnstile gate. The app attests its install through its own signup gate instead |
| `billingClient.fetchAdminConsole` | web-only | Admin stays on the web, opened from the menu as an explicit web handoff |
| `billingClient.fetchAdminTeamMembers` | web-only | Admin stays on the web |
| `billingClient.fetchAdminTeamTopics` | web-only | Admin stays on the web |
| `billingClient.fetchAdminTopicSubscribers` | web-only | Admin stays on the web |
| `billingClient.fetchAdminUserTeams` | web-only | Admin stays on the web |
| `billingClient.fetchAdminUserTopics` | web-only | Admin stays on the web |
| `billingClient.sendDeleteUser` | web-only | Admin stays on the web |
| `billingClient.sendUserBudgetOverride` | web-only | Admin stays on the web |
| `billingClient.sendUserRole` | web-only | Admin stays on the web |
| `topicClient.sendTopicFeatureOrder` | web-only | An admin's featuring control. Admin stays on the web |
| `topicClient.uploadTopicAttachment` | web-only | The browser's File upload. The app uploads to the same route through `topicClient.uploadTopicAttachmentBody` |
| `mcpClient.fetchMcpClientName` | web-only | The MCP OAuth consent page, which an AI client opens in a browser |
| `mcpClient.sendMcpConsent` | web-only | The MCP OAuth consent page, which an AI client opens in a browser |
| `pageHeadClient.fetchInvitePageHead` | web-only | Server-rendered head tags for crawlers and link previews. The app has no document head |
| `pageHeadClient.fetchPodcastEpisodePageHead` | web-only | Server-rendered head tags. The app has no document head |
| `pageHeadClient.fetchProfilePageHead` | web-only | Server-rendered head tags. The app has no document head |
| `pageHeadClient.fetchTeamPageHead` | web-only | Server-rendered head tags. The app has no document head |
| `pageHeadClient.fetchTopicPageHead` | web-only | Server-rendered head tags. The app has no document head |
| `profileClient.sendAvatarDecodeFailure` | web-only | A browser's image decode telemetry. The system photo picker returns images the app decodes |
| `reportClient.fetchAdminReports` | web-only | The admin console's open reports. Admin stays on the web |
| `reportClient.sendReportResolution` | web-only | The admin console's Remove and Keep. Admin stays on the web |
| `billingClient.sendMobileMinimumVersion` | web-only | The admin console's minimum app version write. Admin stays on the web |
| `billingClient.fetchBillingPortalUrl` | web-only | Stripe's billing portal. The app manages a store plan on its store's subscription page, and says a Stripe subscriber's plan is billed on the web, with no link |
| `billingClient.fetchCheckoutUrl` | web-only | Stripe checkout. The app sells its plans as in-app subscriptions through the App Store and Google Play |
| `teamClient.sendTeamAvatar` | web-only | The browser's File upload. The app uploads to the same route through `teamClient.sendTeamAvatarBody` |

Deferred work with no api capability of its own yet: push notifications (Prompt 52), which will move the app icon badge
off the foreground poll. The app sells plans through its store under the storefront purchase rules in
`core/lib/storefrontPurchaseRules.ts`. Before the store's offering loads, with an offering that lacks a plan, and for a
Stripe subscriber or another store's, the Plans screen offers no purchase, a paid plan's cards open where it is managed,
and every other entry point keeps its words without the plans link. `scripts/check-purchase-paths.ts` fails an app file
that names the plans path, a purchase label, or the plans link without reading those rules. The web's document title
count has the app icon's badge as its counterpart, so it is not web-only.

## Page and action inventory

Each row names the web page, the native screen, and what the screen reuses: `component` for a `packages/core`
composition both apps render through thin adapters, `logic` for shared rules, formatting, and state under a native
renderer, and `native` for a replacement the mobile AGENTS.md names with its platform reason. Web-only pages name
their reason.

| Web page | Native screen | Reuse | Notes |
| --- | --- | --- | --- |
| Home, visitor hero | `(tabs)/index.tsx`, `layout/HomeHero.tsx` | logic | the hero copy in `core/lib/homeHero.ts`, the shimmer and the pitch sheet native |
| Home Feed | `(tabs)/index.tsx` | component, logic | the Feed rules, filters, and Finding actions from core, the list native |
| Search | `(tabs)/search.tsx` | logic | the shared search bar provider, native results |
| Topic page, Findings, scan recaps | `topics/[topicId].tsx` | component, logic | `TopicScanRecap`, `TopicSource`, `NumberedTopicFindingList` from core |
| Topic gate | `topic/TopicGateNotice.tsx` | logic | the web gate's words, Log in and Sign up returning to the Topic |
| Podcast Episode | `topics/[topicId]/episodes/…` | component | the shared player, chapters, and transcript from core |
| Profile | `profiles/[userId].tsx` | component | the shared tables and the avatar's update badge |
| Teams | `teams/index.tsx` | component | the shared membership table and the title badge |
| Team | `teams/[teamId].tsx` | component | the shared tables, the header's update badge |
| Activity | `activity.tsx` | component | the shared subscription and invite tables, the title badge |
| Account, Settings | `account.tsx`, `(tabs)/settings.tsx` | component | `AccountBudget`, `AccountFields`, `BlockedUsersSection`, `PlanCard` from core, and the Contact entry. The closing version line is native: a browser loads the current app on every visit, and an installed build names its version, build, and update for a support request |
| Update notice | `session/AppUpdateNotice.tsx` at the root | logic | the copy from `contracts/appVersions.ts` and the requirement from `core/stores/appUpdateStore.ts` on the session frame. Native alone: a browser never runs an outdated app |
| Report and block | `common/ReportIssueDialog.tsx` from the message and comment footers, note management, and the profile menu | component, logic | the shared report, the block switch, the hidden quote, and the blocked content filters from core |
| Terms acceptance | `session/TermsAcceptanceSheet.tsx` at the root | component | core's `TermsAcceptanceNotice` in a sheet, with Not now putting it off until the next rejected write |
| Plans | `plans.tsx` | component, logic, native | the shared plan cards at the store's prices, open to a visitor with the recommended plan highlighted. A free user buys and a store subscriber switches through the store where its offering holds every plan, a Stripe subscriber reads that the plan is billed on the web, with no link, the renewal line has the Terms and Privacy links under it, and the screen is read-only before the store's offering loads or with a partial offering. Shared logic: the purchase offers from core. Native: the store purchase through RevenueCat (`storePurchases.ts`) |
| none: Restore purchases | `account/AccountSettings.tsx` | native | The web sells no store plan. Apple requires a restore control for a subscription bought in the app, and the Android app shows the same control. It reads the store account's purchases and syncs them to the account |
| Invite | `invite/[token].tsx`, `invite/InviteNotice.tsx` | logic | the rejection copy and the follow-ups from `core/lib/inviteRejections.ts` |
| Login, Signup | `sign-in.tsx`, `sign-up.tsx` | logic | Google, GitHub, and Apple, the prompts from `core/lib/signupPrompts.ts` |
| Chat panel and rooms | `chat.tsx`, `topics/…/chat.tsx`, `teams/…/chat.tsx` | component, logic | the shared turn and bubble compositions, the room list from the shared store |
| Chat launcher | `chat/AppChatPanel.tsx` | component | the shared `ChatPill`, the visitor's sign-up sheet |
| Spoken questions and answers | `chat/MicButton.tsx`, `chat/RecordingBar.tsx`, `chat/SpokenAnswerButton.tsx`, `podcast/PodcastEpisodeQuestionControls.tsx` | component, logic, native | The mic, the recording bar, the play button, and the podcast question controls go into the shared composer slots, turn and bubble footers, and the shared `PodcastPlayer` and `PodcastEpisodePlayerCard` controls. Shared logic: core's `useVoiceRecording`, `useListenMode`, `useChatRoomSpokenAnswer` inside `useChatRoom`, the spoken answer store and queue, the audio cache, the notice store, and the question store and rules. Native replacements: the recorder over expo-audio (`voiceRecorder.ts`), the microphone permission (`voicePermission.ts`), the answer player over cache files (`spokenAnswerAudio.ts`, `voiceCacheFiles.ts`), the audio mode switch (`voiceAudioMode.ts`), and the notices as system alerts (`chat/chatNotice.ts`). The app has no visitor mic in the chat, and its paused mic opens Plans only where the store sells the user a plan, and says when speaking comes back otherwise |
| Tasting Notes | `…/notes/[noteId].tsx` | component | the shared editor, viewer, comments, and badges |
| Update badges | `common/UpdateCountBadge.tsx` | logic | the sum, labels, and groups from `core/lib/updateCounts.ts`, a long-press sheet for the tooltip |
| Admin | none | web-only | Admin opens the web from the menu, and its browser session can need its own sign-in |
| MCP consent | none | web-only | an AI client's OAuth consent, opened in a browser |
| Privacy, Terms, License | none | web-only | the footer on every page, Account included, opens the web pages in the browser sheet |
| Reset password | none | web-only | the sign-in screen's Forgot password opens the web's reset page |
| Not found | the router's own screen | native | Expo Router's unmatched route |
| none: push notifications | `push/PushNotifications.tsx`, `account/AccountSettings.tsx` | component, logic, native | The web has no push channel. The Notifications card is `NotificationsCard` from core through the shared `AccountFieldElements`, with the new `Switch` element rendering `PreferenceSwitch` (the web's email `Switch` on the subscriptions table is the switch reference), and the permission sheet composes the shared `Sheet` and `Button`. Shared logic: the copy in `core/lib/pushCopy.ts`, `toNotificationSwitchStates`, the push payload contracts, and the push token redaction. Native replacements: the permission read and request (`pushPermission.ts`, `pushRules.ts`), the token registration (`pushRegistration.ts`), and the tap handler (`pushNotificationRouting.ts`), which have no web counterpart |

## Roles to verify

Each action is to be exercised with the roles below on the dev api, on a development client. The pass needs a client rebuilt
with `expo-notifications`, so every cell reads `not yet verified` until that build runs. A cell names what the role sees
when it differs from the owner's view, such as a hidden control, and `not applicable` where the role has no such action.

| Action | Owner | Member, editor | Read-only follower | Leader | Admin |
| --- | --- | --- | --- | --- | --- |
| Follow and unfollow a Topic | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Start and stop a scan | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Edit and delete a Topic | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Add a Topic to a Team | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Join, leave, and delete a Team | not applicable | not yet verified | not yet verified | not yet verified | not yet verified |
| Invite a member or a follower | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Accept and decline an invitation | not applicable | not yet verified | not yet verified | not yet verified | not yet verified |
| Write, edit, and comment on a note | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |
| Post in a chat room | not applicable | not yet verified | not yet verified | not yet verified | not yet verified |
| Change the account and avatar | not yet verified | not yet verified | not yet verified | not yet verified | not yet verified |

## Rendered comparisons to run

The new states to compare with carlnotes.com at 375 pixels, in light and dark, with the result or the gap. Each state has
a React Native Storybook story; the device comparison runs on the rebuilt development client.

| State | Story | Compared |
| --- | --- | --- |
| The update badges, each group and the overflow | `Common/UpdateCountBadge` | not yet, stories only |
| The visitor hero | `Layout/Header`, VisitorHome | not yet, stories only |
| The sign-up prompts | none, the sign-up screen is a route | not yet |
| The invitation screen's states | `Invite/InviteNotice` | not yet, stories only |
| The sign-in buttons with GitHub | none, the sign-in screen is a route | not yet |
| The menu's appearance items | none, the item follows the saved choice | not yet |
| The visitor's chat sign-up sheet | none, opened from the launcher | not yet |
| The report sheet with the author's block | `Common/ReportIssueDialog`, WithAuthorBlock | not yet, stories only |
| A reply to a hidden message | `Chat/ChatRoomMessageBubble`, HiddenQuote | not yet, stories only |
| The Blocked people section's states | `Account/BlockedUsersSection` | not yet, stories only |
| The Terms acceptance sheet | `Session/TermsAcceptanceSheet` | not yet, stories only |
| The sign-up screens' acceptance line | `Session/TermsAgreementText` | not yet, stories only |
| The update notice with and without a minimum | `Session/AppUpdateNotice` | not yet, stories only |
| The Account screen's version line | `Account/AppVersionLine` | not yet, stories only |
| The read-only plan cards | `Account/PlanCard` | not yet, stories only |
| A budget failure without the upgrade line | `Topic/TopicScanRecap`, BudgetFailed | not yet, stories only |
| The Notifications section's states | `Account/NotificationsSection` | no web state to compare: the card and switch follow the web's Invitations card and email switch; stories only |
| The push permission sheet | `Push/PushPermissionPrompt` | no web state to compare: follows the Terms sheet; stories only |
| The mic idle, ringed for listen mode, and waiting | `Chat/MicButton` | not yet, stories only |
| The recording bar from silence to a full meter | `Chat/RecordingBar` | not yet, stories only |
| The play button stopped, loading, and playing | `Chat/SpokenAnswerButton` | not yet, stories only |
| The podcast mic's faces and the dock in each question phase | `Podcast/PodcastEpisodeQuestionControls` | not yet, stories only |
