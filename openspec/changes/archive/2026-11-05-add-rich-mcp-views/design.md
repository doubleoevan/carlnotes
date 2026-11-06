# Design

This design covers two briefs in one change. See proposal.md for why, and the delta specs for required behavior. Six
decisions here differ from the briefs because of what the repo holds or what its rules say. They are marked **Differs
from the brief**, and the final hand-off names each one.

## Context

**MCP views today.** Four MCP views, not three: search, topic, findings, and suggest-topics. `McpViewApp.tsx` picks one
through a switch inside a one-route memory router. `uiResources.ts` registers `?v=9` plus unversioned aliases and
`?v=2..8`, and all of them serve the current build. No earlier bundle is kept anywhere. An MCP view declares
`capabilities: {}` and uses no host style, display mode, or model context call.

**What the web really has.** Topic Findings and search results are lists with no columns. Rating, mark read, and the
relevance explanation live in a popover note (`TopicResourceInfo.tsx`). Table, Loading, BarChart, EmptyState, and Toggle
are inventory names, not components. The real ones are `DataTable` (core, with `renderDetails`), `components/table/*`,
`CoffeeLoading`, `SourceResultsChart`, a muted paragraph, and `primitives/switch.tsx`. No back button exists.

**The living spec requires an MCP view test host that was never built.** `mcpViews.test.tsx` renders components
directly.

**Scans.** `runManualScan` holds every gate. It bills an overage for a monthly subscriber with a card. `GET /scans/:id`
returns only a summary and results, both null until the closing write, and the `source-results` spec says a running Scan
has none. Nothing records a stage. `planPodcastEpisode` starts for every succeeded Scan and skips a Topic whose podcast
is off, and `episodes.scan_id` is unique.

**Retrieval.** `retrieveChatContext` makes one paid embedding call and no authorization of its own. It returns up to 8
Findings cut to 2,000 characters, the newest 3 Scan summaries, attachment context with no limit, and a docs block.

**Reading state.** `consumptions.consumed_at` is the only per-user read time that every client writes. MCP makes no
session rows, and `users.last_login_at` holds only the latest sign-in. No bulk read write exists. Resources have `kind`
and nullable `contentBytes` (markdown bytes), and no duration.

## Goals / Non-Goals

**Goals:**

- One implementation for each rule: one updates function, one Scan start and stop path, one matcher score.
- Every new tool stays usable as text in a host with no UI.
- Existing tool names, URIs, and the `carlnotes/card` key keep working. Results only gain fields, except that a send
  result's `receipts` field is now `confirmations`.

**Non-Goals:**

- Generated replies over MCP. The host writes the reply from `read_topic_context`.
- Host fonts. Their origins are not in the content security policy, and Nightshift's fonts stay.
- Private annotations on the web popover or the native sheet. The `personal-sources` spec keeps both as they are.
- The docs block in `read_topic_context`. It explains the product and adds about a page of unrelated text.
- A release pipeline step for bundles. Northflank job commands stay as they are.

## Decisions

### 1. A code-based memory router with one shell route

`mcpViewRouter.tsx` builds a route tree on `createMemoryHistory`, with `McpViewShell` as the root route. The brief's
`ViewShell` is `McpViewShell`, since the domain model spells out `McpView` in every identifier. Stories render a route
through the existing router mock.

The global `Register` in `apps/web/src/router.tsx` types `useNavigate` and `Link` against the site's routes, so
memory-only paths fail `tsc -b`. The MCP view code calls the router instance through one `navigateMcpView` helper
instead of casting at each call site.

`AnchorLink` under `LinkOpenerContext` always opens on the host, so it stays the host link. In-view moves use a new
`McpViewLink`. It checks `history.canGoBack()`: on the opening route it moves, and past one hop it renders the host
link. That single check enforces the one-hop rule.

