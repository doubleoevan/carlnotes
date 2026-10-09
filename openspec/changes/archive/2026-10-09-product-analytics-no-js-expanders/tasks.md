## 1. No-JS expanders

- [x] 1.1 Give `MoreButton` an optional `noScriptHref`: with one, the button takes `SCRIPTED_ONLY_CLASS` and a plain
  `AnchorLink` to the href takes `SCRIPTED_HIDDEN_CLASS`. The homepage card passes `toTopicPath(topic)` through
  `TopicFindingList`, and the topic page passes nothing. Cover it in `-homeRoute.test.tsx`
- [x] 1.2 Change the accordion primitive's `forceMount` class to `scripted:data-[state=closed]:hidden`, so a closed
  homepage section shows without JavaScript, and update the closed-section test in `-homeRoute.test.tsx`
- [x] 1.3 Record the toggle audit's result in the design's table, confirming the scan recap renders whole on the server
  in `-topicRoute.test.tsx` with a long note and no "Read more"

## 2. The entry point property and the three populations

- [x] 2.1 Split `shared/analytics.ts` into `UserAnalyticsEvent`, `BotAnalyticsEvent`, and `VisitAnalyticsEvent`, add
  `AnalyticsEntryPoint` and `trackBotEvent(event, botName, properties)` with `$process_person_profile` false, and test
  that a bot capture sends the flag and that no key means no client
- [x] 2.2 Add `entryPoint: "web"` to `toAnalyticsProperties` in `api/currentUser.ts`, pass `entryPoint` `mcp` from
  the MCP tool adapter's properties in `api/tool/topicTools.ts` and `api/mcp/tools.ts`, and `worker` with the plan in
  `finishScan`

## 3. Subscriptions

- [x] 3.1 Emit `topic_subscribed` and `topic_unsubscribed` with `subscriptionSource` (`page`, `invite`, or `team`)
  from `setTopicSubscription`, `activateSubscription`, and the team join fan-out, `email_digest_toggled` with
  `isEnabled` from `setSubscriptionEmailEnabled`, and `email_unsubscribed` with `entryPoint` `email` from
  `api/unsubscribe.ts`, keyed to the subscription row's user

## 4. Podcast plays and feeds

- [x] 4.1 Emit `episode_played` and `episode_completed` from `savePodcastEpisodeListen` with `entryPoint` `web`, and
  `episode_played` with `entryPoint` `feed` from the token feed's audio route in `api/podcast/podcastFeeds.ts`
- [x] 4.2 Add `first_fetched_at` to `episode_feed_tokens` in `db/schema.ts`, run `bun run db:generate`, set it on a
  podcast app's first fetch of a token feed in `api/documents.ts`, emit `podcast_feed_added` from the returning row,
  and `podcast_feed_reset` from the feed-reset route in `api/podcast/podcastFeeds.ts`
- [x] 4.3 Emit `podcast_toggled` with `isEnabled` from the topic update when `isPodcastEnabled` flips

## 5. Room messages and chat

- [x] 5.1 Emit `room_message_sent` from `postChatRoomMessage` with `roomKind` `team` or `topic`, `mentionsCarl`, and
  `hasAttachment`, and add `chatKind` `topic`, `team`, or `new_topic` to `chat_turn_sent` in `api/chat/chatTurns.ts`

## 6. Teams and invites

- [x] 6.1 Emit `team_created`, `team_deleted`, `team_join_requested`, `team_join_approved`, `team_member_removed`
  with `isSelf`, `team_topic_added`, and `team_topic_removed` from the routes in `api/team/teams.ts` and
  `api/team/members.ts`, each with the `teamId` the route authorized
- [x] 6.2 Emit `invite_accepted` and `invite_declined` with `kind` and `pageKind` from `acceptInviteToken`,
  `acceptInvite`, and `declineInvite`

## 7. MCP

