# Shared web components

## Shared Feed adapter

The Brew diary's `TopicScanRecap` and `SourceResultsChart` use shared React components in `packages/core/components/`,
along with table and section pagination, numbered Findings, safe note links, scan failures, expansion controls,
and copy feedback. Web wrappers retain DOM semantics, styles, tooltips, SSR handling, and browser APIs. Edit the
shared composition first; keep component adapters at module scope so rerenders preserve their identity.
`Pagination` uses render callbacks to retain its clicked DOM node while restoring scroll position after a page change.
Pure ordering, totals, detail copy, and Markdown construction remain in core's `lib/topicScanRecap.ts` and `sourceResults.ts`.

`providers/TopicFeedProvider.tsx` supplies the session id, visitor loader data, context, pathname reset, and Feed availability.
State, selection, reheat, and Finding actions live in `@carlnotes/core/hooks/useTopicFeedState` and `useTopicFindingActions`.
The provider preserves its consumer exports and the web's default non-optimistic timing. Topic pages keep their page reload handlers.
Matching section, sort, view, empty-state, and tutorial labels come from core.
`lib/hookTestHarness.tsx` mounts live React hooks and optional rendered state with Happy DOM and TanStack Query, then restores its globals.
`hooks/useTopicFeedState.test.tsx` verifies shared lifecycle and mutation behavior without importing native components.
`components/common/sharedComponents.test.tsx` verifies size/sort resets, control identity and focus, pagination scroll
restoration, and Source detail expansion through the real web adapters.

## Shared Tasting Note adapters

`components/note/` keeps the browser-only enriched HTML imports and DOM controls. Core owns editor initialization,
format order, captured link ranges, conflict Reload, creation validation, comments, and unread badge content.
Keep `NoteDialog` lazy imports: listing notes must fetch neither bodies nor editor chunks.
`NoteLayout` preserves the toolbar above the card and the desktop column / phone-browser comment sheet.
`providers/TopicFeedProvider` mounts `useNoteBadges`; badge polling does not depend on opening chat.
`TopicScanRecap` renders the shared safe Markdown tree directly. `SafeNoteLink` remains its final destination guard.

## Shared mobile page foundations

The Account budget/settings, plan cards, invite fields, and TeamFields delegate portable composition to core.
OwnerTopicsTable, TopicsTable, TopicScansTable, TopicSubscriptionsTable, and SentInvitesTable consume shared domain
columns through `table/DataTable.tsx`'s semantic DOM elements. Team membership/member rows retain web-specific
expandable controls. The global Footer is a core composition with web routing and active-link styling supplied here.

Topic fields, Source editing, Team choices, and Topic/Team saving now use core hooks and save functions. Web wrappers
supply browser files, routing, and toast feedback. Retries keep created identities and accepted membership writes;
unsent invitation chips remain visible. Maintain native adapters when changing any of these shared concerns.

`topic/TopicSkeleton` delegates section order to core while preserving DOM placeholders and the desktop grid.
Its exported section/player skeletons still serve PodcastEpisodePage. Stories cover unknown and known titles.

`layout/PageSkeleton` renders core's Profile, Teams, Activity, Account, and Team loading layouts. The page keeps known
headings and actions visible; Profile and Team reserve their identity while it loads. Account keeps Settings usable.
Its stories cover each page and the Profile topics table loading separately. Motion respects reduced motion.

The menu parity adapters `search/PageActionMenu`, `layout/UserMenu`, and `common/AddToAiDialog` render the shared
core menu composition. DOM popovers, badges, installation links, storage, and clipboard remain web adapters.
`AccountPage` uses core's `useAccount`, shared with mobile, for complete budget loading and retries. Teams and own
Profile topic reads offer retry after a failed initial request instead of presenting an empty table or endless skeleton.

Visit analytics reuses the contracts URL/path privacy redaction and public Topic attribution with native. Its registered device dimensions and environment match native event dimensions while preserving cookieless visits and disabled person profiles.

## Shared chat

`ScrollDownButton` adapts core's centered latest-message action and retains the browser's hover feedback.
`ChatPanelWidget` renders core's shared `ChatPill` with browser elements, preserving its portal, badge, hover, and
podcast-player clearance. `branding/CoffeeCup` reads the same Nightshift vector paths as mobile.

`components/chat/ChatAuthor`, `ChatTurnBlock`, `ChatRoomMessageBubble`, and `TopicDraftCard` are DOM element adapters
for the same-named core components. The turn's rejection uses core `ChatRejectionNotice`; web retains its plans link.
`ChatMarkdown` retains Streamdown and re-exports `safeChatMarkdown` helpers. Host portraits come from Nightshift's
shared `assets/`, also used by mobile.

`useTopicChat` injects voice, new-topic, attachment, and podcast effects into the core hook. `useChatRoom` injects
browser streaming and spoken-answer effects. `useChatRoomStream` supplies browser EventSource to the shared lifecycle
controller. `useEditableTopicDraft`, `useRoomReply`, `useLinkPreviewRefresh`, and `chatHistoryTurns` retain compatible
imports over core. Member loading is core `useRoomMembers`; mention and reply rules are core
`chatMentions`/`chatRoomReplies`. Keep these wrappers thin. `chatPanelStore` retains panel dimensions, open state, and
browser effects while core `chatConversationStore` owns account/conversation selection and proposals.


