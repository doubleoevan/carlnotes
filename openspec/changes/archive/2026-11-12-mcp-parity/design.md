# Design: MCP parity

## For your approval

Approve these before `/opsx:apply`. Each one is decided below with its reason, and each can change:

1. The tool list in section 1: 17 new tool names, `list_topics` and `edit_topic` extended, 43 tools in all.
2. Destructive means irreversible (section 2): `delete_note`, `delete_hot_take`, `save_note`, and `set_topic_image`.
   Nine existing writes lose `destructiveHint: true`. `edit_topic` keeps its own server-side confirmations for going
   public and removing a Source, and `create_topic` keeps its draft preview.
3. The topics MCP view shows topic cards like the home page, not the Topics page's rows (section 5, deviation 1).
4. The team MCP view reads the room without a live stream (section 5, deviation 2).
5. Out of scope (section 9): cloning a topic (row 76 has not shipped), chapter links and clip sharing, a category
   directory, the account's organization, and a separate report kind for an Open Mic post.
6. The film switch covers films only (section 6). No audio switch exists today, and the row's own check expects the
   audio player unchanged with films off.
7. "Regenerations left" is new data. It goes onto the account page on the web and in the mobile app too, so the
   account MCP view shows nothing the page lacks (section 7).

## Context

The MCP server registers 26 tools in eleven modules under `apps/api/mcp/`, and 14 of them return one of 10 MCP views at
`?v=11`. `toolCaller` resolves a visitor or a user per request, and visitor reads go through `loadViewableTopic` and
`isAllowed`. MCP views live in `apps/web/src/mcpViews/`. They render core components through each MCP view's own element
overrides, behind a memory router, a fetch shim that turns a few api reads into tool calls, and host link and tool
helpers. The dashboard MCP view already draws all five charts in its own `dashboardMcpView.js`.

The survey behind this design found:
- About half the jobs already have a callable function.
- Notes, the topic image, the team room, and the report path keep logic inline in Hono route handlers.
- `loadProfile`, `loadActivity`, and `flagContent` are not exported.
- Chapter links, clip sharing, a category directory, an organization, and an in-host playback switch exist nowhere.
- `edit_topic` skips the editor's moderation.

## Goals / Non-Goals

**Goals:**
- Every job a person does on the web, other than leader-only team management and purchases, has a tool.
- Every page a person reads in the host renders the same component as the web and the mobile app.
- No tool reaches a path the web does not reach.

**Non-Goals:**
- Live streams inside an MCP view.
- A purchase or a checkout in the host.
- Reading the host's uploads.
- Any new mobile screen.
- Renaming an existing tool.

## Decisions

### 1. The tool list

In the table:
- **Hints:** R, D, I, O are readOnly, destructive, idempotent, and openWorld, with t/f for true/false. A dash means
  the hint is not set.
- **Caller:** V is a visitor, under the topic's or page's visibility. A needs an account. T also needs the current
  Terms.
- **Status:** new, changed (inputs or MCP view), hints (annotations only), or blank for unchanged.

