## 1. Schema and constants

- [x] 1.1 Move `EMBED_MODEL_NAME` out of `worker/review/filter.ts` into `db/schema.ts` beside `EMBED_DIMENSIONS` and update the filter's import. Pure refactor, same value.
- [x] 1.2 Add the `chatTurns` table to `db/schema.ts`: nullable `userId` referencing users with cascade delete, `topicId` referencing topics with cascade delete, `cost` numeric matching `scans.cost` precision, nullable `question` and `answer` text, and `createdAt`. Comment the nullable text as the persistence rule and the nullable user as the anonymous case.
- [x] 1.3 Add an index on `(topicId, createdAt)` so the anonymous rate-cap count and the persisted-conversation read are both covered.
- [x] 1.4 Generate the migration with `bun run db:generate` and verify it only creates `chat_turns`.
- [x] 1.5 Extend `db/schema.test.ts` with the chat turns table's shape.
- [x] 1.6 Add the Chat Turn entity row to `.agents/skills/domain-model/SKILL.md` and mirror it to `.claude/skills/`, naming why it is not "Chat Session".

## 2. Authorization and plan capability

- [x] 2.1 Add `keepsChatHistory` to `PlanConfig` in `shared/plans.ts`: true for premium, false for plus and free. Extend `shared/plans.test.ts` with the rank-order assertion that no lower plan holds a capability a higher plan lacks.
- [x] 2.2 Add `"chat:send"` and `"chat:persist"` to the `Capability` union in `api/authorization.ts` and handle both in the `isAllowed` switch. `chat:send` combines `canSeeTopic` with remaining monthly budget; `chat:persist` reads `keepsChatHistory` from the effective plan.
- [x] 2.3 Add `monthlySpendDollars(userId)` to `api/authorization.ts` returning scan and chat dollars since `startOfUtcMonth`, and sum both in `isMonthlySpendExhausted`.
- [x] 2.4 Extend `api/authorization.test.ts`: chat persist is premium-only and the capability union covers chat. The send decision's own refusal cases are pure-function tested as `decideChatTurn` in 4.6, since this file holds no database tests.

## 3. Chat retrieval and generation in the worker

- [x] 3.1 Add `chatModel()` to `worker/models.ts` returning the `chat-model` alias, beside `cheapModel` and `scoreModel`. The alias already exists in `litellm-config.yaml`.
- [x] 3.2 Write `worker/chat/retrieve.ts`: embed the question through `embedVector`, then select the Topic's Findings joined to Resources, filtered to `embeddingModel = EMBED_MODEL_NAME`, ranked by cosine distance against the question vector, cut to the top handful.
- [x] 3.3 In the same module, assemble the turn's context: the Topic's prompt, each selected Finding's title, url, relevance score and relevance explanation, that Finding's Resource text via `getResourceContent` falling back to `snippet`, and the most recent Scan summaries.
- [x] 3.4 Include attachment-derived context only when the requesting user is the Topic owner, matching `loadDownloadableAttachment`'s rule.
- [x] 3.5 Add `worker/prompts/chat-topic.md` with frontmatter (title, version, model tier, description, updated) and `{{variable}}` placeholders for the assembled context and the question. Register it in `FALLBACK_PROMPT_TEMPLATES` in `worker/prompts/fetch.ts`; `sync.ts` reads that same map, so it needs no separate edit. Restate the task after the untrusted block so the last thing the model reads is ours.
- [x] 3.5a Pass every retrieval value — the Topic prompt, Finding titles and relevance explanations, Resource text, Scan summaries, and the user's question — through `writePrompt`'s single interpolation map. That map is the one `harden-launch-readiness` makes untrusted-by-default, so keeping every value in it and never reaching for a second map is what makes the merge a no-op.
- [x] 3.6 Write `worker/chat/index.ts` exposing a streaming turn: build the prompt, call `streamText` against `chatModel`, attach `promptTelemetry`, and report final `usage` so the caller can tally cost with `tokenCost`.
- [x] 3.7 Export the chat entry point from `worker/index.ts`, the way attachments and scans already are.
- [x] 3.8 Prompt-assembly tests in `worker/chat/index.test.ts`: an empty finding set says the Topic has nothing indexed, a non-owner's empty attachment context renders as none, and the prompt forbids links and fences the material as data. The database-level behaviors — the stale-`embedding_model` exclusion, the snippet fallback, the owner-only attachment rule — go in `worker/chat.smoke.ts`, since no test in this repo touches the database.