A history guard opens every navigation that did not come from `navigateMcpView` or `replaceMcpViewToolCall` on the site
through `openMcpViewLink`, and blocks it, so the route never changes and a form on it keeps its edits. A catch-all route
would unmount the route first. This fixes the three shared calls that navigate to real paths (`EditTopicFields.tsx:63`,
`PodcastEpisodeQuestionControls.tsx:44`, `spokenQuestionsPaused.ts:24`) in one place, and it keeps upgrades outside the
host under directory rule 4A.

The shell mounts `McpViewPodcastPlayer` once, so audio survives a hop. Hop data comes from a tool call kept in route
state. Back reads it without another call.

**Route names.** `/brew/:topicId` keeps the brief's spelling, although "brew" is branding. It is a memory path no
user sees. Every identifier around it says scan: `ScanMcpView` and the registry name `scan`. **Differs from the
brief** in those names, and in `/updates`, which matches the `read_updates` tool instead of the brief's
`/topic-updates`.

*Alternatives.* File routes would pull the site's route tree into the bundle. A hand-rolled state machine would lose the
shared router hooks that components already use.

### 2. Tables reuse the web's cells, not its lists

**Differs from the brief:** "the same columns" has no source, because the web pages are lists. The MCP views use core
`DataTable` with `renderDetails` for the expansion. The new `FindingsTable` and `SearchResultsTable` compose cells from
components the web already renders. `TopicResourceInfo` splits so that the relevance explanation, rating, bookmark, and
mark read controls become one component that the popover and the expanded row both render. The topic and search pages
keep their lists, and neither can drift from the cells because they share them.

In-frame fixes the tables need, each found by reading the code:

- `fetchTopicFindingLinkPreview` returns 503 from `mcpViewFetch`, and `LinkOpenerContext` hides link previews in every
  host path. `sendFindingFeedback` goes through `mcpViewFetch` to the `send_finding_feedback` tool, so the rating block
  works in a frame and in the popover the podcast chapters open.
- `HostFavicon` and `Avatar` use relative `/api/...` urls, which fail on an opaque origin. Both resolve against the
  connected site url from `LinkBaseUrlContext`.
- A title click can both open the note and follow the link. The table's title is a link only.

Findings page by cursor with a stack of earlier cursors, so previous works with no count. Search keeps its numbered
`Pagination`.

Narrow layout uses a `@container` on the shell, as `ChatPanelWidget.tsx` does, since viewport breakpoints read the
frame. Columns past title and controls move into `renderDetails`.

### 3. Annotations reach the MCP view only

A new `loadFindingPersonalAnnotations({ userId, findingIds })` reads one page in one query. The rows go in the
`carlnotes/card` metadata as `personalAnnotations`, a map by finding id that both the findings and the search MCP views
read, gated on the caller's user id, and never in the text or structured content. `read_topic_context` returns them in
model-visible content because the sender asked a question of that material, and the brief requires it.

**Differs from the brief:** the brief assumes annotations already show. `personal-sources` bars them from the popover
and the native sheet, and no client reads them today. The web and mobile keep that rule. The delta adds the MCP view
rows and retrieval as the only readers.

### 4. A generated token layer maps host variables onto Nightshift

Nightshift reads `--background`, `--foreground`, `--card`, `--primary`, `--border`, and `--radius`. Hosts send
`--color-background-primary`, `--color-text-primary`, and `--border-radius-md`. `tokens.css` is generated, so `bun run
nightshift:write` also writes `mcpViewTokens.css`. It defines each Nightshift variable as `var(--color-…, <palette
value>)` for both palettes. Only the MCP view stylesheet imports it.

`applyHostStyleVariables` receives only `--color-*` and `--border-radius-*`, because `--font-mono` and `--font-weight-*`
collide with Tailwind's. Color scheme comes from `hostContext.theme`, and the shell toggles `.dark` as it does today.

### 5. Stored bundles live in object storage, frozen by hand at submission

A host's locked version needs its own bytes. `bun run mcp-views:freeze` runs at submission, like `contract:freeze`:

