## MODIFIED Requirements

### Requirement: PostHog reports a three-population event taxonomy

When `POSTHOG_API_KEY` is set, the server SHALL emit two populations of events that are never joined to each other or
to a visit: user events, keyed to a user id, and bot events, keyed to a bot's or an app's name. A bot event SHALL be
sent with `$process_person_profile` false, so no person profile is ever created for a bot or an app. The browser's
visit events are the third population, under "Visit analytics run in the browser".

Every server event SHALL have an `entryPoint`: `web` for a browser request, `mcp` for a tool call, `email` for a link
from an email, `feed` for a feed or its audio, `worker` for the scan pipeline, or `webhook` for a payment provider's
call. An event a browser request triggers SHALL have the user's `plan` and the three device properties, `platform`,
`browserPlatform`, and `isInAppBrowser`, read once from the request's own user agent, never from a value the client
sent, and a request with no user agent SHALL read as `desktop`, `other`, and not an in-app browser. An event from an
email's link or a feed SHALL have no plan and no device property, since no session is behind it, and an event from
the worker or a webhook SHALL have the plan the handler already loads and no device property. A topic-anchored
event SHALL have `topicId`, and `isTopicPublic` where the route holds the topic's row. A team-anchored event SHALL
have `teamId`. A route a user waits on SHALL NOT run a database query for an event: a property the route does not
already hold is left off instead of read. The payment webhook reads the plan it replaces, and an AI app's registered
name is read once per app. Properties SHALL be short identifiers, never content, and never an invite token or a
podcast feed token.

The user events SHALL be, by area:

- account and billing: `signup_completed` with `cta` where a tagged button brought the visitor, validated against a
  strict slug shape; `login_completed` with `method` `email` or the provider's name; `account_deleted`;
  `checkout_started` with `checkoutPlan` and `interval`; and from the payment provider's webhook `subscription_started`,
  `plan_changed` with `fromPlan` and `plan`, and `subscription_canceled`
- topics and scans: `topic_created`; `topic_updated` with `isTopicOwner` and `changedFields`, the names of the saved
  fields that differ from the row, never a value; `topic_deleted` with `isTopicOwner`; `topic_edited` for a prompt
  or field edit by a Topic Tool, with `tool` and `origin`; `source_added` and `source_removed` with `sourceType` on
  every path, the form and the tools alike; `attachment_added` with `kind`; `sources_suggested`; `scan_requested`;
  `scan_quota_reached`; `scan_completed` with `trigger`, `findingsKept`, and `status` for every Scan;
  `scan_stopped`; `first_scan_completed`; and `podcast_toggled` with `isEnabled`
- findings: `finding_rated`, `finding_bookmarked`, `finding_unbookmarked`, `finding_read`, `finding_unread`,
  `finding_opened`, and `finding_feedback_sent`
- subscriptions: `topic_subscribed` and `topic_unsubscribed` with `subscriptionSource`, `email_digest_toggled` with
  `isEnabled`, and `email_unsubscribed` with `entryPoint` `page` for the unsubscribe page's button or `one-click` for a
  provider's one-click, with the request's device properties
- podcast: `episode_played` and `episode_completed` wherever a play or a finish is counted, in the app or through a
  listener's feed, `podcast_feed_added` on a feed's first fetch by a podcast app, and `podcast_feed_reset`
- chat: `chat_turn_sent` with `chatKind` `topic`, `team`, or `new_topic`, `chat_budget_reached`, and `room_message_sent`
  with `roomKind` `team` or `topic`, `mentionsCarl`, and `hasAttachment`
- teams and invites: `invite_created` and `invite_reused` with `source`, `invite_accepted` and `invite_declined`
  with `kind` (`email`, `username`, or `link`) and `pageKind`, `team_created`, `team_deleted`,
  `team_join_requested`, `team_join_approved`,
  `team_member_removed` with `isSelf`, `team_topic_added`, and `team_topic_removed`
- notes: `note_created`, `note_comment_added`, and `note_thread_resolved`
- trust: `content_flagged` with `kind`