## 4. Chat spend metering and the anonymous cap

- [x] 4.1 Write `api/topic/chat.ts` holding the turn's pre-check: resolve the Topic, ask visibility then `chat:send`, and return a discriminated result — `allowed`, `forbidden`, `budget`, or `rateLimited` — the way `ManualScanAuthorization` does.
- [x] 4.2 Implement the anonymous per-Topic rate cap as a count of `chat_turns` rows for the Topic with a null `userId` inside a rolling window. Put the window and the cap in module constants with an env override, starting low.
- [x] 4.3 Record the completed turn: insert a `chat_turns` row with the cost from `tokenCost(usage.totalTokens, CHAT_COST_PER_MILLION_TOKENS)`, storing question and answer text only when `isAllowed(userId, "chat:persist")` is true.
- [x] 4.4 Add `CHAT_COST_PER_MILLION_TOKENS` next to the existing rate constants in `worker/review/track.ts`.
- [x] 4.5 Record cost for a turn that streams and then fails, so a partial turn is not free. The route records in the stream's tail whether the stream drained or broke.
- [x] 4.6 Tests in `api/topic/chat.test.ts` over the pure `toChatTurnRow`: a persisted turn keeps its text, an ephemeral turn records cost with null text, an anonymous turn carries a null user, and the cost is the chat rate applied to the turn's tokens. No pre-turn estimate constant was added — the budget check is the same exhausted-pool test scans already use, so the speculative estimate was dropped rather than shipped unused.

## 5. API routes and contracts

- [x] 5.1 Add `chatTurn` request and response types plus the persisted-conversation payload to `shared/contracts.ts`.
- [x] 5.2 Add `POST /api/topics/:id/chat` to `api/index.ts` returning a text stream, with a JSON error body for the forbidden, budget, and rate-limited refusals so the panel can tell them apart.
- [x] 5.3 Add `GET /api/topics/:id/chat` returning the caller's persisted turns for the Topic, and an empty list when the caller's plan does not persist.
- [x] 5.4 Split `ActivityResponse.spendCents` into `scanSpendCents` and `chatSpendCents` in `shared/contracts.ts` and populate both in `api/activity.ts`. This also switches the account meter's source from the LiteLLM proxy figure to the app's own tally, because that tally is what the gate blocks on and a meter that disagrees with the block misleads.
- [x] 5.5 Route tests in `api/index.test.ts`: an empty and an oversized question are both refused before reaching the database or a model. The visibility and refusal-status paths need a database, so they are covered by manual verification rather than a unit test.

## 6. Chat panel UI

- [x] 6.1 Add `ui/src/lib/chatClient.ts`: a `sendChatTurn` that reads the streamed response incrementally, and a `fetchChatConversation` for the persisted conversation and the may-chat flag.
- [x] 6.2 Build `ui/src/components/topic/CoffeeTalkPanel.tsx`: the docked shell with collapsed, open, and enlarged states, open by default, dimming the page only when enlarged.
- [x] 6.3 Build the message list: bubbles rounded on three corners with the speaker's corner squared, auto-scrolled to the newest turn, growing to a maximum height then scrolling internally.
- [x] 6.3a Render replies through `markdown-to-jsx` with an `overrides` map that renders `a` as its own text with the href dropped, and with `disableParsingRawHTML`. A reply is model-written text from fetched sources, so a clickable link in it is a phishing vector.
- [x] 6.4 Build the composer: placeholder `Chat about ${topic.name}` falling back to `Chat about this topic`, submit on enter, disabled while a turn is in flight.
- [x] 6.5 Wire the waiting and streaming states: the existing `CoffeeMug` while awaiting the first token, a shimmer on the incoming line while text streams. `.shimmer-text` already exists in `ui/src/animations.css`, so no new keyframes were added.
- [x] 6.6 Render the budget refusal as an upgrade prompt and the anonymous cap refusal as a sign-in invitation, in the message list rather than a toast.
- [x] 6.7 Mount the panel in `ui/src/pages/TopicPage.tsx`. It hides itself when the payload says this reader may not chat.
- [x] 6.8 Split the account page's `SpendSection` bar into a brews segment and a coffee talk segment against one budget, with a key beneath it. Both use existing theme tokens, so no new colours were added.

## 7. Verification

