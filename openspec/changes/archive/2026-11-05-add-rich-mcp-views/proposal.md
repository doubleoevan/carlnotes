# Proposal

## Why

CarlNotes in Claude or ChatGPT reads like a list of tool results, while the site gives users tables, a Scan they can
watch, and a podcast. A connected user cannot ask "what's new", cannot start a Scan, and cannot ask a question of a
Topic's material without a CarlNotes model call. Hosts also miss requests addressed to Carl, because the server sends no
instructions and only two tool descriptions name him.

Personal sources routing has a matching fault. The matcher embeds a Topic's name, prompt, and up to 8,000 characters of
attachment context as one text, so a long attachment outweighs the Topic's purpose. A CarlNotes development chat ranks
"How do I use NachoNacho" (0.659) above "CarlNotes Documentation" (0.620) because of an architecture attachment. Both
send paths share that matcher, so `suggest_topics` and email filing both inherit the fault.

## What Changes

- **MCP view shell and routing.** A memory router replaces the MCP view switch. One shell route holds a slim brand bar
  and a back button. Routes are `/search`, `/topic`, `/findings/:topicId`, `/send`, `/updates`, and
  `/brew/:topicId`, and in-view navigation goes one hop at most. The header's brand link becomes one shared component.
- **Findings and search tables.** The findings and search MCP views become tables built from Nightshift and the web's
  own controls: rating, bookmark, mark read, source, publish date, an expandable relevance explanation, and the sender's
  own private annotation beneath it. They page through tool calls, follow the host's theme, and fit narrow containers.
- **Updates.** One api function serves a new `read_updates` tool and MCP view. It ranks unread Findings across
  subscribed Topics, or one Topic, trims them to 5, 15, or 30 minutes, writes one Carl opener, and marks the shown
  Findings read. Every plan gets it.
- **Scans from a connected AI app.** New `start_scan`, `read_scan_status`, and `stop_scan` tools and a scan MCP view
  show kept counts, per-Source results, a stop control, and the recap. A Scan started over MCP renders its podcast
  episode like any other Scan. The recap plays it through the MCP view podcast player, with the findings MCP view's link
  fallback if the host blocks audio.
- **Topic context for the host.** A new read-only `read_topic_context` tool returns what chat retrieval gathers for a
  question, fenced as untrusted, so the host writes the reply and no chat turn is billed. Attachment context stays
  owner-only. Private annotations and Personal sources context go only to their sender.
- **Feedback from an MCP view.** A new `send_finding_feedback` tool saves the words a user types beside the thumbs in
  an expanded row, so telling Carl why works the same as on the site.
- **Tool discovery.** The server sends instructions at connect. Every tool description names Carl and CarlNotes and
  lists the phrases it answers to, and none tells the model to call a tool unprompted.
- **Versioned UI resources.** Each MCP view keeps a versioned URI, and a version a host has locked is served from its
  own stored bundle. Current URIs and the `_meta` key keep working.
- **Host features.** Fullscreen for tables, picture-in-picture for the podcast player where a host supports them, more
  of the brand bar in fullscreen, and plain text results for hosts without UI.
- **Release gates and docs.** Every new tool has a title and annotations, the MCP smoke tests cover each one, the
  result-size check covers the largest Topic, and the MCP guide gains example phrases for every tool.
- **Topic matching.** The matcher scores a Topic's name and prompt separately from its attachment context, and an
  attachment can only raise a Topic part of the way toward its own score. A labeled ranking eval sets the attachment
  score weight and the minimum relevances before they are locked. The picker UI stays the same.
- **Product analytics.** PostHog reports updates, Personal sources confirmations, limits, deletes, summaries, and AI app
  setup, plus the Scan's Personal sources counts and an MCP view's podcast plays, with ids, counts, and flags only.
- **Job lease names.** The `claims` table becomes `job_leases`, and `runWithClaim` becomes `runWithJobLease`.
- **Confirmation names.** Owned code says confirmation where it said receipt. A send result's `receipts` field becomes
  `confirmations`, and a rename migration moves `personal_source_email_receipts` to
  `personal_source_email_confirmations`. Expo push receipts and app store receipts keep their third-party word.
