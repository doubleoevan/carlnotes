# Proposal: MCP parity

## Why

An AI host can read a topic's feed, edit a topic, scan, react, and read the news, posts, and Dashboards over MCP, but it
cannot do most of what a person does on the web and in the mobile app: write a tasting note, work in a team, read a
profile or the account, report content, or set a topic's image. People who live in Claude, ChatGPT, or a coding agent
run CarlNotes end to end there. Parity is on jobs, not screens: the host already gives the chat, the voice, and the
composer, so each job becomes a tool, and each page a person reads becomes an MCP view that renders the same component
the web and the mobile app render.

## What Changes

- **Tools for the remaining jobs.** Seventeen new tools cover tasting notes, teams with their room and invites,
  profiles, activity, the account, reporting, blocking, deleting one's own hot take, a topic's image, and topic
  attachments by url or pasted text. `list_topics` gains the topics page's sections and a topic's similar topics, and
  `edit_topic` gains the team. Design section 1 lists every tool with its name, title, annotations, and view, for
  approval before the apply.
- **One rule for every new tool.** Each tool calls the function the web route calls. Where that logic lives inside a
  Hono route handler today (notes, the topic image, the team room, the profile and activity loaders, and the report
  path), it moves into a callable module first, and the route calls the module too.
- **Only irreversible actions are destructive.** `destructiveHint: true` goes on the tools that delete or overwrite
  what cannot be restored (`delete_note`, `delete_hot_take`, `save_note`, `set_topic_image`) and comes off every other
  write, so the host confirms those and nothing else.
  Creating and editing a topic, rating, bookmarking, following, reacting, and stopping a scan stop asking.
  **BREAKING** for the annotation contract and its check, not for any caller.
- **Six new views over shared components.** Note, team, profile, activity, account, and topics views. Each
  renders the component its page renders, from `packages/core` with the Nightshift contracts. A page component that
  is web-only today moves into `packages/core` first, and the web page and the mobile screen render the lifted
  component too. The Dashboard view already draws all five charts. `read_dashboard` keeps returning it with the
  summary strip and Carl's paragraph.
- **Films play in the host behind a switch.** No in-host playback switch exists today: views always try the audio. A
  new switch, `MCP_VIEW_FILM_PLAYBACK`, decides films. While it is on, the findings view's player plays a podcast
  episode's film from carlnotes.com with a signed play token. While it is off, the player shows the "Watch on
  CarlNotes" link, and the audio player is unchanged either way. Design decision 6 asks whether audio should sit
  behind the same switch.
- **The edit path gains the editor's moderation.** `edit_topic` runs the editor's name, prompt, and tags moderation,
  which it skips today, so a rule enforced on the web is enforced over MCP.
- **Release gates and docs.** Every new tool joins the annotation check, the MCP smoke tests on both routes, and the
  result-size check. Every new view joins the view tests and gets a story. The Add to AI docs page lists every tool.

Out of scope, each named in design section 9 with its reason:
- Cloning a public topic waits for that feature to ship.
- Chapter links, clip sharing, a category directory, and the account's organization have no web counterpart yet.
- Following people, a following feed, and posting to a profile do not exist and get no tools.

## Capabilities

### New Capabilities

None. Every behavior here extends a capability that already owns it.

### Modified Capabilities

- `mcp-server`: the new tools, their visitor and account rules, the destructive-only-for-deletes annotation contract,
  `list_topics` sections and similar topics, and the release gates for the new tools.
- `mcp-views`: the six new views over shared components, the view list and versions, the playback switch, and films
  playing in the findings view.
- `topic-tools`: `edit_topic` takes the team, runs the editor's moderation, and drops the destructive hint.

## Impact

- **api:**
  - New MCP tool modules under `apps/api/mcp/`.
  - Callable modules extracted from `apps/api/note/notes.ts`, `apps/api/topic/topicImagesRoute.ts`,
    `apps/api/chat/roomRoute.ts`, `apps/api/profiles.ts`, `apps/api/activity.ts`, `apps/api/report/flagContent.ts`,
    and `apps/api/userBlocks.ts`, with each route calling the module.
  - `apps/api/mcp/mcpContractTestFixtures.ts` and the smoke sections change.
- **contracts:** `packages/contracts/mcpViews.ts` gains six views, with `MCP_VIEW_VERSION` bumped to 12. The tool
  payloads are zod schemas next to their route payloads.
- **core:** components lifted from `apps/web` (design section 4), each with its `…Elements` type and both apps'
  adapters. Pairs that become shared leave `apps/mobile/parity.md`'s separately built table.
- **web:** new MCP views under `apps/web/src/mcpViews/` with stories and test host sections. The film adapter for
  views. The web pages render the lifted components.
- **mobile:** the screens whose web component moves to `packages/core` render it. No new mobile screen.
- **pipeline:** `ingestAttachment` and `ingestUrlAttachment` are called as they are. The topic image from a url
  reuses the upload's checks and storage.
- **docs:** `apps/docs/src/content/docs/account/add-to-ai.md`.
- **Listing:** the tool names are new names on the Claude directory listing and need a reviewed listing edit after the
  deploy.
