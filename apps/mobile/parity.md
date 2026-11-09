# Mobile parity inventory

The web is the reference. This file is the reviewed inventory beside the checks: the api capabilities the web reaches
that the app does not, each with its reason or the prompt that owns it, the components each app builds on its own,
the page and action inventory with how each screen reuses the web, and the roles each action was verified with.
`bun scripts/check-client-parity.ts`, in preflight, reads the first table: a web-reachable capability missing from the
app fails unless a row names it, and a row fails once the app reaches its capability, so a shipped feature retires its
row in the same change. `bun scripts/check-component-parity.ts` reads the second table the same way, beside its checks
of the Nightshift component contracts. The reuse rules stay in the AGENTS.md files.

## Web-only client capabilities

Personal sources reuse: `AiAgentAccountCard`, `TopicPersonalSourcesCard`, `PersonalSourceCard`, `PersonalSourceEntryList`, `PersonalSourcesAiAgentPicker`,
and `PersonalSourcesEmailControls` are actual shared React composition. The editor mounts `TopicPersonalSources`; Topic info and Artisanal Blend mount the same sender-scoped `TopicPersonalSourcesSection`. Topic info and full items both render `ExpandableRow`, while `TopicLinkedFinding` resolves the same authorized Finding for each platform. Shared hooks own account identity, pagination, Source capacity, sender visibility, and confirmed actions.

`PersonalSourcesImportButton` and `PersonalSourcesImportDialog` share their core composition. Native controls show
the web import guidance in a sheet; the browser supplies its file parser and preview fields. `ExpandableRow` has a
Nightshift contract and matching primitive implementations; each renders `core/components/ExpandableRow`.
Native replacements are the existing Nightshift elements, link opener, system confirmation, and clipboard.
Web alone parses exports in a worker; mobile explains the web import and renders the same imported entries.
Paired stories cover the shared Personal sources section in Topic info and Artisanal Blend, empty, with items, and item-expanded; and the shared expandable row.

November 6 preflight parity: 158 paired component names, 60 using the same-name core component, and 98 documented
separate implementations (12 platform API, 22 platform difference, 64 not yet shared). All three Nightshift contracts
have matching implementations and stories. One pre-existing uncontracted primitive remains explicitly listed. The iPhone
18 Pro simulator verified both Personal sources placements, five-item paging, page-two state after closing a Finding
sheet, stored titles/full-URL fallback, and compact links. Native sign-in after rebuilding and enlarged-text rendering
remain unverified. Android was outside this review pass.

A capability is an exported function of a `packages/client` module, named `module.function`. Status is `web-only` for a
capability the app will never need, with the reason, or `deferred` for one an active prompt owns, with the prompt.

| Capability | Status | Reason or prompt |
| --- | --- | --- |
| `personalSourcesClient.sendImportConversations` | web-only | Conversation exports are parsed and explicitly selected in a browser worker. iOS and Android explain the web import and read the resulting entries through the shared Personal sources components. |
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
| `billingClient.sendAdminBlock` | web-only | The admin console's admin block of a user from reactions and comments. Admin stays on the web |
| `topicClient.sendTopicFeatureOrder` | web-only | An admin's featuring control. Admin stays on the web |
| `podcastEpisodeClient.sendPodcastEpisodeFeatureOrder` | web-only | An admin's featuring control for a podcast episode. Admin stays on the web |
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
| `reportClient.sendReportResolution` | web-only | The admin console's Remove, Block, and Clear. Admin stays on the web |
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

## Separately built components

A row names a component that both apps define under one file name, outside `src/components/primitives/`, and that
does not render or adapt the `packages/core/components/` module of that name, or a primitive that both apps keep
without a Nightshift contract. The check counts a pair as shared when every file of the name imports a value or an
`…Elements` adapter type from that core module. Kind is `platform API` for a pair whose job is a native capability,
such as audio playback, sharing, or file picking. It is `platform difference` for one whose interaction follows a
platform convention, such as hover on web and press on mobile, keyboard handling, or a native virtualized list. It is
`not yet shared` for one whose differences are leaf elements that a core component's `…Elements` adapter could supply:
a dialog or popover against a native sheet, a toast or tooltip against an Alert, or a DOM table against a native table
over shared columns. A row fails once its pair is shared, its primitive has a contract, or an app no longer defines the
name.