- [x] 7.1 Run the migration against the dev database with `bun run db:migrate`. The first attempt reported success but applied nothing: both worktrees share one Neon dev database, and the other branch had applied a migration timestamped after this one, so Drizzle's watermark treated this one as already applied. Regenerating it with a current timestamp fixed it.
- [x] 7.2 Push the chat prompt to the registry with `bun run prompts:sync`. Created `chat-topic`.
- [x] 7.3 Manually verify the three panel states, streaming, Markdown rendering, and the placeholder fallback in the dev preview. Found and fixed two things: the panel was trapped under the search bar by the layout's `relative z-10` stacking context, now portaled to `document.body`; and the collapse control is a minimize dash rather than a close X, matching the window-chrome reading the reference screenshots called for.
- [x] 7.4 Verify a real turn end to end against a Topic with Findings. The reply names real Findings by title, renders a Markdown list, carries no links, and wrote one `chat_turns` row: null user, `$0.001955`, text not kept. `bun run smoke:chat` covers the retrieval side: 8 of 20 current-model Findings ranked, stale-model rows excluded, owner-only attachment context proven.
- [x] 7.5 Verify the account spend bar renders both segments after a scan and a chat turn. Verified signed in against the account page: the bar renders a `bg-primary` scan segment at 0.383% ($3.83 of brews) beside a `bg-spend-chat` segment at 0.048% ($0.48 of coffee talk), totalling $4.31 of the $1000.00 budget.
- [x] 7.6 Run the verification gate: `bunx biome check .`, `bunx tsc -b`, `bun test`. All green, 173 tests.
- [x] 7.7 Update the README Development section for the new `smoke:chat` script.

## 8. Post-preview polish

