## Why

PostHog gets nineteen server events from `shared/analytics.ts`, keyed to a user, and one anonymous page view per route
from `ui/src/lib/visitAnalytics.ts`, with every path rewritten to its route's shape. That answers the signup funnel
and little else. It cannot say which topics and podcast episodes are popular, who uses chat, who creates topics,
makes teams, or subscribes, what a bot or an AI agent does on the site, or whether anyone adds a podcast feed to an
app. The homepage's Popular section ranks by subscriber count because no view count exists, and no topic id reaches a
visit today, so even a public topic's readership is unknown.

Some of a public page's content is also out of reach to a reader without JavaScript: a homepage card's "+ N more" is a
button that does nothing, and the homepage's closed section is hidden until a script opens it.

## What Changes

- **Three populations, never joined.** Visits are the browser's anonymous, cookieless events. Users are server events
  keyed to a user id. Bots and agents are server events keyed to a bot's or an app's name, sent with
  `$process_person_profile` false so they never create a person profile. Every server event has an `entryPoint`:
  `web`, `mcp`, `email`, `feed`, `worker`, or `webhook`. `plan` and the device properties stay where a request exists,
  `topicId` stays on topic-anchored events, and `teamId` and `isTopicPublic` join where the route already holds them.
  No route a user waits on runs a query for an event. Properties stay short identifiers, never content, never an
  invite or a podcast feed token. Self-host still ships with zero telemetry when the keys are unset.