1. Build, then upload `mcpViews.js` and `mcpViews.css` to `mcp-view-bundles/v<N>/` with `uploadAttachment`.
2. Add `{ version: N, mcpViews: [...] }` to `packages/contracts/mcpViewVersions.json`, since the production image has
   no root `contracts/` folder.
3. Raise the current version in `packages/contracts/mcpViews.ts` to N + 1 in the same commit.

`uiResources.ts` registers each manifest entry, reads its files once per process through `getResourceContent`, and wraps
them in the same html with `data-mcp-view`. A test fails if the current version is not above every stored one. A stored
bundle that cannot be read falls back to the current build and reports the error. Dev object storage holds no stored
bundles, so that path is the normal dev behavior. Versions 2 to 8 and the unversioned aliases keep serving the current
build, since nothing stored exists for them.

Version 9 must be frozen from the commit before the shell. The script takes `--bundle <folder>` for a bundle built
in another checkout, and `--mcp-views` for the MCP views that bundle holds. That run needs production object storage
credentials, so it is a release step the user runs under Doppler.

*Alternatives.* A release job would need a new Northflank JobRun, a hand-applied pipeline change, and storage secrets
for that job. It would also store a bundle for every deploy when hosts lock only reviewed versions. Committing bundles
adds 1.33 MB per version to the repo. Serving old images is not possible on one service.

### 6. The updates list is one function over three reads

`apps/api/topic/updates.ts` exports `buildUpdates({ userId, minutes, topicId, analyticsProperties })`.

**Gather.** A new query joins active subscriptions to Findings, reusing `isTopicFindingVisible` and `isFindingShown`. Do
not copy `loadFeedFindingRows`, which skips the invite gate. The owner has a subscription from `saveTopic`, so owned
Topics are included. One query, limited to 500 rows by score. A scoped list swaps the join for `loadVisibleTopic`.

**Last read time.** **Differs from the brief:** "or the previous session" has no data behind it, because MCP makes no
session rows and sign-in rows are not visits. The last read time is the newest `consumed_at`, joined on `topic_id` when
scoped. With no consumptions there is no boost. It can move backward when a consumption is removed, so it sets only the
boost. A hard cut would strand every Finding a list trimmed.

**Rank.** `relevanceScore + 0.1` after the last read time, then newest first, then Finding id. Scores bunch near the top
of the scale, so 0.1 moves a new Finding past most older ones. The constant is a starting value, and the eval in section
11 does not measure it.

**Reading time.** A read is `contentBytes / 6 / 250` minutes, at least one. A new nullable `resources.duration_seconds`
holds watch and listen lengths. The podcast feed path reads `itunes:duration`. The YouTube API path adds one
`videos?part=contentDetails` call per page, and the atom path has no duration. Unknown lengths use 5 minutes for read,
10 for watch, and 30 for listen. No backfill runs, since stored Resources keep their fields and use the estimates.

**Trim.** Walk the ranked list, keep what fits, skip what does not, and always keep the first. Then pack under
`MCP_PAGE_MAX_CHARS`. Skipped and packed-out rows count toward more.

**Mark read.** One transaction inserts `consumptions` with `onConflictDoNothing` and the matching `findingViews` rows,
then tracks one event with the count. `setConsumed` stays the single-row path, and both share the row shaping. A client
retry consumes the next batch, which is why the tool says `readOnlyHint: false`.

**Opener.** `updates-opener.md` runs on `scoreModel`, the middle role by price at $1.40 / $4.40 per million tokens,
since no role is named mid-tier. The prompt receives Topic names and a few titles, fenced as untrusted, and it sets the
rule that the opener names no single Finding or count, because a later list that day reads the same cached line. A new
`updatesOpener` reservation kind follows `summarize.ts`, on `loadOrProvisionUserLiteLLMKey`. The call is not a chat
turn, so it adds no spend row and LiteLLM meters it. `cacheJson` keys on user, UTC day, and Topic. A reservation
rejection or a failed call returns `opener: null` and stores nothing. The consumptions are saved before the call, so a
list waits 5 seconds for its opener. A slower call keeps running and stores its opener for the next list.