The bot events SHALL be `mcp_connected` with `clientName` when an AI app trades its authorization code for a token,
and never on a refresh;
`mcp_tool_called` with `tool`, `clientName`, `callerKind` `visitor` or `user`, and `outcome` on every MCP tool call;
`crawler_fetched` with `botName`, `routeShape`, and `status` for a known crawler's fetch of an html page, a feed, the
sitemap, or an llms file, and never for an image, an avatar, a favicon, or a built asset; `link_unfurled` with
`botName`, `kind`, and `topicId` for a public Topic when a known unfurler fetches a page or a preview card; and
`feed_fetched` with `client`, `feedKind` `podcast` or `rss`, and `topicId` for a public Topic when a podcast app or a
feed reader pulls a feed. A bot SHALL be classified from a named, tested list of user agent tokens, and an unknown
user agent SHALL emit nothing. The product events a tool emits on a user's behalf stay keyed to the user, with
`entryPoint` `mcp`.

A server event SHALL NOT be a page view, which the browser captures. An event named `first_` SHALL fire only on a
genuine first occurrence established by a count, and an engagement event fires on every occurrence. `topic_updated`
and `topic_deleted` have `isTopicOwner`, so an admin's change to a Topic they do not own stays on the record.

#### Scenario: A change by someone other than the owner is on the record

- **WHEN** an admin edits or deletes a Topic they do not own
- **THEN** the event has their user id and `isTopicOwner` false, so the change is attributable afterwards

#### Scenario: A signup names the button that converted

- **WHEN** a visitor reaches signup from a tagged button and completes signup, on the password or the oauth path
- **THEN** their `signup_completed` event has that button's `cta` tag, while a direct-visit signup has none and a
  garbled cookie value is dropped, not sent

#### Scenario: A signup from inside another app's browser is visible

- **WHEN** a visitor completes signup from a webview such as the LinkedIn, Instagram, or Facebook in-app browser
- **THEN** `signup_completed` has `isInAppBrowser` true and the `browserPlatform` that decides whether they could
  be handed a way out

#### Scenario: A request with no user agent still reports a device

- **WHEN** a request with no user agent header triggers an event
- **THEN** the event reads `desktop`, `other`, and not an in-app browser

#### Scenario: Every event names its entry point and its plan

- **WHEN** a user rates a Finding from the site, from an AI app's tool, or the worker finishes their Scan
- **THEN** the events have `entryPoint` `web`, `mcp`, and `worker` and the user's plan, and the worker's has no
  device property

#### Scenario: A route reads nothing for an event

- **WHEN** a route emits an event
- **THEN** the plan, the device properties, the topic id, the team id, and whether the topic is public come from the
  session, the request, and the rows the route already loaded, and a property the route does not hold is left off

#### Scenario: A login names its method

- **WHEN** a user signs in with a password, and later through Google
- **THEN** `login_completed` fires twice, with `method` `email` and then `google`

#### Scenario: A plan change names both plans

- **WHEN** the payment provider reports a subscription moving from plus to premium
- **THEN** `plan_changed` has `fromPlan` `plus` and `plan` `premium` with `entryPoint` `webhook`, while a new
  subscription emits `subscription_started` and a cancellation `subscription_canceled`

#### Scenario: A source added by a tool and by the form report the same event

- **WHEN** a user adds an rss Source in the topic form, and an AI app adds one with the add-source tool
- **THEN** both emit `source_added` with `sourceType` `rss`, the tool's with `entryPoint` `mcp` and its `origin`, and
  neither emits `topic_edited`

#### Scenario: A topic update names what changed

- **WHEN** an owner saves a Topic with a new name and a new frequency
- **THEN** `topic_updated` has `changedFields` naming those two fields and no value of either

#### Scenario: Every scan reports its completion

- **WHEN** a scheduled Scan finishes with twelve kept Findings
- **THEN** `scan_completed` has `trigger` `scheduled`, `findingsKept` 12, and `status`, and a manual Scan has
  `trigger` `manual`