| Component | Kind | Reason |
| --- | --- | --- |
| `personalSourcesElements` | platform API | Adapts the shared `TopicPersonalSourcesElements` contract to DOM elements and React Native views, selectable text, links, and confirmation controls. Both apps render the same core Personal sources components. |
| `socialElements` | platform API | Adapts the shared `SocialElements` contract in `core/lib/socialElements.ts` to DOM elements and React Native views: the composer in a dialog on web and in a bottom sheet with `BottomSheetTextInput` on mobile, a native choice sheet for the chapter, the flame and mugs of a comment shared with Carl with a tooltip on web and an accessibility label on mobile, and hit slops for the touch targets. Both apps render the same core `ReactionRow`, `CommentThread`, and `CommentRow`. |
| `AccordionSection` | platform difference | Both draw a section's header the same way, the title with its count at the right and a divider only while closed, from the shared `toCountLabel`. Web is a Radix accordion item that keeps closed content in the html for a crawler. Mobile is a pressable header that the Topics tab's recycled list renders as a row of its own. |
| `AccountSettings` | not yet shared | Shares AccountFields and UserBlocksSection. The section order and close account flow could move to core, with `ConfirmDialog` or `Alert` behind an adapter and mobile's push and store restore sections passed in. |
| `AddToAiDialog` | platform difference | Shares AddToAi. Web wraps it in a dialog with install deep link anchors. Mobile uses a native sheet with copy-only desktop steps, `expo-clipboard`, and AsyncStorage. |
| `AddTopicButton` | not yet shared | Web opens a popover with an autofocused filter over topics passed in. Mobile opens a native sheet that fetches addable topics with react-query. An adapter could hold that difference. |
| `AddTopicToTeamDialog` | not yet shared | Both list the led teams with add and remove toggles. The list logic could move to core, with web's dialog and mobile's native sheet behind an adapter. |
| `AnchorLink` | platform API | Web routes through the TanStack Router `Link` or plain anchors with new tab rules. Mobile uses the expo-router `Link`, `expo-web-browser`, and `expo-linking`. |
| `AppChatPanel` | platform difference | Web runs the docked chat panel that picks rooms, private chats, and loading states. Mobile only places the chat pill and pushes to the full screen chat route. |
| `Avatar` | not yet shared | Both pick the image or the initials the same way. A core component could hold that choice, with the web span and mobile's `expo-image` with FlashList recycling as its elements. |
| `BrandIcon` | platform difference | Web draws every brand logo and the YouTube play button as DOM svg. Mobile only draws the YouTube play button with react-native-svg at the font scale. |
| `ChatAttachmentChips` | not yet shared | Both render the same removable chips with a thumbnail or icon, name, and text length. Web adds a hover tooltip and mobile adds a hit slop. |
| `ChatBudgetNotice` | not yet shared | Both show the spent budget line and the plans link. Mobile hides the link unless the store sells a plan and uses `PlansLink`. |
| `ChatComposer` | platform difference | Web builds a textarea form with Enter to send, paste and file drop, and popover file lists. Mobile builds a native `TextInput` box that stays above the keyboard. |
| `ChatMarkdown` | platform difference | Web renders replies with Streamdown and DOM links. Mobile renders with react-native-enriched-markdown and turns tables into labeled cards. |
| `ChatMessageParts` | platform API | Web plays clips in a video element and copies with the browser clipboard. Mobile copies through `CopyMarkdownButton` and shows link previews with a native `YoutubePlayer`. |
| `ChatOptionsMenu` | platform difference | Web is a popover chat room switcher with hover tooltips listing members. Mobile is an options button that opens a native sheet with only Clear behind an `Alert`. |
| `ChatPanelWidget` | platform difference | Shares ChatPill. Web docks a body portal panel with expand and minimize buttons and Escape. Mobile frames a full screen with safe areas and `KeyboardAvoidingView`. |
| `ChatRoomComposer` | platform difference | Both use the shared reply rules. Web handles autocomplete keys, paste, and file drop in a textarea. Mobile tracks the native caret and uses a `ChoiceSelect` reply picker. |
| `ChatRoomPanel` | platform difference | Web fills the docked chat panel with lazy loaded messages and a clear dialog. Mobile renders a native virtualized message list with a report sheet and a push permission offer. |
| `CoffeeCup` | not yet shared | Both draw the shared Nightshift cup paths. Web uses DOM svg with CSS steam animation. Mobile uses react-native-svg with still steam at the font scale. An svg element adapter could hold that difference. |
| `CoffeeLoading` | platform difference | Web shows the animated coffee mug beside the loading line. Mobile shows the native `ActivityIndicator` spinner beside a label. |
| `CoffeeMug` | platform difference | Web draws the mug as DOM svg with CSS steam animation. Mobile stacks react-native-svg layers and animates each steam wisp with the native `Animated` driver. |
| `CollapsibleSection` | not yet shared | Both render an open by default titled section with a note and aside beside the toggle. Web uses the Accordion primitive and mobile uses a `Pressable` with state. |
| `ConfirmDialog` | platform difference | Web renders a modal dialog with cancel and confirm buttons that wait on the action. Mobile shows the native destructive `Alert` and renders nothing. |
| `CountBadge` | not yet shared | Both render the same filled pill with `toCountBadgeLabel`. Mobile also exports a class helper for an outlined badge. |
| `EditTeamModal` | not yet shared | Shares TeamFields and the core save flow. The dialog or native sheet and the file input or native image picker could be adapter elements of one core component. |
| `EditTopicFields` | not yet shared | The scan time picker is a platform API, @react-native-community/datetimepicker on mobile and a TimePicker on web, but the rest of the fields match. The picker could be an adapter element. |
| `EditTopicModal` | not yet shared | Web edits the topic in a dialog with toasts. Mobile uses a native sheet with inline errors and the share sheet for the invite link. An adapter could hold that difference. |
| `Header` | platform difference | Web shows a desktop nav, theme toggle, sign-in links, and a hamburger menu over the hero. Mobile shows a compact brand row in a safe area with the user menu. |
| `HomeHeadline` | platform difference | Both read the headline from core homeHero. Web reveals it with stacked copies under a CSS mask wipe, and mobile with the native `ShimmerText`. Only the two sentences are shared. |
| `HomeHero` | not yet shared | Both use the copy in core homeHero. Web opens the pitch and persona credit in hover popovers. Mobile opens the pitch in a native sheet. An adapter could hold that difference. |
| `HostAvatar` | not yet shared | Both show Carl's or Vienna's portrait from the Nightshift assets. Web uses an img tag, mobile an expo-image sized to the font scale. |
| `InviteMembersModal` | not yet shared | Both wrap the app's own `TeamInviteFields` and send the staged invites. Web shows them in a dialog, mobile in a native sheet. An adapter could hold that difference. |
| `InviteUserToTeamButton` | not yet shared | Web lists the teams in a popover menu with hover tooltips and toasts. Mobile lists them in a native sheet and loads statuses with react-query. An adapter could hold that difference. |
| `JoinTeamButton` | not yet shared | Both toggle a join request with the same client calls. Only the feedback differs, sonner toasts and a hover tooltip on web, an Alert and an inline error on mobile, which an adapter could hold. |
| `MicButton` | not yet shared | Both take their state from core voiceRecordingRules and start the recording. Web adds a tooltip and a visitor signup route, mobile closes the keyboard first. |
| `MultiCombobox` | platform difference | Web filters the options in a popover dropdown with removable badges. Mobile opens a native sheet with a search field. |
| `NoteIcon` | not yet shared | Both draw the raised notebook tile. Web uses a span, mobile a View sized to the font scale. |
| `NoteLayout` | platform difference | Both fill the layout slot of core `NoteViewer`. Web puts comments in a margin column or a CSS sheet. Mobile uses a ScrollView, a native sheet, and a keyboard Done button. |
| `NoteVisibilitySelect` | not yet shared | Shares `NotesTable` labels. Both show a visibility select, or a fixed label when there is one choice. Only web's per-option hover tooltip differs, which an adapter could hold. |
| `NotesSection` | platform difference | Web shows notes in an accordion and opens them in a dialog. Mobile uses react-query with an offline state, local drafts, a native sheet to create, and a screen per note. |
| `OAuthProviderIcons` | not yet shared | Web draws the marks with DOM svg and BrandIcon. Mobile draws the same Nightshift paths with react-native-svg sized to the font scale. An svg element adapter could hold that difference. |
| `OwnerTopicsTable` | not yet shared | Both build columns with core ownerTopicsTableColumns. Web nests scan and follower subtables in a DOM table. Mobile uses a fixed-column native table and opens scans in a sheet. An adapter could hold that difference. |
| `PodcastEpisodeAudio` | platform API | Web registers an HTMLAudioElement and renders the mini player. Mobile drives expo-audio with an AsyncStorage checkpoint and AppState access checks. |
| `PodcastEpisodeChaptersTable` | not yet shared | Web builds a DOM table whose rows open a finding popover. Mobile maps core chapter columns into a fixed-column native table and opens findings in a sheet. An adapter could hold that difference. |
| `PodcastEpisodeCountsLine` | not yet shared | Web polls the listener count and flashes it when it changes. Mobile only shows a count passed in. |
| `PodcastEpisodeCover` | not yet shared | Both show the podcast episode cover over a placeholder. Web hides an img that fails to load, mobile swaps to a placeholder image in expo-image. |
| `PodcastEpisodePlayer` | not yet shared | Both pick the podcast episode with core useShownPodcastEpisode and show the same cards in a collapsible section. Mobile also waits until the screen is active and online. |
| `PodcastEpisodeQuestionControls` | not yet shared | Both drive the mic, send, and stop slots from core usePodcastEpisodeQuestionButton. Web uses tooltip icon buttons, mobile plain buttons with a spinner. |
| `PodcastEpisodesSection` | not yet shared | Both build columns with core podcastEpisodesTableColumns. Web renders a sortable DOM table. Mobile renders a fixed-column native table in a collapsible section. An adapter could hold that difference. |
| `PodcastThemeSongNote` | not yet shared | Shares `PodcastThemeSongCredits`. Web opens the credits in a hover popover, mobile in a native sheet. An adapter could hold that difference. |
| `PrivateChatPanel` | not yet shared | Both show chat messages, the topic draft card, and a composer. That content could move to core, with web's `ChatPanelWidget` and clear dialog and mobile's FlatList, mic, and file picking as adapter elements. |
| `RecordingBar` | not yet shared | Both draw cancel, a level meter, the timer, and send for a voice recording. Only the controls differ, DOM buttons on web and native Button and View on mobile. |
| `RelatedTopicsSection` | not yet shared | Web renders a DOM table through `PagedTableSection` with td cells. Mobile builds a native `TableCard` with rows and pagination inside a `CollapsibleSection`. An adapter could hold that difference. |
| `ReportIssueDialog` | not yet shared | Web opens a Dialog and reports the result with sonner toasts. Mobile opens a native `Sheet` holding a reusable `ReportIssueForm` and confirms with Alert. An adapter could hold that difference. |
| `ScrollBox` | platform difference | Web scrolls an overflow div with a CSS scrollbar. Mobile uses a gesture handler ScrollView with an animated `ScrollIndicator` for native nested scrolling. |
| `SearchBar` | platform difference | Web is a combobox with a typeahead dropdown and arrow key handling. Mobile is a TextInput that opens the search screen on submit. |
| `SearchResultsList` | not yet shared | Both list ranked results with the same kind icons, metadata line, and podcast episode pill, and reuse `TopicResource` for findings. Each builds the rows with its own controls. |
| `SentInvitesTable` | not yet shared | Shares the column definitions. Web renders a DOM `DataTable` with hover tooltips and a `ConfirmDialog`, mobile a native `DataTable` with an Alert confirmation. An adapter could hold that difference. |
| `ShareMugsIcon` | platform API | Both set Lucide's `Coffee` twice, one mirrored. Web mirrors with a class and fills with a class. Mobile mirrors a wrapping view with a transform and fills through props. |
| `ShareTeam` | platform API | Web uses the browser share sheet and web clipboard inside a Dialog. Mobile calls the React Native Share sheet and `expo-clipboard` inside a native `Sheet`. |
| `ShareTopic` | platform API | Web uses the browser share sheet and clipboard from a popover or dialog. Mobile uses React Native Share and `expo-clipboard` in a native sheet with a selectable link fallback. |
| `SortableHeader` | platform difference | Web renders a th button with a hover tooltip. Mobile renders a native Button with accessibility values and shows the tooltip on long press. |
| `SpendMeter` | not yet shared | Both draw the same bar, legend, and cutoff list from the core spendMeter lib. Only the cutoff detail differs, a hover tooltip on web and an Alert on tap on mobile, which an adapter could hold. |
| `SpokenAnswerAudio` | platform API | Web plays spoken answers through an HTML audio element and shows sonner toasts. Mobile creates an `expo-audio` player and clears voice cache files for each account. |
| `SpokenAnswerButton` | not yet shared | Both use the core `useSpokenAnswerButton` hook and show play, a spinner, or stop. Only the button and icon controls differ. |
| `TableCard` | platform difference | Web wraps a DOM table in a styled div. Mobile wraps native views and also exports `TableHeader` and `TableRow` for fixed-column native rows. |
| `TagPicker` | platform difference | Web opens a popover to filter, add, and create tags with Enter key handling. Mobile uses a native `MultiCombobox` plus a text field and an Add button. |
| `TeamInviteFields` | platform API | Both stage invites through `InviteFields`. Web passes an invite link menu that copies with toasts, mobile shares the invite link through the React Native Share sheet. |
| `TeamInvitesTable` | not yet shared | Both map team invitations to rows and render `SentInvitesTable` with the same labels. The row mapping and the delete call match. |
| `TeamLink` | not yet shared | Both link the team's avatar and name to its page. Web adds a byline label, and mobile adds the update count badge. |
| `TeamMembersTable` | not yet shared | Shares the column definitions. Web renders DOM table rows with select menus and hover tooltips, mobile a native `DataTable` with `ChoiceSelect` and `PreferenceSwitch`. An adapter could hold that difference. |
| `TeamsMembershipTable` | not yet shared | Shares the column definitions. Web renders a wide DOM table with row components, mobile a native `DataTable` with Alert confirmations and a `Sheet` for team members or topics. An adapter could hold that difference. |
| `Topic` | not yet shared | Both show the topic title link, byline, new count, share action, and tags. That header could move to core. Web adds the findings list and the note popover around it. |
| `TopicAttachmentEditor` | platform API | Web stages files from a hidden file input. Mobile picks files through a native file picker, resizes images, and uploads native file parts. |
| `TopicByline` | platform difference | Both name the team for anyone who can open its page and the owner otherwise, with the same label and avatar. Web renders the web app's `TeamLink` or `UserProfileLink`. Mobile draws one `AnchorLink` row with a 44 point touch target that opens the page on the site. |
| `TopicCountsLine` | not yet shared | Both poll `fetchTopicCounts` with `usePolledCounts` and show Viewers and Followers. Web uses `FlashingCount`, mobile uses `Count` and polls only while the topic route is open. |
| `TopicFeedSkeleton` | not yet shared | Both draw gray placeholder blocks for the section headers, topic headers, and five finding rows. Each copies its own feed layout, so a core skeleton with a block element would keep the two from drifting. |
| `TopicFindingRating` | not yet shared | Both show the same heading, box, thumbs, and thanks. Web's `Input` and mobile's bottom sheet input with native keyboard avoidance could be adapter elements. |
| `TopicFindingSummary` | not yet shared | Shares ResourceMetadata. The trigger differs, a popover on web and a Pressable that opens a native sheet on mobile, and could be an adapter element. Mobile's rank, bookmark, and `expo-image` favicon are a parity gap to settle when it moves. |
| `TopicFindingsSection` | not yet shared | Both show five findings, a `MoreButton` expander, and the core empty text. Web's `CollapsibleSection` and the hidden rows for visitors without JavaScript could stay in its adapter. |
| `TopicGateNotice` | not yet shared | Web shows the gate in a modal `Dialog` with log in and sign up links. Mobile puts the same `TOPIC_GATE_COPY` inline on the screen with buttons that open the native session screens. An adapter could hold that difference. |
| `TopicInfo` | not yet shared | Both build the same sections in the same order: owner, prompt, notes, attachments, sources, and counts. Mobile's native `Sheet` and web's source tooltips could be adapter elements. |
| `TopicInvitesTable` | not yet shared | Both map topic invites into their own `SentInvitesTable` with the core `TOPIC_INVITES_TABLE_LABELS` and send the same delete call. Only the link and text controls differ. |
| `TopicNameLink` | not yet shared | Both render the topic name link, the `PageUpdateCountBadge`, and the latest podcast episode play button. Only the link and text controls differ. |
| `TopicResource` | not yet shared | Web makes the row a `Popover` with a hover tooltip hint and a bookmark tooltip. Mobile uses a Pressable row that opens a native sheet and keeps state with FlashList `useRecyclingState`. An adapter could hold that difference. |
| `TopicResourceInfo` | not yet shared | Both show the same heading, notes, stats, and actions. Web's `PopoverContent` and mobile's native `Sheet`, share button, `expo-image` preview, and inline `YoutubePlayer` could be adapter elements. |
| `TopicScanButton` | not yet shared | Both start, stop, and block a scan with the same rules. Only the feedback differs, sonner toasts and hover tooltips on web, `Alert.alert` with a button to account or plans on mobile, which an adapter could hold. |
| `TopicScanHistory` | not yet shared | Web opens each scan note in a popover and confirms source removal with a `ConfirmDialog` and `sonner`. Mobile opens a native `Sheet` and confirms with `Alert.alert`. An adapter could hold that difference. |
| `TopicScansTable` | not yet shared | Both use the core `toTopicScansTableColumns`. Web opens the scan recap in a popover on a DOM table, and mobile opens it in a native `Sheet` on its own native `DataTable`. An adapter could hold that difference. |
| `TopicSettingsCard` | not yet shared | Both build the same settings card: frequency, max findings, visibility, sources, cost, and podcast. Web shows a tooltip on the paused note, and mobile shows a `PlansLink`. |
| `TopicSourceEditor` | not yet shared | Both run the core `useTopicSourceEditor` and render the same default and custom source rows. Web uses a Radix `Select` and `Input`, mobile uses `ChoiceSelect` and `SessionTextInput`. |
| `TopicSubscriptionsTable` | not yet shared | Both use the core `toTopicSubscriptionsTableColumns` with the same switch handlers. Web's `ConfirmDialog` and sonner, and mobile's `Alert.alert` and push permission offer, could be adapter elements. |
| `TopicTeamSelect` | not yet shared | Both render the team multiselect, the new team name, `TeamInviteFields`, and a Public switch from the core `useTopicTeamChoice` field. Each uses its own controls. |
| `TopicTutorialVideoDialog` | not yet shared | Web plays the tutorial in a modal `Dialog` and also exports the menu option and link button. Mobile plays it in a native `Sheet`. Both use `YoutubePlayer`. An adapter could hold that difference. |
| `TopicsTable` | not yet shared | Both use the core `toTopicsTableColumns` and `useTopicEmails`. Web opens the topic info in a popover with a hover tooltip, and mobile opens it in a native `Sheet`. An adapter could hold that difference. |
| `UpdateCountBadge` | platform difference | Web lists the waiting updates in a hover tooltip. Mobile follows the link on press and lists the updates in a native `Sheet` on long press. |
| `UserAvatarPicker` | platform API | Web picks the photo with a hidden file input and drag and drop. Mobile picks it through `expo-image-picker` and `expo-document-picker` from `useAvatarPicker`. |
| `UserMenu` | not yet shared | Shares UserMenuItems. Web opens a popover dropdown from the avatar. Mobile opens a native `Sheet` from a menu button, adds the theme menu, and shows log in and sign up when signed out. An adapter could hold that difference. |
| `UserProfileLink` | not yet shared | Both render the user's avatar and username as a link to their profile. Only the link, avatar, and text controls differ. |
| `YoutubePlayer` | platform API | Web plays the video in an iframe after a click on the thumbnail. Mobile plays it with `react-native-youtube-iframe` in a WebView and stops when the app leaves the foreground. |
| `select` | platform difference | Web wraps the Radix `@radix-ui/react-select` DOM listbox. Mobile wraps `@rn-primitives/select` in a native overlay with a scroll view that moves the menu above the keyboard. |