**The MCP view.** `UpdatesMcpView.tsx` shows the opener, the `FindingsTable` rows, and the more link in one card. Each
row needs its Topic's name, prompt, and permissions, and the Topic's latest podcast episode, so `buildUpdates` returns
`BuiltUpdates`: the list plus each Topic once and those podcast episodes. The tool keeps the model's result to a fenced
copy of the list and sends those and the plain list to the MCP view in `_meta`, so they never count against the page
budget. Packing counts 600 characters for each row's fences, so the fenced copy fits the page. A row's change updates
the MCP view's own copy of the list. A list cannot change length after it is built, because that would mark more
Findings read, so the tool call names the length.

### 7. Scan tools reuse the page's path

`start_scan` calls `runManualScan` with `toMcpAnalyticsProperties(toolCaller)` and a new `{ isOverageAllowed: false }`
option, and the started result gains `scanId`. Rejecting past the pool keeps rule 4A: an AI app must not cause a charge.
A monthly subscriber past the pool gets the daily limit message with a link to Plans.

**Differs from the brief:** "a topic the caller may edit" is wider than the page's rule. `authorizeManualScan` allows
the owner or an admin, while `topic:edit` also allows owning-team members. The tool keeps the page's rule, because a
team member spending the owner's daily pool from a chat is a new behavior that the brief does not ask for.

`stopManualScan` moves out of the route file so the tool and the route share it, with a catch around
`cancelTopicScanWorkflow`, which rethrows.

`read_scan_status` reuses `loadVisibleTopic` and the `topic:view` rule. It takes `topic_id`, not a scan id, because the
MCP view's route names the Topic. It reads the running Scan, or the latest that `toScanHistory` keeps.

**Stages** derive from existing columns: `waiting` while `pickedUpAt` is null, `gathering` until progress is saved, and
`reviewing` until the Scan closes. `recordScanProgress` already writes `keptCount` at each stage end, and live kept
reads the `findings` rows, as `saveFinding` writes them.

**Per-Source progress** needs a new nullable `scans.ingest_source_results`, written once as ingest ends, in the same
shape as `sourceResults`. `toSourceResultsView` shapes it for the caller.

*Alternatives.* Writing `sourceResults` early breaks "a running Scan has no results" and would start `TopicScanRecap`
charting stopped Scans. Redis would avoid a migration, but it needs a key, a lifetime, and a failure path for one read,
against one column in an update that already runs.

**Polling.** The MCP view calls `read_scan_status` every 10 seconds for two minutes, then every 30 seconds. A poll is a
tool call, so its peak of 6 calls a minute leaves the limit of 30 per 60 seconds to the model and to a second MCP view.
A 429 keeps the last state. Polling pauses while `document.hidden` is true. The first status needs no poll, because
`start_scan` returns it.

### 8. A Scan started over MCP renders its Podcast Episode, and the recap plays it

This is the user's decision, replacing the brief's skip option. No scan option, column, or code path exists for it. The
Scan workflow already starts the Podcast Episode workflow for every succeeded Scan, so `start_scan` needs no podcast
code at all, and `create_topic`'s first Scan stays as it is. The report email, billing, and plan length all follow the
existing rules.

The only new work is showing it. `read_scan_status` reads the `episodes` row by `scan_id` and returns a `podcastEpisode`
state beside the recap:

| State | Meaning | MCP view |
| --- | --- | --- |
| `recording` | The row is recording, or the Scan succeeded less than two minutes ago, the Topic's podcast is on, and no row exists yet | Recording line, keep polling |
| `published` | The row published | Play control |
| `none` | Podcast off, row failed, or two minutes passed with no row | No play control, polling ends |

