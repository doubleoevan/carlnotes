# Tasks

## 1. Topic matching

- [x] 1.1 Build `evals/topic-matching/` with labeled ranking cases over real embeddings, including no-match and decoy
          cases, and verify it reports the top match rate, decoys held, minimum relevance clearance, and the best
          no-match score per formula
- [x] 1.2 Run the eval on the current matcher and on the weighted formula, choose the attachment score weight and both
          minimum relevances from its report, and verify the chosen values and report are recorded in `evals/results/`
          and `design.md`
- [x] 1.3 Change `matchTopics.ts` to embed name and prompt apart from attachment context, once per unique text, in the
          candidate pass and the recheck, and apply the weight, then verify `matchTopics.test.ts` passes with its pinned
          embedded text updated
- [x] 1.4 Add regression tests for the NachoNacho case, an unrelated long attachment, a clarifying attachment, a weak
          attachment, and a Topic with no attachment, and verify each fails on the old combined text
- [x] 1.5 Confirm `suggest_topics`, email filing, name hints, cursor paging, name search, permission recheck, and
          privacy through the existing tests in `matchTopics.test.ts`, `emailTopic`, and `topicSuggestions.test.ts`,
          with no UI file in the diff

## 2. Shared read fixes

- [x] 2.1 Leave personal `ai_agent` and `email` Sources out of `readSources` and `list_topics`, and verify with tests
          that a follower and a chat turn receive none
- [x] 2.2 Apply invite activation in `toRankTopicFindingsQuery` and `readScanSummaries`, and verify with tests that an
          inactive invite reads no hidden Finding or Scan summary through chat or `search_topic_findings`
- [x] 2.3 Add `findingId` to `RetrievedFinding` and verify the chat tests and `tsc -b` pass
- [x] 2.4 Add the batch `loadFindingPersonalAnnotations` read and verify with a test that one page runs one query and
          returns only the caller's rows

## 3. Schema and ingest