## Page and action inventory

Each row names the web page, the native screen, and what the screen reuses: `component` for a `packages/core`
composition both apps render through thin adapters, `logic` for shared rules, formatting, and state under a native
renderer, and `native` for a replacement the mobile AGENTS.md names with its platform reason. Web-only pages name
their reason.

| Web page | Native screen | Reuse | Notes |
| --- | --- | --- | --- |
| Home, visitor hero and the headline on both faces | `(tabs)/index.tsx`, `layout/HomeHero.tsx`, `layout/HomeHeadline.tsx` | logic | the hero copy in `core/lib/homeHero.ts`, the shimmer and the pitch sheet native |
| Home, the featured cards and the user's topics as cards | `(tabs)/index.tsx` | component, logic | the faces and the card sections from `core/lib/homeFaces.ts`, `TopicCard` and `PodcastEpisodeCard` over the shared card elements, the sections native in `AccordionSection`. Pull to refresh and the logo's reheat read the home payload again, and a failed read shows `LoadFailedNotice` with Try again in place of the cards |
| Topics tab, the Feed | `(tabs)/topics.tsx` | component, logic | the Feed rules, filters, and Finding actions from core, the list native, pull to refresh and the logo's reheat |
| Search | `(tabs)/search.tsx` | logic | the shared search bar provider, native results |
| Topic page, Findings, scan recaps | `topics/[topicId].tsx` | component, logic | `TopicScanRecap`, `TopicSource`, `NumberedTopicFindingList` from core |
| Topic gate | `topic/TopicGateNotice.tsx` | logic | the web gate's words, Log in and Sign up returning to the Topic |
| Podcast Episode | `topics/[topicId]/episodes/…` | component | the shared player, chapters, and transcript from core |
| Reactions and the comment thread on a Topic, a Podcast Episode, and a Finding | `topic/TopicPageContent.tsx`, `podcast/PodcastEpisodeScreen.tsx`, `topic/TopicResourceInfo.tsx` | component | `ReactionRow` from core in each header, beside the byline on a Topic, below the description on a Podcast Episode, and below the domain and podcast button on a Finding, and `CommentThread` from core through `social/socialElements.tsx`, in core's `SocialSection` card on a Topic and a Podcast Episode, with the shared comment slots at the card's top right. Each comment has its own reactions, Reply, the share flame, and its replies. The composer opens in a bottom sheet above the keyboard, and the chapter choice is a choice sheet. The Finding's flag and the Podcast Episode's report use the report sheet |
| Profile | `profiles/[userId].tsx` | component | the shared tables and the avatar's update badge |
| Teams | `teams/index.tsx` | component | the shared membership table and the title badge |
| Team | `teams/[teamId].tsx` | component | the shared tables, the header's update badge |
| Activity | `activity.tsx` | component | the shared subscription and invite tables, the title badge |
| Latest Brews | `(tabs)/index.tsx`, `topic/UpdatesList.tsx`, `topic/UpdatesButton.tsx` | component | `UpdatesList` and `UpdatesButton` from core, the feed's `TopicResource` rows, a native sheet for the lengths |
| Account, Settings | `account.tsx`, `(tabs)/settings.tsx` | component | `AccountBudget`, `AccountFields`, `UserBlocksSection`, `PlanCard` from core, and the Contact entry. The closing version line is native: a browser loads the current app on every visit, and an installed build names its version, build, and update for a support request |
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