| # | Tool | Title | R/D/I/O | Caller | MCP view | Calls | Status |
|---|---|---|---|---|---|---|---|
| 1 | list_topics | List topics | t/f/–/– | V | topics | `topicResults.listTopics`, the extracted topic section read, `loadRelatedTopics` | changed: `section`, `similar_to_topic_id`, MCP view |
| 2 | read_topic_feed | Read a topic's feed | t/f/–/– | V | findings | as today | changed: film data |
| 3 | search_topic_findings | Search a topic's findings | t/f/–/– | V | findings | as today | |
| 4 | search | Search CarlNotes | t/f/–/– | V | search | as today | |
| 5 | mark_finding_consumed | Mark a finding consumed | f/f/t/– | A | – | as today | hints |
| 6 | rate_finding | Rate a finding | f/f/t/– | A | – | as today | hints |
| 7 | bookmark_finding | Bookmark a finding | f/f/t/– | A | – | as today | hints |
| 8 | follow_topic | Follow a topic | f/f/t/– | A | – | as today | hints |
| 9 | edit_topic | Edit a topic | f/f/f/– | A | topic | `applyTopicEdit`, `addTopicToTeam`/`removeTopicFromTeam`, `toTopicSaveRejection` | changed: `team_id`, moderation, hints |
| 10 | suggest_sources | Suggest sources | f/f/f/t | A | – | as today | hints |
| 11 | create_topic | Create a topic | f/f/f/– | A | topic | as today | hints |
| 12 | send_to_topic | Send to a Topic | f/f/f/– | A | topic | as today | |
| 13 | suggest_topics | Suggest Topics | t/f/–/– | A | suggest-topics | as today | |
| 14 | read_updates | Read updates | f/f/–/f | A | updates | as today | |
| 15 | start_scan | Brew a topic | f/f/–/t | A | scan | as today | |
| 16 | read_scan_status | Read a brew's status | t/f/–/– | V | scan | as today | |
| 17 | stop_scan | Stop a brew | f/f/t/– | A | – | as today | hints |
| 18 | read_topic_context | Read a topic's context | t/f/–/– | A | – | as today | |
| 19 | send_finding_feedback | Send feedback on a finding | f/f/f/– | A | – | as today | |
| 20 | save_reaction | React | f/f/t/– | T | – | as today | hints |
| 21 | read_hot_takes | Read hot takes | t/f/–/– | V | – | as today | |
| 22 | post_hot_take | Add a hot take | f/f/f/– | T | – | as today | |
| 23 | read_news | Read Brews News | t/f/–/– | A | news | as today | |
| 24 | read_topic_posts | Read a topic's Open Mic posts | t/f/–/– | V | topic-posts | as today | |
| 25 | read_topic_post | Read an Open Mic post | t/f/–/– | V | topic-post | as today | changed: image url in the text result |
| 26 | read_dashboard | Read Specials | t/f/–/– | V/A | dashboard | as today | |
| 27 | read_notes | Read tasting notes | t/f/–/– | V | note | `loadNotesPayload`, the extracted `loadVisibleNote` | new |
| 28 | save_note | Save a tasting note | f/t/f/– | T | note | `createNote`, the extracted note update and body save | new |
| 29 | delete_note | Delete a tasting note | f/t/t/– | A | – | the extracted note delete | new |
| 30 | list_teams | List teams | t/f/–/– | A | – | `loadTeamSummaries` | new |
| 31 | read_team | Read a team | t/f/–/– | V | team | `loadTeamPage`, the extracted room read | new |
| 32 | request_to_join_team | Ask to join a team | f/f/t/– | A | – | `requestToJoinTeam`/`deleteJoinTeamRequest` | new |
| 33 | send_invite | Invite someone | f/f/f/– | A | – | `createUserInvite` | new |
| 34 | respond_to_invite | Answer an invite | f/f/t/– | A | – | `acceptInvite`/`declineInvite` | new |
| 35 | post_to_team_room | Post in a team chat | f/f/f/– | T | – | the extracted room post | new |
| 36 | read_profile | Read a Café | t/f/–/– | V | profile | the exported `loadProfile` | new |
| 37 | read_activity | Read your activity | t/f/–/– | A | activity | the exported `loadActivity` | new |
| 38 | read_account | Read your account | t/f/–/– | A | account | `loadBillingState`, the spend meter read, `loadEditorImageRegenerationQuota` | new |
| 39 | report_content | Report something | f/f/f/– | A | – | the exported `flagContent` | new |
| 40 | block_user | Block a person | f/f/t/– | A | – | `saveUserBlock`/`deleteUserBlock` with the extracted checks | new |
| 41 | delete_hot_take | Delete a hot take | f/t/t/– | A | – | `deleteComment` | new |
| 42 | set_topic_image | Change a topic's image | f/t/f/t | A | topic | the extracted regenerate and upload, plus a new url fetch | new |
| 43 | add_topic_attachment | Add an attachment | f/f/f/t | A | – | `ingestUrlAttachment` or `ingestAttachment` (text/plain) | new |

Names follow the existing verbs: `read_` for a page, `list_` for a list, and a plain verb for a write. A tool takes a
set or unset pair as one boolean (`is_requesting`, `is_accepted`, `is_blocked`), as `follow_topic` does, so one name
covers both directions. These jobs share a tool instead of taking a second name:
- Creating and editing a note are one tool, `save_note`.
- Similar topics and the topics page's sections are inputs to `list_topics`.
- Team and topic invites are both `send_invite`.
- The pending invites are in `read_activity`, which shows them on the web.