- **Result rows.** A Finding's row drops its Resource kind icon on the web, on mobile, and in the MCP views. The
  Resource kind filters keep their icons. Every other search result starts at its title, with its kind's icon or avatar
  on its metadata line, where a Finding shows its favicon. The MCP view tables and the Personal sources items keep one
  row open at a time.
- **Read fixes the new tools expose.** Chat retrieval and `list_topics` leave other senders' personal Sources out, and
  retrieval and Topic Finding search apply the invite activation rule.

## Capabilities

### New Capabilities

- `updates`: the ranked, budget-trimmed list of unread Findings, its opener, its consumptions, and its MCP tool and MCP
  view.
- `personal-sources-topic-matching`: how a sent item ranks editable Topics, shared by `suggest_topics` and email filing.

### Modified Capabilities

- `mcp-views`: the shell and routes, tables, host theme and display modes, the scan and updates MCP views, and
  versioned bundles.
- `mcp-server`: server instructions, tool descriptions and phrases, the nineteen-tool inventory, the scan and retrieval
  tools, the release gates, and the privacy policy.
- `personal-sources`: a sender sees their own private annotation in the findings MCP view and through retrieval, and
  personal Sources stay out of shared Topic reads.
- `source-results`: the ingest stage records per-Source progress that a running Scan's status can read.
- `scan-stopping`: a connected AI app can stop a running Scan under the same authority.
- `docs-site`: the MCP guide covers the nineteen tools with example phrases.
- `monitoring-analytics`: Personal sources, updates, and MCP views report product events by ids and counts.
- `feed-homepage`, `topic-detail-page`, and `mobile-feed`: a Finding's row shows no Resource kind icon.
- `ai-agent-sends`, `authorization`, `email-forwarding`, and `topic-editing`: owned wording says confirmation.
- `ai-agent-sends` and `mcp-views`: the picker's limit is the minimum suggested relevance.
- `scheduled-scans`, `deploy-mechanics`, `request-capacity`, `stored-object-deletion`, `subscription-billing`, and
  `viewer-counts`: owned wording says job lease.
- `site-search`: a search result that is not a Finding shows its icon where a Finding shows its favicon.

## Impact

- **Api:** `apps/api/mcp/` (server, tools, resources, MCP view data), new scan and updates handlers beside
  `apps/api/topic/`, `apps/api/mcp/uiResources.ts` version serving.
- **Pipeline and models:** `packages/pipeline/personalSources/matchTopics.ts`, `packages/pipeline/chat/retrieve.ts`,
  `packages/pipeline/ingest/`, a new opener prompt in `packages/models/prompts/`, and a new spend reservation kind.
- **Database:** two nullable columns, `scans.ingest_source_results` and `resources.duration_seconds`. Older rows use
  per-kind estimates, so no backfill runs. `consumptions`, `bookmarks`, `finding_feedback`, and `finding_views` gain a
  `finding_id` index, because a Scan's pruning delete cascades into each one. A rename migration moves
  `personal_source_email_receipts` and its `receipt_id` columns to `personal_source_email_confirmations` and
  `confirmation_id`, with their constraints and indexes. Another moves `claims` to `job_leases`.
- **Web and mobile:** `apps/web/src/mcpViews/`, the header brand link, the Finding and search rows without their
  Resource kind icon, the loading skeletons, one open row at a time in Personal sources, the Nightshift inventory, and
  the `apps/mobile/parity.md` rows. New stories join the UI test captures.
- **Release:** a new `mcp-views:freeze` script writes stored bundles and `packages/contracts/mcpViewVersions.json`.
  New tools need a directory listing edit and new screenshots.
- **Evals and tests:** a new ranking eval, an opener eval, the MCP view test host the living spec already requires, and
  new MCP smoke sections.
- **Dependencies:** `apps/web` declares `playwright-core`, which the root and `apps/api` already use, for the MCP view
  test host.