- [x] 7.1 Emit `mcp_connected` with `clientName` from a Better Auth after hook when an app trades its authorization
  code at `/mcp/token`, and `mcp_tool_called` with `tool`, `clientName`, `callerKind`, and `outcome` from one wrapper
  around `registerTool` in `api/mcp/server.ts`, both as bot events keyed to the app's name from its OAuth
  registration or its user agent's product token

## 8. Visit events

- [x] 8.1 Add `captureVisitEvent` and the `visit_` event union to `ui/src/lib/visitAnalytics.ts`, with a test that
  the event passes through `toReportedEvent` and sends no property beyond the ones named
- [x] 8.2 Emit `visit_topic_viewed` from `TopicPage.tsx` when the topic id changes, with `topicId` only for a public
  topic

## 9. Bots and unfurlers

- [x] 9.1 Add `toBot(userAgent)` to `shared/userAgent.ts` with the named token list for crawlers, unfurlers, podcast
  apps, and feed readers, and test one of each and an unknown agent
- [x] 9.2 Mount the bot middleware in `api/index.ts` ahead of the content, document, and page routes: `crawler_fetched`
  with `botName`, `routeShape`, and `status` on html, xml, and text responses, nothing on an image, script, style,
  or font response, nothing on a `HEAD` or a non-200, with a test in `api/index.test.ts`
- [x] 9.3 Emit `link_unfurled` from the same middleware for an unfurler on a page or a preview image, with `botName`,
  `kind`, and `topicId` where the preview route set `analyticsTopic` for a public topic

## 10. The rest of the user events

- [x] 10.1 Account and billing: `login_completed` with `method` from a Better Auth after hook on `/sign-in/email` and
  `/callback/:provider`, `checkout_started` with `checkoutPlan` and `interval` from the checkout route, and
  `subscription_started`, `plan_changed` with `fromPlan`, and `subscription_canceled` from `applySubscriptionState`
  with `entryPoint` `webhook`
- [x] 10.2 Topics and scans: `changedFields` on `topic_updated`, `source_added` and `source_removed` with `sourceType`
  from the form path's inserts and the stale delete's returning rows and from the two Topic Tools in place of
  `topic_edited`, `attachment_added` with `kind` from the two attachment routes, `sources_suggested` from the suggest
  route, `scan_completed` with `trigger`, `findingsKept`, and `status` from `finishScan`, and `scan_stopped` from the
  stop route
- [x] 10.3 Findings, notes, and trust: `finding_feedback_sent`, `note_created`, `note_comment_added` with
  `isThreadStart` from the routes that start a thread and reply to one in `api/note/noteCommentThreads.ts`,
  `note_thread_resolved` from the resolve route, and `content_flagged` with `kind`
- [x] 10.4 `feed_fetched` from the bot middleware for a podcast app or a feed reader on a feed route, with `client`,
  `feedKind`, and `topicId` where the feed route set `analyticsTopic` for a public topic
- [x] 10.5 The other visit events: `visit_episode_played` and `visit_episode_completed` from the player store with
  `topicVisibility` added to the episode contract, `visit_finding_clicked` with the source's host from the resource
  row's link, `visit_cta_clicked` from `AnchorLink` for an internal href with a `cta` query, `visit_share_clicked`
  from the two share menus, and `visit_podcast_subscribe_clicked` from the feed dialog
- [x] 10.6 Add `teamId` and `isTopicPublic` to the events whose routes hold them, with no new read

## 11. Spec, privacy page, docs, and checks

- [x] 11.1 Update `PrivacyPage.tsx`'s analytics bullet, the PostHog row, and the cookies paragraph to say what
  visits, user events, and bot events collect
- [x] 11.2 Update `shared/AGENTS.md`, `api/AGENTS.md`, and `ui/AGENTS.md` for the bot list, the middleware, and the
  visit events, and the README's analytics paragraph if it names the event count
- [x] 11.3 Run `bun run check`, `bun run smoke:seo`, and the MCP smoke