Two minutes covers the child workflow's start. `planPodcastEpisode` can skip with no row, for example while a Personal
sources conversion is pending, so `none` has to exist. The MCP view stops polling after 30 minutes of `recording` and
shows a link to the Topic's page, so an open frame does not poll forever.

A published row goes through `loadMcpViewPodcastEpisodes`, which adds the 24-hour signed play token, into the
`carlnotes/card` metadata. `PodcastEpisodePlayButton` calls the shell's one `McpViewPodcastPlayer`. Its existing audio
error handler shows the "Listen on CarlNotes" link when a host blocks audio, so the recap inherits the fallback with no
new code. `UnpublishedPodcastEpisodeCard` shows the recording line. Text results state the same three states and the
page link.

### 9. `read_topic_context` wraps retrieval, and retrieval gets the fixes

The tool follows `searchFindings` in `apps/api/mcp/results.ts`: `loadVisibleTopic`, then the user's LiteLLM key, then a
catch that turns a budget rejection into text. An unconnected caller gets `CONNECT_ACCOUNT_TEXT` before any key lookup,
since an undefined key falls through to the master key. Visitors are excluded because `mcp-server` bars stored Resource
text to them and limits their model calls, and visitors cannot chat.

**Differs from the brief:** "no CarlNotes model call" holds for generation only. Retrieval makes one embedding call on
the user's own key.

Shared fixes in `retrieve.ts`, which reach chat too:

- `readSources` leaves out personal `ai_agent` and `email` Sources.
- `toRankTopicFindingsQuery` and `readScanSummaries` apply invite activation. This also closes the same gap in
  `search_topic_findings`.
- `RetrievedFinding` gains `findingId`.

`list_topics` gets the same Sources filter in `loadReadyTopicSourcesByTopic`, through `isReadySharedSource`.

Sender-only layers come from `loadSenderPersonalSourcesContext`, never `readPersonalSourcesContext`, and the batch
annotation read. Attachment context stays `topic.ownerId === userId`. `fenceUntrusted` wraps each untrusted string with
one per-call nonce, in both text and structured content, and the app's closing wording comes after the last block. Host
models do not know the convention, so the server instructions state it.

Bounds: attachment context trims to 12,000 characters first, then whole Findings leave from the end under
`MCP_PAGE_MAX_CHARS`, and the result says what left.

### 10. Tool discovery

`new McpServer(info, { instructions })` returns instructions from initialize, in stateless mode too. New tools append to
`EXPECTED_TOOL_ANNOTATIONS`, so the existing order and names stay, as the directory listing requires.

Descriptions keep their pinned openings and bans: `list_topics` starts "The topics you may read", the `subscri` ban
stays, and `suggest_topics` keeps "Never call it on your own initiative". The annotation check gains a phrase table in
`mcpContractTestFixtures.ts`, one row per tool, so each description must contain Carl, CarlNotes, and its phrases.

### 11. An eval sets the attachment score weight in Topic matching

Embed `name\nprompt` and attachment context separately, once per unique text, in both the candidate pass and the
recheck:

```text
relevance = nameAndPromptScore + attachmentScoreWeight * max(0, attachmentScore - nameAndPromptScore)
```

Tying attachment evidence to a Topic's purpose gives a simple property: no context, or weaker context, leaves the name
and prompt score alone. `evals/topic-matching/` measured the values below over 15 labeled cases, 5 decoy pairs, and 5
no-match cases (Appendix), and `evals/results/topic-matching.json` holds the report.

- An attachment score weight of 0.5 is the only weight that reached 15/15 and held 5/5 decoys.
- The minimum suggested relevance moves from 0.6 to 0.55. At 0.6 only 11 of 15 labeled Topics clear it, and clarified
  Topics at 0.56 to 0.58 lose their automatic check. At 0.55, 14 of 15 clear, and the best no-match stays 0.149 below at
  0.401.