Alternatives considered:
- One tool per action. Rejected: it adds about ten names to a listing that needs a reviewed edit for each.
- A single `manage_team`. Rejected: it hides the leader and member rules behind one schema, and it makes host
  confirmation all or nothing.

### 2. Destructive means irreversible

A write is destructive if it deletes or overwrites something the caller cannot get back, which is the MCP spec's
line between destructive and additive updates. Four writes cross it:
- `delete_note` and `delete_hot_take` delete.
- `save_note` can replace a note's body, and notes keep no history: the version only guards against a stale save.
- `set_topic_image` deletes the previous image's files once the new one is stored.

The host confirms those four. Every other write can be undone, or is additive: a rating changes back, a stop is
followed by a new scan, a removed Source is added again, and a prompt keeps its Prompt Versions. Those writes drop the
host's confirmation.

Writes that reach other people, `send_invite`, `post_to_team_room`, `report_content`, and `post_hot_take`, are additive
and stay non-destructive. They are not read-only, so a host can still ask before each one, and marking them
destructive would mislabel them for directory review.

The server-side confirmations are a different thing. `edit_topic`'s confirmation for going public and removing a Source,
and `create_topic`'s draft preview, are previews the person reads before a save. They stay, because making a topic
public shows its findings to crawlers, and the draft preview shows the Sources and their cost.

Alternative considered: dropping the server-side confirmations too. Rejected: a public topic is indexed within minutes,
and that is the one edit a person cannot quietly undo.

### 3. Extract before exposing

Each job below moves into a callable module in its own domain folder. Its route calls the module, and so does its
tool. The route keeps only reading the request and shaping the response.

- **Notes** (`apps/api/note/noteWrites.ts`): rename and visibility, delete, and the version-checked body save, which
  moves `saveNoteBody` with its Terms check, sanitizing, moderation, and 409 on a stale version. Also a context-free
  `loadVisibleNote(userId, noteId)`.
- **Topic image** (`apps/api/topic/topicImageEdits.ts`):
  - `regenerateTopicImage` (quota, prompt moderation, `startTopicImageRender`).
  - `replaceTopicImageFromBytes`, the upload's size, type, and image moderation over bytes instead of a multipart
    context.
  - `setTopicImageFromUrl`, which fetches through `toFetchableUrl` and calls `replaceTopicImageFromBytes`.
  - `toImagePromptRejection` and `readUploadedImageOriginal` become context-free.
- **Team room** (`apps/api/chat/roomReads.ts`, `roomPosts.ts`): the read composition from `roomRoute.ts`, and the
  Terms check, text moderation, and daily spend cutoff around `postChatRoomMessage`.
- **Profile, activity, report:** export `loadProfile`, `loadActivity`, and `flagContent`. Move the report's analytics
  into the module so an MCP report is counted too.
- **Blocks** (`apps/api/userBlocks.ts`): move the self-block and user-exists checks into `saveUserBlock`.
- **Topic feed** (`apps/api/topic/topicFeedResponse.ts`): `loadTopicFeedResponse` holds the `/topic-feed` quota
  merge, out of `api.ts`.
- **Editor moderation:** `edit_topic` calls `toTopicSaveRejection` before `applyTopicEdit`. The chat's agreed edit
  goes through the same function, so it gains the same check.

### 4. Components move into packages/core first

An MCP view renders its page's component, so each web-only piece an MCP view needs moves into `packages/core` with an
`…Elements` type. The web page and the mobile screen then render the core component through their own elements. Each
pair that becomes shared leaves `apps/mobile/parity.md`'s separately built table, and the parity check enforces it.