- **Visit events** with a `visit_` prefix, so no name is shared with a server event: `visit_topic_viewed`,
  `visit_episode_played`, `visit_episode_completed`, `visit_finding_clicked` (the source's host),
  `visit_cta_clicked` (the slug signup already uses), `visit_share_clicked` (kind, channel), and
  `visit_podcast_subscribe_clicked`. `topicId` and `episodeId` are sent only on a public topic's events. A profile,
  invite, team, or private topic id never does. Nothing typed is sent, and every event passes through the existing
  `before_send` rewrite. Cookieless mode, person profiles set to never, no autocapture, and no session recording stay.
- **User events** across the product: `login_completed`, `checkout_started` with `checkoutPlan`,
  `subscription_started`, `plan_changed`, `subscription_canceled`, `topic_updated` with `changedFields`,
  `source_added`, `source_removed`, `attachment_added`, `sources_suggested`, `scan_completed`, `scan_stopped`,
  `finding_feedback_sent`, `topic_subscribed`,
  `topic_unsubscribed`, `email_digest_toggled`, `email_unsubscribed`, `podcast_toggled`, `episode_played`,
  `episode_completed`, `podcast_feed_added`, `podcast_feed_reset`, `chat_turn_sent` with `chatKind`,
  `room_message_sent`, `team_created`, `team_deleted`, `invite_accepted`, `invite_declined`, `team_join_requested`,
  `team_join_approved`, `team_member_removed`, `team_topic_added`, `team_topic_removed`, `note_created`,
  `note_comment_added`, `note_thread_resolved`, and `content_flagged`. The add-source and remove-source Topic Tools
  emit `source_added` and `source_removed` instead of `topic_edited`, which stays for the prompt and field edits.
- **Bot and agent events**: `mcp_connected`, `mcp_tool_called`, `crawler_fetched`, `link_unfurled`, and
  `feed_fetched`, classified from a named, tested list in `shared/userAgent.ts`. An unknown user agent emits nothing.
  The events the MCP tools already emit have `entryPoint` `mcp`.
- **The `monitoring-analytics` spec is rewritten** to this taxonomy: the fifteen-event requirement is replaced, and the
  browser requirement's "one page view and nothing else" becomes page views plus the named visit events. The privacy
  page's analytics lines say what visits and events collect now.
- **No-JS expanders.** A homepage card keeps its five rows, and without JavaScript its "+ N more" is a plain link to
  the topic's page. The homepage's closed section shows without JavaScript. Every JavaScript-only toggle on a public
  page is audited: without JavaScript the content shows in full and the toggle is hidden, or the toggle is a working
  link. Readers with JavaScript see no change. The topic page's findings list already renders up to fifty rows with the
  extras hidden by JavaScript, from the `seo-crawl-cleanup` change, and the scan recap's "Read more" already shows
  the whole note without JavaScript, since its clip is measured by a layout effect.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `monitoring-analytics`: the fifteen-event taxonomy becomes three populations with the named visit, user, and bot
  events, `entryPoint` on every server event, and bot events that create no person profile. The browser requirement
  names the visit events it sends beside the page views.
- `feed-homepage`: a card's "+ N more" is a link to the topic page without JavaScript, and a closed section shows
  without JavaScript.
- `topic-detail-page`: the scan recap's clip and its "Read more" exist only with JavaScript, so the whole note shows
  without it.

## Impact

- `shared/analytics.ts` (the event union, `entryPoint`, and the bot capture), `shared/userAgent.ts` (the bot list),
  `shared/contracts.ts` (`topicVisibility` on the episode payload the player reads),
  `api/currentUser.ts` (`entryPoint` in the request properties).
- Emit sites: `api/auth.ts`, `api/billing.ts`, `api/topic/topics.ts`, `api/topic/attachments.ts`,
  `api/topic/scans.ts`, `api/topic/findings.ts`, `api/topic/subscriptions.ts`, `api/unsubscribe.ts`,
  `api/podcast/podcastEpisodes.ts`, `api/podcast/podcastFeeds.ts`, `api/documents.ts`, `api/chat/chatTurns.ts`,
  `api/chat/room.ts`, `api/team/teams.ts`, `api/team/members.ts`, `api/invite/invites.ts`,
  `api/invite/receivedInvites.ts`, `api/note/notes.ts`, `api/note/noteCommentThreads.ts`, `api/flagContent.ts`,
  `api/tool/topicTools.ts`, `api/mcp/tools.ts`, `api/mcp/server.ts`, `api/mcp/toolCaller.ts` (the app's name and
  `entryPoint` `mcp`), `api/botAnalytics.ts` (the bot middleware, mounted in `api/index.ts`), `api/api.ts` (the preview
  card's `analyticsTopic`), `worker/workflows/runTopicScanActivities.ts`.
- `ui/src/lib/visitAnalytics.ts` and the components that capture a visit event: `TopicPage.tsx`,
  `podcastEpisodePlayerStore.ts`, `TopicResource.tsx`, `AnchorLink.tsx`, `ShareTopic.tsx`, `ShareOptions.tsx`,
  `ShareTeam.tsx`, `PodcastFeedDialog.tsx`. `PrivacyPage.tsx`.
- The no-JS expanders: `TopicFindingsSection.tsx`, `MoreButton.tsx`, `Topic.tsx`, `TopicSection.tsx`, and the
  accordion primitive's `forceMount` class.
- One migration: `episode_feed_tokens.first_fetched_at`, so a feed's first fetch by an app fires once.
- No new dependency.

## Manual PostHog steps after deploy

1. **Popular topics** dashboard: `visit_topic_viewed` by `topicId` over 30 days beside `topic_subscribed` by
   `topicId`, and `crawler_fetched` by `routeShape` to see what the bots read.
2. **Podcast listening** dashboard: `visit_episode_played` and `visit_episode_completed` by `episodeId`,
   `episode_played` and `episode_completed` by `entryPoint`, `podcast_feed_added` by `plan`, and
   `visit_podcast_subscribe_clicked` by `channel`.
3. **Signup to first scan** funnel: `signup_completed` → `login_completed` → `topic_created` →
   `first_scan_completed`, split by `plan` and by the `cta` that `signup_completed` names. `visit_cta_clicked` by
   `cta` is its own visit insight beside the funnel. Keep the three populations in separate insights, since a
   funnel across them would join a visit to a user.