## Coffee Break

Coffee Break player/card/details/pills/controls, chapter list, episode row, season card, chat chapter tag, mini player, transcript, theme-song
credits, feed dialog, unpublished card, and removal confirmation compose the corresponding core components.
The web files retain DOM markup, responsive/SSR behavior, popovers, tooltips, the audio element, Media Session,
clipboard, and spoken-question adapters. `PodcastEpisodeSeekBar.tsx` adapts shared segments to browser pointer and
keyboard input. `UnpublishedPodcastEpisodeCard.tsx` retains browser shimmer and cover styling over shared content.
`usePodcastFeed` and `usePodcastEpisodeChapterRating` live in core; reset-private-feed now confirms before sending,
while failure retains the old link and denial clears it. Stories use shared fictional episode/transcript fixtures.
Existing playback and spoken-question regression assertions remain the compatibility gate.
`PodcastEpisodesCard` keeps server-loaded seasons and no-JavaScript rows around the shared card. Its season links use
`AnchorLink` with replace-history and retained-scroll options. Both episode tables use core's column/total definitions;
web retains its server-rendered table, while mobile uses its existing fixed-first-column table.

## Personal sources and MCP Apps views

`components/topic/TopicPersonalSourcesSection.tsx` adapts the same core section for Topic info and Artisanal Blend: flat full-item disclosures with a live item-count header, without a separate opener, popover, source grouping, or horizontal inset.

`components/primitives/expandable-row.tsx` implements the Nightshift contract and renders core's `ExpandableRow` for
item disclosures in both placements. `PersonalSourcesImportButton` and `PersonalSourcesImportDialog` render their same-name core
components; the dialog supplies DOM fields and the browser worker parser. Their stories cover the opener and explicit selection.

Personal sources stories cover the shared section in Topic info and Artisanal Blend: empty, with items, and item-expanded states, item loading/error/paging states, settings, linked Findings, and the contracted
expandable row. Loaded fixture states stay local to the stories; production reads retain the sender gate.

`PersonalSourceLink.tsx` shares authorized Finding resolution and local opening state through core. Web adapts it to the existing `TopicResourceInfo` popover; mobile uses its existing sheet. External sources retain the browser icon and only pending sources show Next brew. `core/lib/topicFindingCopy.ts` supplies the common tooltip and native accessibility hint.

`TopicInfoSection.tsx` shares labeled information-section composition through core, with thin same-name platform adapters and paired stories. Topic and Finding details reuse it without importing each other.

The Personal sources editor has no forwarding setup. Only empty Personal sources content renders the shared one-line mailbox hint and Copy. Forwarding instructions remain in docs.

Personal sources conversation links say “Open shared conversation in {platform}”, with the destination platform mark before the launch icon. Nightshift’s `Topic/TopicPersonalSourcesSection` includes `ConversationPlatforms` and individual platform examples. A missing conversation URL renders no link; an unrecognized destination uses the generic chat mark.

`components/search/SearchResultRow.tsx` adapts the core row for search and MCP selection. `TopicSearchResultDetails.tsx` adapts shared viewer/follower metadata and the existing podcast pill. Both have paired native stories; MCP replaces the rank/kind with a checkbox.


Entity icons use Lucide Coffee for Topics, Mic for Podcast Episodes, and Globe for Findings. The web search kind map, native search rows, Finding summaries, Podcast Episode pills, chapter tags, and podcast feed actions follow this convention. Media-type icons remain specific to files, video, or audio when describing a Source or attachment.

MCP views carry their connected site URL in `data-site-url` and provide it through `LinkBaseUrlContext`. They do not depend on an HTML base element, which embedded hosts can reject. Link opening remains delegated to the host. Localhost HTTP media can still be refused by a host CSP even when its storage destination is allowed; keep the playback fallback accurate and do not weaken the host policy or change localhost authentication URLs.

MCP send confirmations render one bold-title confirmation with linked Topics and flush numbered next-brew URLs.
MCP-view-only `sendConfirmationLinks` metadata carries sender-authorized waiting links, never transcripts. Preferred
resource URIs are versioned; unversioned aliases remain readable. Host link failures show an error. Expanded Personal
sources metadata uses a shared date-only layout with platform/mail icons and sender labels.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain labels.

Personal sources conversation metadata links the complete date, platform icon, and name when a real reference is supplied. Both apps consume the shared entry list and platform fixtures. A strict existing-chat Codex URI opens the system app; web references use the existing browser adapter. No entry retention sentence is shown.

MCP `TopicDraftEditor` embeds standard Topic field controls inside the MCP view, with a taller scroll area. `topicDraftSources.ts` prioritizes chat URLs, deduplicates them, and counts implicit defaults. Edited creation refreshes its signed preview before confirming the exact reviewed fields. This DOM editor is served as the same MCP App HTML on every host platform.