Each action is to be exercised with the roles below on the dev api, on a development client. The pass needs a client
rebuilt with `expo-notifications`, so every cell reads `not yet verified` until that build runs. A cell names what the
role sees when it differs from the owner's view, such as a hidden control, and `not applicable` where the role has no
such action.

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

The new states to compare with carlnotes.com at 375 pixels, in light and dark, with the result or the gap. Each state
has a React Native Storybook story; the device comparison runs on the rebuilt development client.

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
| The reaction row on a Topic and in a Finding's sheet, as a visitor | `Social/ReactionRow`, WithReactions and Visitor | not yet |
| The reaction picker with the user's own type | `Social/ReactionRow`, OwnReaction | not yet |
| The comment thread on a Topic and in a Finding's sheet, as a visitor | `Social/CommentThread`, WithComments and Empty | not yet |
| A signed-in save of a type, a comment written in the sheet, and its delete | `Social/ReactionRow`, `Social/CommentThread` | not yet |
| The report sheet from a hot take's flag | `Common/ReportIssueDialog`, WithAuthorBlock | not yet |
| Both components at the largest text size | `Social/ReactionRow`, `Social/CommentThread` | not yet |
| A reply to a hidden message | `Chat/ChatRoomMessageBubble`, HiddenQuote | not yet, stories only |
| The Blocked people section's states | `Account/UserBlocksSection` | not yet, stories only |
| The Blocked link and its section scroll | `Account/ProfileSummaryLine`, `/account?section=blocked-people` | not yet, stories only. The web opens the section at `/account#blocked-people`. The app has no hash anchors, so `PageScreen` scrolls to the section from the route's `section` param |
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