- The minimum filing relevance stays 0.75. It files without asking, so it stays well above every no-match, and 5 of 15
  labeled Topics clear it. A Topic below it still reaches the sender as a suggestion.

Only Topics with attachments cost a second embedding, and `TOPIC_MATCH_BATCH_SIZE` batching stays. Both callers inherit
the change through the shared function, and no UI file changes.

*Alternatives.* The name and prompt score alone lost the two attachment-clarified cases. An earlier nine-case set scored
weighted blending 8/9 and `max(nameAndPrompt, context - 0.15)` 9/9 with a margin of 0.006, and the second lets strong
context replace the name and prompt score outright.

### 12. Test host and gates

The test host the living spec requires gets built here, under `apps/web/src/mcpViews/testHost/`, with ext-apps'
`AppBridge` loading each MCP view's real html in a sandboxed frame. The new action tests need it, and the existing
direct tests move onto it where they cover the listed actions.

The largest fixture Topic gains stored embeddings, `embeddingModel`, and text, because fixture Resources have none and
`read_topic_context` would otherwise return nothing. `checkPageBounds` is exported for the new sections.

### 13. Analytics report ids and counts, and an MCP view reports only what reaches the server

`mcp_tool_called` already wraps every tool, so each new tool is counted by app. It keys to an app's name, so it cannot
show what a user did. The product events fill that gap: updates, a Personal sources confirmation, limit, rejection,
delete, and summary, and AI app setup. Each one holds ids, counts, and flags, because Personal sources content is
private and encrypted. The privacy page says so.

An MCP view's content security policy allows no connection out, and the only way out is a tool call. Its podcast player
requests audio from the api, so that request reports the play. A Finding opened in an MCP view and a podcast episode
finished there reach no server, so neither reports anything. A telemetry-only tool would close that gap, but it would
expose a tool with no use to the reader, so this change does not add one.

Three counts are approximate on purpose. A Source that a first send creates reports `personal_source_entry_received`
and no `source_added`, because the flag would change a frozen send result. A client retry with the same request id
counts again, because a replay looks like an accepted send. Private annotation reads report nothing, because
annotations arrive with the feed rows.

### 14. Confirmation replaces receipt in owned names

A receipt now means only a third party's record: Expo's push receipt or an app store's purchase receipt. What a send,
an import, an email, or a Topic Draft leaves behind is a confirmation, in names, comments, and copy. A result field
and a table rename with it, because a word left in storage keeps coming back through every query.

Migration `0142` renames the table, its two `confirmation_id` columns, their constraints, and the indexes in place, so
no row moves. A Topic Draft's stored record is a `TopicDraftConfirmationRecord`, because `toTopicDraftConfirmation`
already returns the signed string.

### 15. Plain names for read state and the Topic matching values

A `consumptions` row is a consumption, so "read mark" leaves the specs and comments. The customer's Mark read control
and the `mark_finding_consumed` tool keep their names. In Topic matching, the attachment score weight replaces "lift"
and "attachment share", and `attachmentScore` replaces `contextScore`, so the weight names the score it applies to. The
minimum suggested relevance and the minimum filing relevance replace the picker floor and the email floor. No value
changes.

### 16. Job lease replaces claim

Each row in `claims` was already a lease, and the word also named OAuth token claims and a queued link's state. The
table is now `job_leases`, and `runWithJobLease` in `packages/db/jobLease.ts` takes it under a job name. A claim of a
queued row keeps its word. Migration `0143` renames the table and its primary key index in place, so a live lease
moves with the table and two runs still cannot overlap.

## Risks / Trade-offs

- **Directory review.** [The CarlNotes MCP UI page in Notion says MCP Scans skip the Podcast Episode until Anthropic
  rules on AI audio under rule 4B] → The user chose to render it. Playback already ships in the findings MCP view, so
  this widens an existing behavior. The Notion page and the open email to mcp-review@anthropic.com stay as they are, and
  the user decides on both.