- [x] 3.1 Add nullable `scans.ingest_source_results` and `resources.duration_seconds`, run `bun run db:generate`, and
          verify the migration applies to the dev database (by hand if a parallel worktree's timestamp skips it)
- [x] 3.2 Save per-Source progress as ingest ends, shaped like results, and verify with tests that a running and a
          stopped Scan still have no results and `TopicScanRecap` charts neither
- [x] 3.3 Read `itunes:duration` in the podcast feed path and add one YouTube `contentDetails` call per page on the API
          path, failing open, and verify with ingester tests, including a failed duration call that keeps the Resources

## 4. Tool discovery

- [x] 4.1 Send server instructions from `apps/api/mcp/server.ts` and verify with `client.getInstructions()` on both
          routes
- [x] 4.2 Rewrite all thirteen existing tool descriptions to name Carl and CarlNotes and list their phrases, and verify
          the pins in `tools.test.ts` and `topicSuggestions.test.ts` still pass
- [x] 4.3 Add a phrase table to `mcpContractTestFixtures.ts` and extend the annotation check, and verify a description
          that drops a name, drops a phrase, or asks for autonomous initiation fails with the tool's name
- [x] 4.4 Add the rows for the updates list and the MCP view routes to the `domain-model` skill, and verify every
          new noun in this change appears there

## 5. Scan tools

- [x] 5.1 Add the overage option and `scanId` to `runManualScan`, and verify with tests that a subscriber with a card
          past the pool starts nothing and bills nothing over MCP, and the topic page's behavior is unchanged
- [x] 5.2 Add `start_scan` with its annotations, on both routes, and verify with tests for owner, team member, visitor,
          a running Scan, each gate's text, and the bound Topic
- [x] 5.3 Move `stopManualScan` to a shared module with a catch around the cancel, add `stop_scan`, and verify with
          tests for owner, non-owner, visitor, nothing running, and a failed cancel
- [x] 5.4 Add `read_scan_status` with stage derivation, progress and result shaping, and the three Podcast Episode
          states, and verify with tests for each stage, a stopped Scan left out, a private Topic, owner and visitor
          details, and each state
- [x] 5.5 Verify with a test that a Scan started by `start_scan` reaches the Podcast Episode workflow unchanged, with no
          scan option in the code path

## 6. Topic context tool

- [x] 6.1 Add `read_topic_context` following `searchFindings`, and verify with tests that a visitor runs no embedding,
          the embedding bills the user's key, a spent budget returns text, and no chat turn is stored
- [x] 6.2 Add owner-only attachment context and sender-only layers, and verify with tests for a follower, two senders,
          and an inactive invite, each with a private canary
- [x] 6.3 Fence untrusted text in text and structured content with a per-call nonce, and verify with a test that an
          injected string stays inside its fence in both
- [x] 6.4 Trim attachment context then whole Findings under `MCP_PAGE_MAX_CHARS`, and verify with a test that an
          oversized attachment fits, keeps its Findings, and states what it shortened

## 7. Updates

- [x] 7.1 Add the reading time estimate with tests for reads, durations, and unknown lengths of each kind
- [x] 7.2 Add the gather, last read time, rank, and trim steps in `apps/api/topic/updates.ts`, and verify with tests for
          visibility, invites, the boost, no consumptions, a long Finding, one oversized Finding, and the scoped last
          read time
- [x] 7.3 Add the bulk read write sharing `setConsumed`'s row shaping, and verify with a test that two lists share no
          Finding and that left-out Findings stay unread
- [x] 7.4 Add `updates-opener.md`, its builder, `FALLBACK_PROMPT_TEMPLATES`, `prompts:sync`, and the `scan.smoke.ts`
          list, and verify with an eval under `evals/` that openers name no Finding or count and never say what the
          reader missed
- [x] 7.5 Add the `updatesOpener` reservation, the daily cache, and the fallback, and verify with tests for a cache
          hit, a scoped opener, a rejected reservation, a failed call, and an empty list with no model call
- [x] 7.6 Add the `read_updates` tool with its text result, and verify with tool, bound Topic, and page budget tests
- [x] 7.7 Return each row's Topic and podcast episodes from `buildUpdates`, hold the list alone in the tool's result,
          show the standard Finding rows in the MCP view, and verify in the browser that rows render unread and that
          a rating stays in the list with no new list
- [x] 7.8 Verify that `check-contract-freeze.ts` and `check-client-parity.ts` pass

## 8. MCP view foundation

- [x] 8.1 Build the test host under `apps/web/src/mcpViews/testHost/`, and verify it loads each MCP view's real html in
          a sandboxed frame under its policy, sends results and theme, and records tool calls and links
- [x] 8.2 Move `mcpViews.test.tsx` onto the test host where it covers listed actions, and verify the existing scenarios
          still pass there
- [x] 8.3 Extract the header brand link into one shared component with a story, and verify the header renders as before
- [x] 8.4 Add the back button component with a story, add both to `inventoryTable.md`, and verify `stories.test.ts`
          passes
- [x] 8.5 Add `mcpViewRouter.tsx`, `McpViewShell`, `navigateMcpView`, and `McpViewLink`, replace the switch, and verify
          through the test host that each MCP view opens on its route and existing behavior is unchanged
- [x] 8.6 Add the history guard, and verify that `/plans` and both podcast question paths open on the site with the
          route unchanged, through the test host for the visitor's question and through `mcpViewHistory.test.ts` for the
          paths no click reaches in a frame
- [x] 8.7 Add one-hop moves with hop data in route state, and verify a row to findings, back with no tool call, and a
          second hop that opens on the site
- [x] 8.8 Add `mcpViewTokens.css` to `nightshift:write`, apply filtered host variables, and verify through the test host
          that host colors apply, a host with no variables keeps Nightshift, and fonts stay
- [x] 8.9 Add the container layout to the shell, and verify at 320 pixels that nothing scrolls sideways
- [x] 8.10 Add display mode requests, the picture-in-picture control, and the fullscreen brand bar, and verify through
           the test host that each shows only where listed and follows the mode the host returns
- [x] 8.11 Resolve `HostFavicon` and `Avatar` against the connected site url and hide the two fetches that fail in a
           frame, and verify with no `/api` request in the stories and test host

## 9. Tables

- [x] 9.1 Split `TopicResourceInfo` so the popover and an expanded row share one component, and verify the topic and
          search pages render as before through the existing tests and stories
- [x] 9.2 Build `FindingsTable` on core `DataTable` with paging through cursors and annotations from `_meta`, and verify
          through the test host for rating, bookmark, mark read, expansion, next, previous, a visitor, no results, and
          long text
- [x] 9.3 Build `SearchResultsTable` with numbered paging, and verify through the test host for Follow, See all, paging,
          and expansion
- [x] 9.4 Add `personalAnnotations` to the findings and search MCP view data, and verify with an api test and a private
          canary that only the sender's `_meta` holds it, and that text and structured content never do

## 10. New MCP views

- [x] 10.1 Add `updates` and `scan` to `MCP_VIEWS` and their resources, name them on the tools, and verify the
           resource and tool tests
- [x] 10.2 Build `UpdatesMcpView` with stories and test host cases, and verify the opener, rows, more link, empty
           list, a list with no opener, and the hop to findings
- [x] 10.3 Build `ScanMcpView`'s running state with the chart's rows, its own polling rates, and a stop control, and
           verify through the test host for each poll, a rate limited poll, a hidden frame, stop, and no stop for a
           follower
- [x] 10.4 Add the recap with `TopicScanRecap`, the hop to findings, and the Podcast Episode through the shell's player,
           and verify through the test host for all three states, play with a token, the blocked audio link, and the
           30-minute limit
- [x] 10.5 Move all MCP view stories under one MCP views section, and verify the fetch guard passes on every story

## 11. Versioned UI resources

- [x] 11.1 Add `packages/contracts/mcpViewVersions.json`, the current version constant, and a test that the current
           version is above every stored one
- [x] 11.2 Add `scripts/freeze-mcp-view-bundle.ts` behind a root `mcp-views:freeze` script, update the README
           Development section, and verify against dev object storage that it uploads the files, writes the manifest,
           and raises the version
- [x] 11.3 Serve stored versions from `uiResources.ts`, listing only the MCP views each holds, and verify with tests for
           a stored read, the current read, aliases, and a missing bundle that falls back and reports
- [x] 11.4 Add a test that version 9's fixture still satisfies the current MCP view data types, and verify a removed
           field fails it

## 12. Docs, policy, and gates

- [x] 12.1 Update `add-to-ai.md` with all nineteen tools and a phrase table, and verify the page builds with `bun run
           build:docs`
- [x] 12.2 Update every tool count: `README.md`, `apps/docs/AGENTS.md`, `apps/docs/personal-sources-rollout.md`, and
           `apps/api/AGENTS.md`, and verify a grep finds no "thirteen" or "eleven-tool"
- [x] 12.3 Update `PrivacyPage.tsx` and its date for excerpts, Scan reports, and annotations, and verify the page
           renders
- [x] 12.4 Update `apps/api/AGENTS.md`, `apps/web/AGENTS.md`, the root module map, and `apps/docs/` guides for every new
           folder, entry point, and script, and verify the ship docs check finds no drift
- [x] 12.5 Add `read_topic_context` embeddings and text to the largest fixture Topic, export `checkPageBounds`, and add
           smoke sections for each new tool on both routes, and verify `bun run smoke:mcp` passes
- [x] 12.6 Run `bun run check` and verify every gate is green, with `bun install` and the dev database migrations
           applied first

## 13. Analytics

- [x] 13.1 Add the `api` entry point and the Personal sources, updates, and AI app setup events to
           `packages/contracts/analyticsEvents.ts`, report them from their routes, tools, and workers with ids and
           counts only, and verify each event's test proves that no private fixture text reaches its properties
- [x] 13.2 Report `episode_played` from an MCP view's first audio request, add the Personal sources counts to
           `scan_completed`, and verify a seek, a visitor's token, and a session's play report nothing
- [x] 13.3 Update `PrivacyPage.tsx` and `apps/docs/personal-sources-rollout.md` for the Personal sources events, and
           verify `openspec validate add-rich-mcp-views` passes

## 14. Result rows

- [x] 14.1 Remove the Resource kind icon from Finding rows on the web, on mobile, in the MCP views, and in the search
           typeahead, and keep it on the Resource kind filters
- [x] 14.2 Move the icon of a search result that is not a Finding onto its metadata line on the search page, in the
           search MCP view, and on mobile, and drop the kind icon block from the loading skeletons
- [x] 14.3 Keep one row open at a time in the findings and search MCP view tables and in the Personal sources item list
           on web and mobile
- [x] 14.4 Add `send_finding_feedback`, move the rating block into `TopicFindingRating`, and show it in the expanded
           rows of the findings and search MCP views, with `mcpViewFetch` sending its words through the tool
- [x] 14.5 Show only the running heading, kept count, and Source counts in `ScanMcpView`, as the topic page does, and
           keep the stage's words in the `read_scan_status` text
- [x] 14.6 Move the thumbs, bookmark, and mark read out of the MCP view table rows into `TopicFindingControls`, the
           block that closes the note popover and an expanded row, and leave each row its expand button beside the title

## 15. Security and performance audit

- [x] 15.1 Reject a JSON-RPC batch on the `/mcp` routes, return a generic error from a tool that throws one, and stop a
           long feed duration, a large cursor, and a NUL in feedback from reaching a query
- [x] 15.2 Fence `read_updates`, `start_scan`, and `read_scan_status` in both representations, fence the url in
           `read_topic_context`, and send the MCP views their plain copies in `_meta`
- [x] 15.3 Leave private Topics with unconverted Personal sources out of a list across Topics, for every user but the
           owner
- [x] 15.4 Stub the voice detector out of the MCP view bundle, limit a list's wait for its opener to 5 seconds, slow the
           scan MCP view's poll, and add the `finding_id` indexes that a Scan's pruning delete needs

## 16. Confirmation names

- [x] 16.1 Rename every owned receipt to confirmation across code, comments, copy, and docs, keeping Expo's push
           receipts and the app stores' purchase receipts
- [x] 16.2 Rename `personal_source_email_receipts`, its `receipt_id` columns, their constraints, and the indexes in
           one migration with a lock timeout, and verify the Personal sources smokes on the migrated dev database
- [x] 16.3 Rename a send result's `receipts` field and `sendReceiptLinks`, and verify the MCP view tests and
           `bun run smoke:mcp`

## 17. Consumption and Topic matching names

- [x] 17.1 Say consumption where the code and specs said read mark, and keep the Mark read control and
          `mark_finding_consumed`
- [x] 17.2 Rename lift and the attachment share to the attachment score weight, `contextScore` to `attachmentScore`,
          and the two floors to `MIN_SUGGESTED_TOPIC_RELEVANCE` and `MIN_FILED_TOPIC_RELEVANCE`, with no value change,
          and rerun the eval so that its report holds the new names
- [x] 17.3 Rename the `claims` table to `job_leases` with migration `0143`, `packages/db/claim.ts` to `jobLease.ts`, and
          the `runWithClaim` family to `runWithJobLease`, and keep the word for a claim of a queued row

## Workflow follow-up

- Run `/ship`, then archive with `openspec archive add-rich-mcp-views --yes`.
- Before merge, build the commit before the shell in its own checkout with `bun run --cwd apps/web build:mcp-views`,
  then run this change's `doppler run --config prd -- bun run mcp-views:freeze --bundle <that checkout's
  apps/web/dist/mcp-views> --mcp-views search,topic,findings,suggest-topics` for version 9.
- After deploy, run `prompts:sync:prd`, edit the directory listing for the six new tools, and refresh its screenshots.
