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
| `chatClient.sendDeleteKeptAttachment` | deferred | Prompt 53, new-topic chat, attachments, and shared mobile pickers |
| `chatClient.toChatAttachmentUrl` | deferred | Prompt 53, new-topic chat, attachments, and shared mobile pickers |
| `chatRoomClient.sendDeleteChatRoomAttachment` | deferred | Prompt 53, new-topic chat, attachments, and shared mobile pickers |
| `chatRoomClient.toChatRoomAttachmentUrl` | deferred | Prompt 53, new-topic chat, attachments, and shared mobile pickers |
| `topicClient.uploadTopicAttachment` | deferred | Prompt 53, new-topic chat, attachments, and shared mobile pickers |
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
| `teamClient.sendTeamAvatar` | web-only | The browser's File upload. The app uploads to the same route through `teamClient.sendTeamAvatarBody` |
| `voiceClient.fetchSpokenAnswerAudio` | deferred | Prompt 54, voice in the mobile chat and the podcast question |
| `voiceClient.fetchSpokenQuestionsStatus` | deferred | Prompt 54, voice in the mobile chat and the podcast question |
| `voiceClient.sendSpokenEvent` | deferred | Prompt 54, voice in the mobile chat and the podcast question |
| `voiceClient.sendSpokenQuestionEvent` | deferred | Prompt 54, voice in the mobile chat and the podcast question |
| `voiceClient.sendTranscription` | deferred | Prompt 54, voice in the mobile chat and the podcast question |

Deferred work with no api capability of its own yet: push notifications (Prompt 52), which will move the app icon badge
off the foreground poll, and store payments (Prompt 55), which decides what the native Plans screen's checkout opens.
The web's document title count has the app icon's badge as its counterpart, so it is not web-only.

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
| Account, Settings | `account.tsx`, `(tabs)/settings.tsx` | component | `AccountBudget`, `AccountFields`, `BlockedUsersSection`, `PlanCard` from core, and the Contact entry |
| Report and block | `common/ReportIssueDialog.tsx` from the message and comment footers, note management, and the profile menu | component, logic | the shared report, the block switch, the hidden quote, and the blocked content filters from core |
| Terms acceptance | `session/TermsAcceptanceSheet.tsx` at the root | component | core's `TermsAcceptanceNotice` in a sheet, with Not now putting it off until the next rejected write |
| Plans | `plans.tsx` | component | the shared plan cards, open to a visitor with the recommended plan highlighted |
| Invite | `invite/[token].tsx`, `invite/InviteNotice.tsx` | logic | the rejection copy and the follow-ups from `core/lib/inviteRejections.ts` |
| Login, Signup | `sign-in.tsx`, `sign-up.tsx` | logic | Google, GitHub, and Apple, the prompts from `core/lib/signupPrompts.ts` |
| Chat panel and rooms | `chat.tsx`, `topics/…/chat.tsx`, `teams/…/chat.tsx` | component, logic | the shared turn and bubble compositions, the room list from the shared store |
| Chat launcher | `chat/AppChatPanel.tsx` | component | the shared `ChatPill`, the visitor's sign-up sheet |
| Tasting Notes | `…/notes/[noteId].tsx` | component | the shared editor, viewer, comments, and badges |
| Update badges | `common/UpdateCountBadge.tsx` | logic | the sum, labels, and groups from `core/lib/updateCounts.ts`, a long-press sheet for the tooltip |
| Admin | none | web-only | Admin opens the web from the menu, and its browser session can need its own sign-in |
| MCP consent | none | web-only | an AI client's OAuth consent, opened in a browser |
| Privacy, Terms, License | none | web-only | the footer opens the web pages in the browser sheet |
| Reset password | none | web-only | the sign-in screen's Forgot password opens the web's reset page |
| Not found | the router's own screen | native | Expo Router's unmatched route |

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