- [x] 8.1 Elevation that reads in both themes: a layered contact-plus-ambient shadow with a hairline ring, bright in dark mode where a black shadow cannot carry, shared by the panel and the pill through one `ELEVATION_CLASS`. Plus bottom scroll clearance on the topic page so the docked panel never permanently covers the last card.
- [x] 8.2 An emoji-style `CoffeeCup` in `ui/src/components/branding/` — cup on a saucer with white steam, drawn in currentColor so the cup follows the pill's text colour while the steam stays white on the primary background. The collapsed pill uses it; the panel header keeps the original `CoffeeMug`.
- [x] 8.3 Split the panel into `ui/src/components/chat/`: `CoffeeTalkPanel` (shell, pill, header, portal, turn state), `ChatMessages` (list, bubbles, refusals, and the `Turn` type), `ChatComposer`, and `ChatMarkdown` (the inert-link renderer, kept separate from the scan note's live-link options on purpose).
- [x] 8.4 Prompt v2: general knowledge is welcome but the reply marks where it leaves the Topic's material, findings still lead, and the no-links rule extends to remembered URLs. Synced to the registry, spec delta and prompt tests updated. Verified live: a pairwise-comparison question drew "the findings don't cover this, but from my own knowledge…" with five findings named by title first.
- [x] 8.5 Fix: `idleTimeout: 120` on the Bun server. The 10-second default reaped streaming chat turns mid-reply whenever retrieval plus generation sat quiet too long, surfacing as "Carl lost his train of thought" on an otherwise healthy turn.

## 9. Web search and second polish round

- [x] 9.1 `worker/chat/search.ts`: a `searchWeb` tool against the scan pipeline's Exa endpoint, three results with highlights, attributed by domain with full URLs deliberately withheld, failing soft as text so a broken search degrades the answer rather than the turn.
- [x] 9.2 Signed-in only wiring: `chat:web` in the gate, `authorizeChatTurn` resolves `isWebEnabled`, the route threads it to `streamChatReply`, and a web-enabled turn runs `streamText` with the tool and up to four steps. Each search bills the turn at `EXA_COST_PER_SEARCH` alongside its tokens.
- [x] 9.3 Prompt v3: a composed `{{webAccessNote}}` names the tool only on web-enabled turns, keeps search results fenced as data, and keeps URLs out. Synced to the registry, prompt and metering tests updated.
- [x] 9.4 Meter colors: a `--spend-chat` token — espresso in light, cream in dark — because the dark theme's `--badge` and `--primary` are the same orange, which made the two segments indistinguishable.
- [x] 9.5 The pill's cup goes full white like the emoji and the shared elevation gains a warm primary-tinted glow.
- [x] 9.6 `ui/src/components/chat/thinkingLines.ts`: the appendable "Carl is ___" list, one line picked at random per wait in place of the fixed "Carl is thinking…".

## 10. Conversation memory and chat ergonomics

- [x] 10.1 Multi-turn conversation: the client carries the history, the contract caps it at 12 turns with per-message length limits, and the worker replays it as real messages under the system briefing. Verified live — "how long will that one take to read?" resolved the reference to the prior turn's finding.
- [x] 10.2 Prompt v4: the reader's question moves out of the template and into messages, and the briefing tells the model to resolve references through the conversation. Synced to the registry.
- [x] 10.3 Raise `MAX_TURN_STEPS` from 4 to 8, re-documented as a runaway-loop backstop rather than a search ration, since searches bill the turn and the monthly budget already meters them.
- [x] 10.4 Composer ergonomics: a multiline textarea where Enter sends and Shift+Enter breaks a line, auto-growing to a cap, focused on panel open, with Escape collapsing the panel from anywhere inside it.
- [x] 10.5 The pill's cup is white-filled china with a currentColor outline over the saucer, and the shared elevation's glow turns black so the panel and pill darken the page behind them in both themes.

## 11. Branding-neutral naming, tab persistence, and live links

- [x] 11.1 Rename `CoffeeTalkPanel` to `ChatPanel` and the pill to `ChatPill`. Code stays branding-neutral while the user-facing copy — the header, the pill label, the aria-labels — keeps saying Coffee Talk.
- [x] 11.2 Tab-scoped conversation persistence for non-premium readers: completed turns mirror into `sessionStorage` keyed by topic, restored on mount, so a conversation survives navigation and reloads within the visit and ends when the tab closes. Premium stays server-side and never touches it. Verified live across a reload.
- [x] 11.3 Live links in replies: `ChatMarkdown` renders `http`/`https` links through `AnchorLink`, refuses every other scheme as inert text, keeps raw HTML off, and renders images as links so nothing auto-fetches. Prompt v5 permits links only to URLs the material or a search result carries, finding URLs ride in the briefing, and search results carry their URLs again. Verified live: a request for the judge-bias post linked its real seeded URL with `noopener`.
- [x] 11.4 Markdown library decision: keep `markdown-to-jsx`. Superseded by 12.6 — the user weighed the options and chose Streamdown globally.

## 12. Chat ergonomics second round and the Streamdown migration

- [x] 12.1 The conversation state moves into `useTopicChat`, answering the provider-versus-hook question in code: a hook, because exactly one subtree reads this state, and `ChatPanel` becomes pure view.
- [x] 12.2 A stop button replaces send while a reply streams, backed by an `AbortController` through `sendChatTurn`. A stop after text keeps what arrived, a stop before the first token drops the empty turn, and the server still records whatever the model spent. Verified live: the button appeared mid-stream and a pre-token stop removed the turn cleanly.
- [x] 12.3 Message footers on hover: copy on both sides of the conversation — the raw markdown for replies, the text for the reader's own messages — plus a relative "minutes ago" timestamp on replies, ticking on one shared minute clock. Turn times persist through the server rows and the tab's storage alike.
- [x] 12.4 The composer placeholder becomes "Hand-crafted notes taste better…", one static line replacing the topic-interpolated one.
- [x] 12.5 `toRelativeTimeLabel` unit-tested from "just now" through days, future timestamps clamped.
- [x] 12.6 Replace `markdown-to-jsx` with Streamdown everywhere — chat, scan notes, terms, privacy — per the user's ranking. Chat keeps only the security overrides (`a` scheme-guarded through `AnchorLink`, `img` as a link) and gains half-open-fence handling mid-stream; the other three surfaces render `mode="static"` with their typography converted to react-markdown-style components. Tailwind scans Streamdown's dist via `@source`, and `markdown-to-jsx` is removed.

## 13. Signup funnel and mobile fit

- [x] 13.1 A signed-out visitor's composer becomes a signup funnel: the panel shows and takes typing, Enter or the arrow routes to `/signup`, and the enabled arrow carries a "Sign up to chit-chat" tooltip — the hyphenated form, Merriam-Webster's listed variant of "chitchat". Verified live: Enter landed on the signup page.
- [x] 13.2 Anonymous chat comes out of the api: every `chat:*` capability now requires sign-in, `authorizeChatTurn` answers "signup" for a visitor on a visible topic, the anonymous rate cap and its env knobs are deleted, and a direct anonymous POST gets a 401. The `chat_turns.user_id` column stays nullable solely for rows recorded during the cap's brief life.
- [x] 13.3 The reader's own messages get the same hover footer as replies — relative time plus a copy control — and every copy control gains a "Copy message" tooltip, flashing "Copied".
- [x] 13.4 Narrow screens default the panel to the collapsed pill, since the open panel takes the whole page there. Wide screens keep open-by-default.
- [x] 13.5 The hero's long pitch paragraph hides on phones, ceding its height to the content.
- [x] 13.6 Fix the cut-off panel on iOS: the composer draft is 16px on phones because iOS Safari zooms the whole page into any smaller focused input, which pushed the fixed panel past the right screen edge.
- [x] 13.7 Comment audit across the change's files: branding stays out of code comments — module headers narrating "coffee talk" and a persona-voiced bubble comment went neutral, and two stale comments were corrected against the code (the spend bar's segment color, the panel's per-width default). Comments that quote user-facing copy, the `branding/` components, and the persona-voiced prompt files keep their names on purpose, since there the branding is the subject.
- [x] 13.8 Cap the persisted-conversation replay at the newest 50 turns, flipped back to reading order. The model's context stays the client's 12-turn window either way, so this only bounds what a page load ships and renders — the first thing that would have creaked as a long-lived conversation grew.

## 14. Persistence for every signed-in user

- [x] 14.1 Every signed-in conversation persists server-side on every plan: `keepsChatHistory` leaves the plans catalog, the gate answers `chat:persist` from sign-in alone, and plans differentiate on budgets, scans, and topics instead. The metering row was already written per turn, so this only fills two columns that were sitting null.
- [x] 14.2 Delete the tab-storage layer whole — `readStoredTurns`, `writeStoredTurns`, the hook's mirror effect, and `isPersisted` off the conversation contract — since it had no users left. Its shared-computer leak goes with it.
- [x] 14.3 The privacy policy names chat conversations in what we store, with their deletion following the topic and the account cascades.
- [x] 14.4 The admin users table gains sortable Scans and Chat columns — the app's own month-to-date tallies in cents, loaded as two grouped queries alongside the existing reads, next to the proxy's authoritative Cost / budget column. Anonymous-era chat rows attribute to nobody.

## 15. Memory window and encryption at rest

- [x] 15.1 One `CHAT_MEMORY_TURNS` constant, raised from 12 to 20, feeds the contract's history cap, the worker's defensive slice, and the client's send window. Twenty covers a long session for ~25% more per-turn input cost, and the model's context window never binds.
- [x] 15.2 The panel marks where memory begins: a divider at the exact exchange the model's window starts, reading "Carl has a lot on his mind. He only remembers your last 20 exchanges." — "exchanges", since a turn is a question-answer pair and "messages" would read ambiguous. Older exchanges stay visible above it.
- [x] 15.3 Chat text encrypts at rest with AES-256-GCM under `CHAT_TEXT_KEY`: persisted question and answer store as marked ciphertext, pre-encryption rows keep reading as plaintext, a failed verification drops the exchange from replay while its cost keeps metering, a keyless dev host stores plaintext while a keyless deploy throws, and a malformed key throws. Five unit tests cover the round-trip, passthroughs, tamper, and the stored row.
- [x] 15.4 Encryption is not capacity: ciphertext runs slightly larger than plaintext, and the memory window is priced in tokens, not bytes. Recorded in the design so the two knobs stay unconfused.
- [x] 15.5 Compact instead of drop: exchanges older than the verbatim window ride with whole questions and answers mechanically trimmed to their openings, so the conversation's start survives at ~95 tokens per old exchange with no summarization call. `CHAT_HISTORY_TURNS` (50) bounds the carried total and the replay alike, prompt v6 tells the model a mid-sentence cut is a trim, and the divider copy becomes "skims everything above and holds your last 20 exchanges word for word." Unit-tested at the boundary, the clip, and the carried bound.
- [x] 15.6 `db:encrypt-chat`: a one-shot, idempotent backfill that encrypted the dev turns written before the key existed, 15 of 15 with zero plaintext rows remaining. Removed once it had run, since `chat_turns` ships with this change and so no deployed database can hold a turn that predates the key.
- [x] 15.7 The privacy page says chat text is stored encrypted, now that it is true in the hosted database.
- [x] 15.8 Raise the carried bound from 50 to 100 exchanges, where the constraint ladder now points: the compacted tail made the model leg nearly free, the client clips the tail with the shared `compactChatAnswer` before sending so payloads stay flat, and the page-load render becomes the practical ceiling. The replay follows the same constant, and the boundary tests re-verified themselves against the new value.
- [x] 15.9 Prompt v7: a remembered source is searched and linked from the result instead of being unlinkable — "when you know a source but not its address, run a quick search and link what it returns" — keeping the anti-hallucination rule while making links maximally generous. Synced.
- [x] 15.10 Fix chat billing to the caller's own key: `authorizeChatTurn` now loads the user's LiteLLM virtual key and the route threads it through `streamChatReply`, so a turn's embedding and generation land under the caller's proxy budget the way scans always did. Before this, every chat call billed the shared master key — invisible in the admin Cost column and outside the proxy's per-key ceiling. Found while explaining why the proxy's metered spend ran ~2.1x the app's flat-rate tallies, which is the separate, designed estimate-versus-metered gap the launch-readiness eval harness is set to recalibrate.
- [x] 15.11 Bill attachment context generation to the topic owner's key: the workflow passes the attachment id — never the key itself, so no secret lands in Temporal's history — and the summarize activity resolves the owner's key fresh per call, surviving mid-workflow key rotation. Cost tallying for attachment processing stays with the launch-readiness ingestion-spend work rather than growing a column here.
- [x] 15.12 The verbatim window budgets characters instead of exchanges: `CHAT_MEMORY_CHARS` (40k ≈ 10k tokens ≈ 20 typical exchanges) with one shared `chatVerbatimStart` walk placing the client's clip, the model's messages, and the panel's divider identically — chosen for accuracy over fixed-number copy, so the divider went placement-relative: "Everything above this line he skims, everything below he holds word for word." The carried and replay bounds stay counts, since they guard per-item render and payload. Boundary, variance, and newest-always-verbatim unit-tested.
- [x] 15.13 Head-trim is deliberate, not incidental: the chat voice is engineered answer-first, so the thesis sits exactly where the trim preserves it. Recorded in the design as "the prompt was written for the compressor," correcting an earlier framing that endings hold the conclusions — true of discursive prose, false of Carl's mandated style.

## 16. Full-history scrolling, clear, and the pill-first return

- [x] 16.1 The message list virtualizes with react-virtuoso from thirty exchanges — dynamic bubble heights, stick-to-bottom through streaming, opened at the newest turn — while shorter conversations keep the plain list that grows with its content. The memory divider rides inside the virtualized rows at the same shared-walk boundary.
- [x] 16.2 The replay ships the whole conversation now that the render ceiling is lifted: `loadChatTurns` drops its limit, and the cursor-paginated read stays the recorded follow-up for when real payloads measure heavy.
- [x] 16.3 A conversation can be cleared from the panel header behind a confirm dialog: `DELETE /topics/:id/chat` nulls the reader's question and answer text while the rows and their costs stay, so the spend ledger survives the wipe. Anonymous clears get a 401.
- [x] 16.4 Once a conversation holds any exchange, every page load starts at the collapsed pill — the open-by-default invitation is reserved for an empty chat on a wide screen. The panel waits for the load to settle before showing either, so the wrong state never flashes.
- [x] 16.5 The memory divider announces itself with a single shimmer sweep, then rests, sharing the reduced-motion reset with the streaming shimmer.
- [x] 16.6 The site goes 3D: an ambient `shadow-lift` halo wraps cards, tables, the search bar, dropdowns, popovers, and dialogs evenly — no directional band — and a smaller `shadow-raise` lifts buttons, badges, and tag chips. The chat panel keeps its heavier halo, painting above every lifted surface from its body portal.
- [x] 16.7 Clearing gets friendlier controls: the header's clear button wears the message-square-x icon, the confirmation body reads just "Carl forgets this whole conversation.", a quiet x in the composer wipes a non-empty draft and hands focus back, and the header's size and minimize buttons gain Expand / Collapse / Minimize tooltips with matching labels.
- [x] 16.8 The hero's Carl illustration hides entirely on phones, following the pitch paragraph it stood beside — the copy column picks up the bottom clearance Carl's height was providing, so the tagline stays clear of the overlapping search bar.
- [x] 16.9 The phone hero gains a note icon after the call to action that opens Carl's portrait and the hidden pitch in a popover, so the introduction stays one tap away instead of spending the fold's vertical space. The pitch string is shared with the wide hero's inline paragraph.
- [x] 16.10 Feed polish and the topic header consolidation: finding rows draw their own inset dashed separators (straight, tucked inside the rounded hover highlight) replacing the full-bleed divide, the hero's accent links reload the page when they already point at it, and the topic page drops the back-link row — the subscribe bell and the owner's edit and delete controls now sit beside the unread count on the title line, pulling the whole page up.

## 17. Chat attachments

- [x] 17.1 A turn can carry up to four attachments: images as data urls (~4 MB each) and text — a picked text file or a long paste — as raw text (50k chars), one zod shape holding each kind to its own field so a request cannot smuggle one as the other. The chat route gains a body cap sized to the contract.
- [x] 17.2 Attachments ride to the model on that turn only: images as their own message parts (the chat-model alias took a probe image through the proxy before any of this was built), text folded under the question beneath a named header. Nothing persists and nothing rides carried history — the stored question carries a "[attached: …]" note built by one shared helper, so the live bubble and every later replay read identically.
- [x] 17.3 The composer grows a paperclip with a hidden picker, a paste handler that attaches clipboard files, and a fold: pasted text past two thousand characters becomes a "Pasted text" chip with its size instead of flooding the draft. Chips row above the draft — a tiny thumbnail for an image, a named chip for text — each removable until the send. Refusals explain themselves: an oversized image, a binary file Carl can't read yet, or a fifth attachment each get a toast.
- [x] 17.4 Tests pin the seams: the payload's kind-to-field refinement, the attachment note, and the newest message becoming parts while history stays strings. Verified in the browser end to end: paste-to-chip, image thumbnail, and chip removal.
- [x] 17.5 The composer placeholder reads "Hand-crafted notes taste best…", and the Brew control drops "now" and trades the play icon for a coffee cup.
- [x] 17.6 Separator prominence splits into two tokens: `--separator` returns to its quiet shade for dividers inside cards and popovers, and `--separator-strong` carries the page-level cut on feed rows and the Brew diary.
- [x] 17.7 The subscribe control gets friendlier: the topic page trades the title-row bell for a labeled paw-print "Follow" button beside Brew — "Following" with a filled paw once subscribed, signup for a visitor — while the home feed's icon buttons just swap the bell for the paw. Brew gains a "Scan this topic for new findings" tooltip, and the subscribe tooltip copy reads "Subscribe to this topic". The label is copy only; the domain stays Subscription end to end.
- [x] 17.8 The follow copy splits by surface: the homepage paw keeps short tooltips ("Subscribe" / "Unsubscribe") while the topic page button reads Follow with "Subscribe to this topic" and flips to Unfollow with "Unsubscribe from this topic" — trading the paw for a panda once subscribed.
- [x] 17.9 The toolbar slot stops guessing while the topic loads: a skeleton button holds the space until the payload decides between Follow and Brew, replacing the optimistic Brew that could flash at a subscriber.
- [x] 17.10 The hero's home links and the brand go client-side: routing to the homepage is an SPA navigation again, and a plain click already on the homepage runs the Reheat instead — the reheat itself moved into the feed provider (reload plus an entrance-replay key), so the homepage button and the hero links share one implementation. Modified clicks keep their browser behavior.
- [x] 17.11 The paperclip reads "Add files or photos", and the paste-to-chip cutoff stops being its own number: a paste chips whenever it would push the draft past the question cap (1,000 chars, now one shared constant feeding the payload, the box's maxLength, and the fold), closing the dead zone where a 1,001–2,000 char paste stayed inline and then failed the send.
- [x] 17.12 Chat accepts PDFs by extraction: the model stack refuses pdf file parts outright (probed — Fireworks takes only http urls), so a pdf rides as a data url and the api resolves it into text with the same unpdf reader topic attachments use, arriving at the model as a named text attachment. An unreadable pdf refuses the turn with words. Extraction, refusal, and the media-type refinement are unit-tested with a real minimal pdf.
- [x] 17.13 A clipped attachment stops lying by omission: one shared clipAttachmentText caps pdf extractions, text files, and pastes alike, ending a cut document with a marker naming both totals — found live when a manuscript pdf clipped at the cap and the model confidently reported the book "only had the first six chapters". The marker rides inside the cap, so a clipped value still passes the payload bound.
- [x] 17.14 The reply footer's copy icon aligns flush with the bubble's left edge, its button padding cancelled by a negative margin.
- [x] 17.15 The question bubble's footer aligns its copy glyph flush with the bubble's right edge, mirroring the reply side, and the streaming auto-scroll follows instantly instead of smooth — a smooth scroll restarted by every chunk lagged the growing reply and settled short of the bottom — snapping smooth once when the stream ends.
- [x] 17.16 Carl returns to the phone hero — floating beside the copy in the same row as desktop, just smaller — the copy clears the overlapping search bar on every width, and the Meet Carl popover drops his portrait to carry the pitch alone.
- [x] 17.17 The hero settles into one grid: on a phone the headline runs full width and centered above Carl, who floats beside the copy at the desktop row's own layout and font size, and the Meet Carl popover carries the pitch alone now that Carl himself is back in frame. Clicking Carl walks home like the other hero links — routing from anywhere, reheating when already there.
- [x] 17.18 The phone hero's Meet Carl note moves up beside "…what you just missed", riding inside that line's own box so the line height never shifts.
- [x] 17.19 A visitor's paperclip routes to signup rather than opening a file picker, reading "Sign up to add files" — the same funnel their send already takes, so nothing invites them to choose a file that could never reach Carl.

## 18. Mobile hardening

- [x] 18.1 A `theme-color` meta tints the browser's own chrome — Safari's status strip, Chrome's toolbar and landscape notch bars — which otherwise takes the page background and clashed with the dark hero under it. The pre-paint script and the theme toggle both keep it on the resolved theme's hero.
- [x] 18.2 Message footers stop hiding behind hover: a `can-hover` variant gates the reveal, so a touch screen — which has no hover to reveal them with — keeps copy and timestamps visible. They were unreachable on phones entirely.
- [x] 18.3 Viewport heights become dynamic: `min-h-dvh` for page shells and `dvh` for the chat panel, its message list, dialogs, and the loading state, so mobile browser chrome no longer pushes content past the visible area.
- [x] 18.4 The docked panel and its pill sit on a `bottom-safe` utility — `max(0.75rem, env(safe-area-inset-bottom))` — clearing the home indicator's swipe zone, and the composer's controls grow to 44px targets on phones, matching the feed rows' existing pattern.
- [x] 18.5 Every "note from Carl" pen becomes one shared NoteIcon: the pen on a card-colored tile with the site's raise shadow, sized to sit inside whatever touch target its button carries. Five call sites — the hero pitch, the phone's Meet Carl, topic details, finding notes, and brew notes — now render the same tile instead of a bare glyph, and the pricing page's "2 months free" pill trades its tinted fill for a card outline.

## 19. Video results in scans

- [x] 19.1 Web-search results take their kind from their host rather than all reading as articles: a YouTube, Vimeo, Loom, or TED url becomes a video and a podcast host becomes a listen, so a video the search finds looks and filters like a video. 101 already-stored rows were backfilled to match, and the misclassification is why a top-scored raccoon video sat in the findings wearing a document icon.
- [x] 19.2 The relevance gate measures each kind against its own bar — 0.35 for articles, 0.24 for video and audio. Measured across the library, an article arrives with the search engine's query-matched extract while a video arrives with a title and channel blurb, embedding about 0.08 further from a topic's context, so one shared bar cleared 34% of articles and only 6% of videos. The new bars clear each kind at about the same rate.
- [x] 19.3 One page stops storing as several Resources: every discovered url is canonicalized before the scan dedupes on it — host lowercased, fragment and tracking parameters dropped, query sorted, trailing slash trimmed, and the path lowercased only for hosts that ignore its case. A raccoon channel had shipped twice as /c/TitoTheRaccoon and /c/titotheraccoon, differing in nothing else.
- [x] 19.4 A Resource that arrives without a title derives one rather than rendering as a bare hostname: the first snippet line that reads like a name — inside a title's length, opening on a capital or a number, and carrying letters — else the url's own last path segment. Backfilled across the library, which left no finding showing only its host.
- [x] 19.5 Bookmarking moves off the finding row and into its note popover, beside Mark as read and above a separated rating row. The row keeps only the filled mark at its left, which now appears solely once bookmarked.