| MCP view | Already shared | Moves into core |
|---|---|---|
| note | `NoteViewer`, `NoteComments` | `NoteDetails`, the read frame inside `NoteDialog` and the mobile `NoteScreen`: title, byline, visibility, comments toggle. Also `NotesList`, the list in `NotesSection` |
| team | `CardsSection`, the cards, `ViewerCountLine`, `ChatRoomMessage` | `TeamHeader` (on `AvatarHeader`), `TeamMembersTable`, `TopicsTable` with `TopicInfo` behind an element, `TeamSections` (the page's order), `ChatRoomMessageList` |
| profile | `ProfileHeader`, `NewsList`, `CardsSection`, the cards | `ProfileSections`, `OwnerTopicsTable`, `TeamsMembershipTable`, `TopicsTable` (shared with the team) |
| activity | `AvatarHeader` | `ActivitySections`, `TopicSubscriptionsTable`, `TopicInvitesTable` with `SentInvitesTable` |
| account | `AvatarHeader`, `AccountBudget` | `SpendMeter` with `MeterBar`, `MeterMarker`, `MeterCutoffList` |
| topics | `CardsSection`, `TopicCard` | `RelatedTopicsSection` |
| dashboard | `Dashboard` and its renderers | nothing |
| film | `TopicPodcastEpisodeVideoPlayer` | nothing; an MCP view film adapter replaces `topicPodcastEpisodeVideoElement.ts` |

The tables already render the core `DataTable`. The mobile app gains each lifted table in place of its own native
table, and the change compares each screen at phone width before hand-off, as AGENTS.md requires.

The MCP pieces that more than one MCP view uses gather into one module, `apps/web/src/mcpViews/mcpViewElements.tsx`: the
web set with the MCP overrides for links through the host, no share sheet, no file pickers, no report dialog, and no
polling. The page cards a profile and a team share sit in `mcpViewPageCardElements.tsx`, since they render an MCP view's
own card and the MCP views import `mcpViewElements`. An override one MCP view alone uses stays in that MCP view.

Alternative considered: thin MCP-only renderers. Rejected by the brief and by AGENTS.md: matching a page's look with
separate code is not reuse.

### 5. Where an MCP view differs from its page

Each difference is the smallest the reason allows, and each is named in its MCP view's story description:

1. **Topics as cards.** The Topics page lists rows (`Topic`, `TopicFindingList`, `TopicResource`). Those depend on
   the page's feed provider, router search params, popovers, and the share sheet, none of which an MCP view has. The MCP
   view shows the same sections as the home page's topic cards (`CardsSection` with `TopicCard`), which are already
   shared and already render in the posts MCP views. Lifting the rows would mean moving the Topics page's feed state
   into core for one MCP view.
2. **The room without a live stream.** The room streams over `EventSource`, which needs a connection the MCP view's
   security policy does not allow and a session cookie the frame does not have. The MCP view reads the room's recent
   messages from `read_team` and loads earlier ones through its cursor. Posting is `post_to_team_room`.
3. **No editors in the note and team MCP views.** The Tiptap editor, the avatar picker, and the dialogs stay on the
   site. Writes go through `save_note` and the team tools, and the MCP view shows a link to edit on carlnotes.com.
4. **No polled counts.** `ViewerCountLine` and the update badges show the counts the tool result includes and do not
   poll.
5. **The map is an outline.** This is unchanged from today: Google Maps cannot load in the frame, so the dashboard MCP
   view keeps `OutlineMap`.

### 6. Films in the host

`MCP_VIEW_FILM_PLAYBACK`, a boolean env setting read in `apps/api/mcp/mcpViewData.ts`, defaults to off until
mcp-review answers.
- **On:** `toMcpViewPodcastEpisode` keeps the film's video and captions urls, absolute and signed with the same play
  token as the audio. The findings MCP view renders the core `TopicPodcastEpisodeVideoPlayer` through an MCP view film
  adapter with an in-frame `<video>`, with no picture-in-picture or fullscreen requests the sandbox may deny.
- **Off:** the player shows today's "Watch on CarlNotes" link.

The film's url and its presigned redirect use origins the security policy already lists, so `resourceDomains` does not
change.

Audio stays outside the switch. No audio switch exists, MCP views always try the audio, and the row's manual check
expects the audio player unchanged with films off. If mcp-review answers no for audio too, a second setting is a
one-line follow-up in the same file.

Alternative considered: one switch for audio and film. Rejected for now: turning it off would stop today's audio
playback for every host before anyone has asked for that.

### 7. The account MCP view

The MCP view shows the plan, the spend meter with its cutoffs, the day's scans, and the regenerations left. The plan and
billing actions call `openMcpViewLink` to the plans page and the billing portal page on carlnotes.com.

Regenerations left are counted today only for a topic editor's image dialog
(`loadEditorImageRegenerationQuota`). They become a field of the account read and a line in `AccountBudget` on the web
and in the mobile app, so the MCP view shows nothing the page lacks. No organization exists, so none is shown.

### 8. Visitors, fencing, and limits

- **Visitors:** `list_topics`, `read_topic_feed`, `read_notes`, `read_team`, and `read_profile` work without sign-in
  under the page's own visibility. Every write and every own-data read returns the connect-an-account result, as today.
- **Fencing:** text other people wrote is fenced as untrusted with `UNTRUSTED_TEXT_NOTICE` in the text result:
  - note names and html text
  - room messages
  - profile and team names and bios
  - hot takes and post bodies

  MCP views read the unfenced copy from `_meta`, as the posts MCP views do.
- **Limits:** each list result is paged under `MCP_PAGE_MAX_CHARS`. A note's html over the limit is cut at a block
  boundary, and the result says so with a link to the note on the site.
- **Rate limits:** writes reuse the route's limiter through the tool caller's rate limiter. `save_note` body saves also
  take `noteBodySaveRateLimiter`.

### 9. Left out, with the reason

- **Cloning (refilling) a public topic:** row 76 has not shipped, and no clone path exists. It gets its tool in row 76.
- **Chapter links and clip sharing:** the web has neither. The episode route reads no chapter or time parameter, and
  sharing is page-level. A tool would be the only place the feature exists, so it waits for a web change.
- **A directory by category:** the code has no category. The topics page's sections are yours, followed, featured, and
  popular, and a tag filter lives in `search`.
- **The account's organization:** no organization exists in the data.
- **Reporting an Open Mic post as its own kind:** the report kinds include the post's image (`topicPostImage`) but not
  the post. `report_content` takes `topicPostImage` for a post. A `topicPost` kind would change the report contract on
  every platform, so it belongs in a reporting change.
- **Leader-only team management:** approving join requests, roles, removing members, and editing or deleting a team
  stay on the site. A leader approves a request made over MCP there. These are low-frequency jobs that each add a name
  to the listing.
- **Following people, a following feed, and posting to a profile:** these do not exist on any platform.

### 10. Versions and gates

- `MCP_VIEW_VERSION` becomes 12, with aliases 2 to 11. A stored version takes its own uri from the alias, since the
  server rejects a uri registered twice.
- `bun run mcp-views:freeze`, run from main's commit, stores version 11's bundle before the deploy, so ChatGPT's
  locked version keeps its templates.
- The annotation fixture gains the 17 tools in registration order, their phrases, and the new hints.
- `tools.test.ts` pins the 22 tool-to-view pairs.
- Each new tool gets a smoke section on both routes, and each list or page gets `checkPageBounds`.
- Each new MCP view gets a story, a test host section, and a 320px check.

## Risks / Trade-offs

- **Mobile screens change** when their tables and sections move into core. → Each lifted component keeps the mobile
  screen's current layout through its mobile elements. Hand-off compares every changed screen with the web at phone
  width on iOS and then Android.
- **The MCP views bundle grows** with the profile, team, and activity sections. → They share `mcpViews.js` with the
  existing MCP views, whose components they mostly reuse. The dashboard keeps its own bundle. The build logs both sizes,
  and the report lists the change.
- **43 tools is a long listing.** → Each name covers a job a person asked for, and section 1 folds every job that
  could share a tool.
- **The listing needs a reviewed edit for the new names.** → The names are final at approval, and the edit goes in
  after the deploy (Notion row 64, manual step 7).
- **Moderation now runs on `edit_topic` and the chat's agreed edit.** → An edit the web editor rejects was always a
  gap. The result gives the editor's moderation rejection, and the smoke tests cover it.
- **Extracting route logic can change a route's behavior.** → Each route's existing tests run unchanged against the
  module. A route keeps its status codes and payloads.

## Migration Plan

- No database migration. `MCP_VIEW_FILM_PLAYBACK` is unset, so it is off by default.
- Before the deploy: `bun run mcp-views:freeze`.
- After the deploy:
  - submit the listing edit with the new names and screenshots;
  - run the manual checks in Notion row 64;
  - set `MCP_VIEW_FILM_PLAYBACK=true` in Doppler prd once mcp-review allows it.
- **Rollback:** redeploy the previous image. Cached hosts keep reading version 11 through its alias. The new tools
  disappear from the next tools list.

## Open Questions

None that change the specs, the approach, or the tasks. Section "For your approval" holds the decisions.