#### Scenario: A manual scan records the ask, not the outcome

- **WHEN** an owner starts a manual Scan by hand
- **THEN** `scan_requested` is emitted at the request, and `scan_completed` later from the worker

#### Scenario: Running out of manual scans is recorded as a paywall

- **WHEN** an owner asks for a manual Scan with their daily limit spent and no payment method on file
- **THEN** `scan_quota_reached` is emitted, while an owner whose card on file bills the extra Scan as overage emits
  `scan_requested` instead, and a caller rejected for authority emits neither

#### Scenario: The first scan fires the activation event once

- **WHEN** a user's first Scan completes, and later a second one completes
- **THEN** `first_scan_completed` is emitted for the first only

#### Scenario: A rating is reported as an occurrence, not as a first

- **WHEN** a user rates a Finding up or down
- **THEN** `finding_rated` is emitted for that user, and clearing a rating emits nothing

#### Scenario: A bookmark is reported once per bookmark

- **WHEN** a user bookmarks a Finding
- **THEN** `finding_bookmarked` is emitted for that user, while removing a bookmark emits `finding_unbookmarked` once
  and re-bookmarking one they already hold emits nothing

#### Scenario: Reading, unreading, and opening are told apart

- **WHEN** a user marks a Finding read, marks one unread, or opens one
- **THEN** `finding_read`, `finding_unread`, and `finding_opened` are emitted respectively, and an open emits only
  `finding_opened` even though it also marks the Finding read

#### Scenario: A listen is reported where it is counted

- **WHEN** a signed-in listener starts an episode in the app, and a podcast app pulls the same episode's audio
  through their feed
- **THEN** `episode_played` fires twice, with `entryPoint` `web` and then `feed`, and a finish in the app fires
  `episode_completed`

#### Scenario: A feed's first fetch fires once

- **WHEN** a podcast app fetches a listener's feed for the first time, and again an hour later
- **THEN** `podcast_feed_added` fires for the first fetch only, and the feed's token appears in no property

#### Scenario: A room message says what kind of room and whether Carl was asked

- **WHEN** a member posts a message with an attachment that mentions Carl in a Topic's team room
- **THEN** `room_message_sent` has `roomKind` `topic`, `mentionsCarl` true, and `hasAttachment` true

#### Scenario: A team's life is on the record

- **WHEN** a user creates a team, another asks to join, the leader approves, adds a Topic, and the member leaves
- **THEN** `team_created`, `team_join_requested`, `team_join_approved`, `team_topic_added`, and
  `team_member_removed` with `isSelf` true fire in turn, each with the `teamId`

#### Scenario: An MCP tool call is keyed to the app

- **WHEN** a visitor's AI app calls `read_topic_feed` and a user's AI app calls `rate_finding`
- **THEN** `mcp_tool_called` fires twice, keyed to each app's `clientName` with `callerKind` `visitor` and `user`
  and `$process_person_profile` false, and the user's `finding_rated` fires keyed to the user with `entryPoint` `mcp`

#### Scenario: A crawler's fetch creates no person

- **WHEN** Googlebot fetches a public Topic's page, the sitemap, and the page's favicon
- **THEN** `crawler_fetched` fires for the page and the sitemap with `botName`, `routeShape`, and `status`, nothing
  fires for the favicon, and no person profile is created

#### Scenario: An unfurler and a feed reader are told apart from a crawler

- **WHEN** Slackbot fetches a public Topic's preview card and Overcast pulls that Topic's podcast feed
- **THEN** `link_unfurled` fires with `botName` `slack`, `kind` `topic`, and the `topicId`, and `feed_fetched`
  fires with `client` `overcast`, `feedKind` `podcast`, and the `topicId`

#### Scenario: An unknown user agent emits nothing

- **WHEN** a request arrives with a user agent on no list
- **THEN** no bot event fires, and a user's own events are unaffected

#### Scenario: Signup and topic creation are captured

- **WHEN** a user completes signup and then creates a Topic
- **THEN** `signup_completed` and `topic_created` are emitted for that user's id