- **A retry spends a list.** [A lost response marks Findings read that the user never saw] → The Findings stay in the
  Feed, muted, and an undo is out of scope.
- **Cached opener against a changed list.** [A morning line reads wrong at night] → The prompt keeps it general, and
  the eval checks that.
- **Poll load.** [Many open MCP views poll one server] → One call per MCP view at the existing schedule, under the
  existing limit.
- **Stored bundles and new fields.** [A stored bundle reads a removed field] → No stored bundle exists before version 9,
  so the `confirmations` rename breaks none. A host that cached version 8 html shows one Topic of a multi-Topic send.
  From version 9 on, results only gain fields, and a type test pins version 9's fixture against the current contract.
- **The rename's deploy window.** [The migration runs before `app` deploys, so old code misses the table] → Inbound
  mail fails for that window, Resend retries the webhook, and the sweep picks up what is pending. A retried Topic Draft
  confirmation signed before the deploy gets a new record id, so a retry inside its 15 minutes can create a second
  Topic.
- **A hidden iframe.** [A host may throttle timers, so a recap arrives late] → The first poll after it wakes reads the
  current state.
- **Popover clipping in a frame.** [Not verified] → The expanded row replaces the popover in tables. Other popovers are
  checked in the test host.
- **Jobs during a release.** [A process on the old build reads `claims` after the migration] → The sweep, the
  viewer count sync, the budget reset, and Personal sources email and summaries fail until they run the new build, and
  each later run picks up what they missed. The api takes no job lease, so requests keep working.

## Migration Plan

1. Before merge, run `mcp-views:freeze --bundle` for version 9 on a bundle built from the commit before the shell, under
   production credentials.
2. Merge. The release migrates before deploy, so the two nullable columns, the `finding_id` indexes, and the renamed
   email and job lease tables exist first.
   Then run `prompts:sync:prd`, as for every new prompt.
3. Edit the directory listing for the six new tools and refresh its screenshots.
4. Rollback: the columns are nullable and unread by old code, and removing the tools restores the old list. Stored
   bundles stay in place. Old code needs the renames reversed first, because it reads `personal_source_email_receipts`
   and `claims`.

## Appendix: topic matching eval

`bun run eval:topic-matching` scores 20 made-up sent items against 12 made-up Topics with the real embedding model.
Fifteen items have an expected top Topic, 5 of those name a decoy that must rank below it, and 5 items match nothing.
The Clears columns count labeled Topics that clear 0.55 and 0.75.

| Formula | Top match | Decoys held | Clears 0.55 | Clears 0.75 | Best no-match |
| --- | --- | --- | --- | --- | --- |
| Combined text | 13/15 | 3/5 | 13/15 | 6/15 | 0.405 |
| Name and prompt only | 13/15 | 5/5 | 11/15 | 5/15 | 0.388 |
| Weight 0.25 | 14/15 | 5/5 | 12/15 | 5/15 | 0.395 |
| Weight 0.35 | 14/15 | 5/5 | 12/15 | 5/15 | 0.398 |
| **Weight 0.5** | **15/15** | **5/5** | **14/15** | **5/15** | **0.401** |
| Weight 0.65 | 14/15 | 4/5 | 14/15 | 6/15 | 0.405 |
| Weight 0.75 | 14/15 | 4/5 | 14/15 | 7/15 | 0.408 |

At weight 0.5, minimum relevances of 0.5 and 0.55 clear 14/15, 0.6 clears 11/15, 0.65 clears 9/15, 0.7 clears 8/15, and
0.75 clears 5/15. No no-match case clears any of them. The one Topic below 0.55 is a fueling question that scores 0.400
against "Endurance nutrition", which still ranks it first.

The observed failure: at weight 0.5, CarlNotes Documentation scores 0.620 and NachoNacho 0.599 (name and prompt 0.385,
attachment 0.814). The combined text ranked NachoNacho first.
