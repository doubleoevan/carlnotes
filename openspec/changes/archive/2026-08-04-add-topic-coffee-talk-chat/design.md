## Context

The Topic page already renders everything chat needs. `topics.prompt` holds the curation prompt, `findings` holds up to `topics.max_results` scored judgments with `relevance_explanation`, `resources` holds `snippet` plus a `content_key` pointing at the full Markdown in object storage, and `scans.scan_summary` holds Carl's note per Scan. Nothing new needs to be produced for chat to have something to say.

Retrieval also has its substrate in place. `resources.embedding` is a 1024-wide pgvector column and `resources.embedding_model` stamps the model that produced it (`qwen3-embedding-8b/1024`). `worker/models.ts` exposes `embedVector`, the one place raw embeddings are produced, which truncates the proxy's 4096-wide output to the schema width and re-normalizes. `worker/review/filter.ts` already ranks with drizzle's `cosineDistance` against those vectors. Chat is a second reader of the same index.

What does not exist: any chat table, any streaming route, and any capability whose value comes from a plan other than a numeric limit. All three are small, and everything else composes from parts already here.

Content-safety scanning is deliberately absent from this change. LLM Guard is being built on a separate worktree and merged in afterward, so this change ships chat replies unscanned and names the seam that work will land on rather than building a placeholder for it.

Constraints from the repo that shape everything below:
- Module boundaries are enforced by `bunx tsc -b`. `ui` never imports `api`, `worker`, or `db`; `api` and `worker` import `db`. The api already calls into the worker in-process through `worker/index.ts`, which is how attachments work.
- Model prompts live as versioned Markdown under `worker/prompts/` with frontmatter, loaded through `fetchPromptTemplate` with a Langfuse registry lookup and a compiled-in fallback. Never inline string literals.
- Every authority and entitlement question goes through `isAllowed(userId, capability, topic)`. No `plan ===` outside the gate module.
- One `package.json`. `markdown-to-jsx` and the animated `CoffeeMug` are already here.

## Goals / Non-Goals

**Goals:**
- A Topic-scoped conversation that reads the Topic's existing curation output and never writes to it
- Retrieval that degrades visibly, not silently, when a Topic's embeddings are stale or partially backfilled
- Every turn's spend metered against the same monthly pool scans draw from, blocked rather than silently billed at the ceiling
- Access that reuses the existing topic-view gate, with attachment context held to the existing owner-only rule
- A chat surface that reads like a real conversation: streamed, Markdown, three states, no spinner-shaped filler

**Non-Goals:**
- ~~Image or file input in chat~~ — landed within this change after all: per-turn attachments (images as model-message parts, text files and long pastes folded under the question), deliberately ephemeral. Nothing persists but a name-listing note on the stored question, so the storage subsystem a durable attachment history would need — blobs, retention, replay — stays unbuilt until real use asks for it. The chat-model alias was probed with an image through the proxy before the pipeline was built on it.
- Content-safety scanning. LLM Guard arrives from a separate worktree; see the seam below.
- Any write path into curation. Chat never revises Topic context, never writes a Finding, never feeds relevance scoring.
- A separate chat retrieval index. The Topic's Finding set is already trimmed to `max_results`.
- Cross-Topic chat, or chat over a Topic the user cannot see.
- A quality eval harness for the chat model. That is the trigger for revisiting the model choice, not part of shipping it.

## Decisions

### One `chat_turns` table, not a conversation-plus-messages pair

A turn is one question and one reply about one Topic by one user. Rows carry `user_id` (nullable, for anonymous turns), `topic_id`, `cost`, `created_at`, and nullable `question` / `answer` text.

The nullable text is the whole persistence rule made physical: a premium user's turn stores its text, every other plan's turn stores cost only. Both need a durable row because both spend real money and the monthly meter has to see it. Nothing is written that the user was told would be ephemeral.

*Alternatives considered.* A `conversations` table keyed by `(user_id, topic_id)` plus a `conversation_messages` child — rejected because one conversation per user per Topic means the parent row carries nothing beyond its own key, so the messages *are* the conversation. A separate `chat_spend` ledger alongside a persistence table — rejected as two tables for one fact. Writing every message and letting the UI decide what to reload — rejected outright: storing text you promised was ephemeral is a privacy failure, not a simplification.

The domain noun is **Chat Turn**. It is deliberately not "Chat Session" — `sessions` belongs to Better Auth's sign-in plumbing and the domain model keeps that boundary sharp. `domain-model` gains one entity row.

### A visitor's composer is a signup funnel, not a metered allowance

The first cut resolved the anonymous gap with a per-Topic hourly rate cap: null-user turns counted from `chat_turns`, spending against no account. It shipped, worked, and was then deliberately replaced. The product answer to "how does a stranger chat?" turned out to be "they sign up": the visitor sees the open panel, types freely, and their send — Enter or the arrow, which carries a "Sign up to chit-chat" tooltip — routes to the signup page. The api refuses anonymous turns outright, because a paid unauthenticated endpoint with no UI caller is nothing but abuse surface.

This resolves the metering gap more cleanly than the cap did: visitors spend nothing because they never reach the model, and the typed draft becomes signup motivation. The `chat_turns.user_id` column stays nullable only for rows recorded during the cap's brief life.

### Retrieval ranks over `resources.embedding` and hard-filters on `embedding_model`

The turn's question is embedded through `embedVector`, which is the same function and therefore the same model that wrote every `resources.embedding` value. Candidate rows are the Topic's Findings joined to their Resources, filtered to `embedding_model = 'qwen3-embedding-8b/1024'`, ranked by `cosineDistance` against the question vector, and cut to the top handful.

The filter is the visible-degradation mechanism. Vectors from different embedding models are not comparable; ranking across them returns confident noise. A Topic whose Resources predate the current model contributes zero candidates rather than bad ones, and the reply says the Topic has nothing indexed yet. That constant currently lives unexported in `worker/review/filter.ts` and moves next to `EMBED_DIMENSIONS` in `db/schema.ts`, so the schema column and both readers name one value.

Retrieved context per turn, assembled in this order: the Topic's prompt, then each selected Finding's title, URL, relevance score and relevance explanation, then that Finding's Resource text — `content_key` fetched through `getResourceContent` where present, falling back to `snippet` — then the most recent Scan summaries.

### Attachment context is owner-only, and that gate is the existing one

Attachment-derived context joins the retrieval context only when the requesting user is the Topic's owner. This mirrors `loadDownloadableAttachment`, which already refuses a non-owner. A stranger chatting about a public Topic gets its Findings, Scan summaries, and prompt, and never the owner's uploaded documents.

Chat access itself is `isAllowed(userId, "topic:view", topic)` — the existing rule, not a second one. The request named `canSeeFinding`; the function that actually exists is `canSeeTopic`, reached through the gate, and chat is Topic-scoped so the Topic-level rule is the correct reuse.

### Two new gate capabilities: `chat:send` and `chat:persist`

`chat:send` combines topic visibility with remaining budget. `chat:persist` decides whether a turn keeps its text.

Persistence began premium-only through a `keepsChatHistory` plan flag, then was deliberately widened: every signed-in conversation persists server-side, so the flag came back out of the catalog and the gate answers `chat:persist` from sign-in alone. The economics drove it — the metering row is written for every turn anyway, so persistence only fills two columns that were sitting null, while the model call that produces the text costs orders of magnitude more than storing it and is already budget-gated per plan. Plans differentiate on the real cost drivers instead, and dropping the ephemeral tier also deleted the whole tab-storage layer chat no longer needed. Call sites still ask `isAllowed(userId, "chat:persist")`; nothing outside the gate compares plans.

### Chat text encrypts at the application layer, sized honestly

Stored chat text is AES-256-GCM ciphertext under a `CHAT_TEXT_KEY` from the environment — a prelaunch product decision, chosen while the table is small enough that a plaintext dual-read covers the past without a backfill. The key is required outside dev: a missing one throws rather than storing plaintext, so a misconfiguration cannot quietly write every reader's conversation in the clear. What it buys, stated exactly: the database console and any leaked backup show ciphertext. What it does not touch: the app decrypts on every replay, the model provider reads every prompt in plaintext by necessity, and traces still carry the text — encryption narrows the console-reader threat, nothing more. Encryption is also not capacity: ciphertext is slightly larger than its plaintext, and the memory window is priced in tokens, not bytes, so the two knobs are unrelated.

The mechanics fail in the safe directions. A GCM tag that does not verify drops the exchange from replay while its cost row keeps metering, a keyless self-host stores plaintext and keeps working, and a malformed key throws rather than letting an operator believe text is encrypted while plaintext lands. The OAuth tokens in `accounts` are the next candidate and a separate change, since Better Auth writes those rows itself.

### Memory is two tiers: a verbatim character budget, the rest compacted mechanically

The model re-reads the carried history on every turn, so conversation memory is a per-turn token tax: at the average exchange (~350 tokens) the verbatim budget costs under a cent of input per turn, and the model's 262k context would not bind until far past any sane window. But the conversation's *start* is where intent lives — "I'm looking for founding-engineer roles, remote-friendly" — so dropping it outright makes turn 30 answerable only by luck. The resolution is a compacted tail, deliberately mechanical rather than model-written: exchanges older than the verbatim window ride with their question whole (questions are short and are the intent trail) and their answer trimmed to its opening at a word edge, ~95 tokens per old exchange instead of ~350. No summarization call, no stored summary, no staleness, deterministic — an LLM-written rolling summary stays the upgrade path if compaction ever reads as too lossy, and it would slot into the same `toMessages` seam. Its ground rules are decided now, not later: the summary replaces only the compacted tier while the verbatim window stays, the mechanical clip remains the fallback when the summarize call fails, it runs batched at watermarks and async after the reply, it bills the conversation owner's key — never the master key — and it stays inside the data fence as untrusted model-written text. The trigger is measured, not felt: readers re-asking things whose answers were clipped, or references to mid-conversation specifics failing.

The verbatim window budgets characters, not exchanges — `CHAT_MEMORY_CHARS` (40k, roughly ten thousand tokens, about twenty typical exchanges) — because the window guards a token-axis cost and one exchange can run a sentence or seven kilobytes. Right unit per resource: the carried and replay bound stays a count, `CHAT_HISTORY_TURNS` (100), because it guards render and payload, which are per-item. One shared boundary walk (`chatVerbatimStart`) places the client's clip, the model's messages, and the panel's divider, so all three agree by construction, and the divider's copy went placement-relative — "everything above this line he skims, everything below he holds word for word" — which is true wherever the budget lands. The head-trim direction is deliberate rather than incidental: the chat voice is engineered answer-first, so the thesis sits exactly where the trim preserves it — the prompt was written for the compressor. One hundred is where the constraint ladder now points: with the tail at ~95 tokens per exchange the model leg is nearly free, the send payload stays flat because the client clips the tail with the same shared cut the worker applies, and the binding cost becomes the page-load render itself — ~200 bubbles and markdown parses on open, acceptable today. Past this, the honest upgrades are a virtualized message list and an LLM rolling summary. The virtualized list is now built: react-virtuoso rather than the legacy react-virtualized, because chat needs dynamic bubble heights, stick-to-bottom through streaming growth, and reverse scroll — hybrid, so a short conversation keeps the plain list that grows with its content and the list virtualizes from thirty exchanges, where mounting every bubble would start to cost. With the render ceiling lifted, the replay ships the whole conversation; the cursor-paginated read remains the follow-up for when real payloads measure heavy. Virtualization lifts only the display ceiling; what rides to the model stays governed by the character budget and carried bound, which are cost knobs on a different axis. The briefing tells the model that a mid-sentence cut in an old reply is a trim, never a style to imitate.

### Streaming through Hono, cost recorded on finish

`POST /api/topics/:id/chat` returns a text stream. Everything else in `api/index.ts` returns JSON, so this is the one route that does not — an interactive surface earns it, and time-to-first-token is the reason the generation model sits at the synthesis tier rather than the cheap scoring tier.

Spend is checked before the turn and recorded after it. The pre-check is `canSpend`-shaped: this month's scan spend plus this month's chat spend against `effectiveBudgetCents`, refusing the turn with an upgrade prompt if the remaining budget cannot cover an estimated turn. The post-record uses the stream's final `usage` through the existing `tokenCost` helper, the same best-effort tally curation uses — LiteLLM meters the authoritative figure. A turn that streams tokens and then fails still records what it spent.

The generation model is the existing `chat-model` alias in `litellm-config.yaml`, already pointing at Qwen3.7 Plus on Fireworks. That alias is in place; this change is its first consumer and adds `chatModel()` to `worker/models.ts` beside `cheapModel` and `scoreModel`. Routing through the alias keeps the model name out of application code, so the documented fallback to Kimi K3 — if a quality smoke test shows Qwen3.7 Plus falling short on conversational tone — is a config edit.

### The spend meter gets a second segment, and monthly spend gets a second source

`activity.spendCents` currently sums `scans.cost`. It becomes two figures, `scanSpendCents` and `chatSpendCents`, and the account page's bar renders them as adjacent segments in distinct colors against the same budget. `isMonthlySpendExhausted` sums both, so chat spend can exhaust the budget that gates a manual scan and vice versa — one pool, as specified.

### How this change meets `harden-launch-readiness`

Content safety is being built on the `auth-plans-billing-9e5ba8` worktree as the `harden-launch-readiness` change. Its `worker/guard.ts` already exists, so this design is written against the real module rather than a proposed one. Its shape is not what a chat feature would have guessed:

```
scanText(text, layer: "context" | "content"): Promise<{ isFlagged, detectors }>
```

Three consequences that matter here:

- **It screens inputs, not outputs.** Both layers are ingress — `context` is an uploaded document, `content` is a fetched page. There is no output layer and no output-leakage detector in the implemented set (`PromptInjection`, `Secrets`, `InvisibleText`). So chat gets its safety from material being screened *before* it ever becomes a Finding, not from a reply scan.
- **It flags, it does not redact.** A hit returns detectors and `toScanReason`; the caller drops the text. There is no redacted-string return to thread through.
- **It fails open by design**, for the same reason every external dependency here does.

That inverts the earlier assumption. Chat needs **no scanner call of its own**. Everything it retrieves — Findings, Resource content, Scan summaries, attachment context — is screened at ingress by that change, and flagged material never becomes a Finding for chat to retrieve. Adding a per-turn output scan on top would be a second net with no detector behind it.

The real integration surface is therefore not a scanner call. It is three places where `harden-launch-readiness` changes a contract chat depends on:

- **`writePrompt` inverts its default.** Untrusted values become the loader's first, default map, nonce-wrapped and delimiter-stripped; trusted values need an explicit second map. Every value chat interpolates — the Topic prompt, Finding titles and relevance explanations, Resource content, Scan summaries — is attacker-derived and belongs in the untrusted map. Written that way from the start, the merge is a no-op; written the other way it is a security regression. **Task 3.5 must put every retrieval value in the untrusted map.**
- **Model-written surfaces render as escaped plain text**, with no markdown links and no HTML, so injection cannot become phishing. A chat reply is model-written text synthesized from fetched page content, so it is squarely in scope. See the rendering decision below.
- **`resources.embedding` gains an HNSW `vector_cosine_ops` index** and the near-duplicate threshold moves into SQL. Chat retrieval ranks over that same column, so it inherits the index for free. Until it lands, chat's ordering is a sequential scan over the global Resource corpus — acceptable at current scale, and the reason to not add a chat-specific index is that this one is already coming.

Minor merge friction: both changes edit `worker/review/track.ts` (they rename the `REVIEW_`-prefixed ceiling and add an `ingestion` stage bucket; this change adds a chat token rate). Small and textual.

### Replies render full Markdown with sanitized, material-sourced links

Chat replies render links, by explicit product decision. This diverges from `harden-launch-readiness`, which renders model-written text as escaped plain text on the feed, scan-report, and email surfaces — that rule still holds there; chat opts out because a conversation that cannot point at what it cites is crippled as a chat. The divergence is stated here so the other worktree merges knowing it.

Four rails hold the risk in place of the blanket ban:

- **Scheme allowlist.** Only `http`/`https` hrefs render live, through the shared `AnchorLink` (external links open in a new tab with `noopener`). A `javascript:` or `data:` href from the model renders as inert text — necessary because `AnchorLink` itself would render any unknown scheme as an external anchor.
- **Raw HTML never parses.** Markdown is the markup; raw HTML from model text is the XSS lane and stays off.
- **Images never auto-load.** A Markdown image renders as a link to itself. An auto-fetched image URL is the classic injection exfiltration channel — its query string can carry anything the model was tricked into reading, including owner-only attachment context.
- **Links are material-sourced by prompt.** The briefing permits linking only URLs that appear in the retrieval context or a search result, never from memory — remembered URLs hallucinate. Finding URLs ride in the briefing and search results carry theirs, so honest links are always available.

What remains accepted: a link the material itself carries can still be a hostile page, exactly as it can be on the feed card that lists the same Finding. Chat adds no URL the Topic page does not already expose, plus search-result URLs a signed-in user requested.

The renderer behind all of this is Streamdown, app-wide, chosen by the user over keeping `markdown-to-jsx`: chat gets streaming-aware parsing so a half-open fence never flashes as literal backticks, and the scan notes and legal pages render `mode="static"` with their existing typography. The rails above survive the swap unchanged — the `a` and `img` overrides carry them, react-markdown's lineage never parses raw HTML without an explicit plugin, and Streamdown's own default URL transform sits underneath as a second net.

Conversation state lives in one custom hook, `useTopicChat`, not a provider — exactly one subtree reads it, and a provider earns its ceremony only when a second surface does. If chat ever grows multimodal input and tool-result UI, the inflection point is adopting the AI SDK's `useChat` with its message-stream protocol rather than growing the bespoke hook further.

### Streaming: stream the reply, do not hold it

**Decision: stream tokens as they arrive. Do not buffer the reply for a safety gate before releasing it.**

The reasoning that settles it is the ingress finding above. Safety here is a prevent control at ingestion — flagged documents and pages never become Findings. There is no output-side detector to wait on, so holding a reply would buy nothing and cost the time-to-first-token that put chat at the synthesis tier rather than the cheap one in the first place.

This also disposes of the retraction problem: with no output gate, there is nothing to retract. Had one existed, buffering-then-releasing would have been the wrong shape anyway — a scan that trips after the user has watched the text arrive is a detect-and-alert control wearing a prevent control's costume.

If an output-leakage detector is ever added to the scanner set, the upgrade that preserves streaming is delayed release: hold the trailing ~200 characters, scan a sliding window, release behind it. Worth a `ponytail:` comment at the hook naming that ceiling if it comes up. Not worth building against a detector that does not exist.

### General knowledge and web access both come with every signed-in chat turn

The only-the-material restriction in the v1 prompt was a grounding choice, not a capability limit: the synthesis model holds general knowledge whether or not the prompt permits it. v2 permits it with one condition — the reply must mark where it leaves the Topic's material, so grounding stays visible instead of silently blending. The findings still lead. Links landed later: a reply may emit http and https URLs, rendered through the sanitizing renderer that scheme-checks every destination and downgrades an image to a link, so a remembered address is a real link rather than an unclickable string.

Live web access is a `searchWeb` tool against the same Exa endpoint the scan pipeline uses, up to three searches per turn, each billed onto the turn at the per-search rate. It needs no capability of its own: reaching an allowed chat turn already requires being signed in, so a signed-out visitor can never spend against a third-party API. A failed or unconfigured search reports itself as text and the turn answers without it, matching the fail-open posture everywhere else.

### The panel is docked, not an accordion

The proposal text described an accordion pinned at the bottom of the Topic. The reference screenshots refine that into a docked panel with three states, and they carry explicit judgments — a collapsed pill reads as the convention, a scrim over the open panel reads as a modal and hides the very Findings the answers cite. The screenshots win; the departure is deliberate.

- **Collapsed** — a "☕ Coffee Talk" pill, bottom-right, no page shade. The page stays fully usable.
- **Open (default)** — a docked panel, bottom-right, no scrim. The message list starts short and grows with the conversation to a maximum height, then scrolls internally.
- **Enlarged** — full-screen, and this is where the dim belongs, since the panel now genuinely is the page.

Conversation bubbles are rounded with one squared corner on the speaker's side. The composer placeholder interpolates the Topic's name — `Chat about <topic name>` — falling back to `Chat about this topic` when the name is missing. Replies render through `markdown-to-jsx`, already a dependency and already used by `TopicScanRecap`. The waiting state is the existing animated `CoffeeMug` — a steaming cup, not a generic spinner — and streamed text arrives with a shimmer on the incoming line.

## Risks / Trade-offs

- **Chat ships before ingress screening lands, so it can retrieve unscreened material.** → A reply is synthesized from Findings, Scan summaries, and the prompt, all of which the requester can already read on the page — for a non-owner, attachment context is excluded, so chat surfaces nothing the Topic page does not. What chat adds is a model reading that material and speaking in its own voice, which is the injection surface. Replies now render links by product decision, so the phishing path is narrowed rather than closed: schemes are allowlisted, images never auto-fetch, and the prompt restricts links to URLs the material already carries — the same URLs the feed card renders. The window narrows further when `harden-launch-readiness` merges its ingress scanning.
- **Chat's prompt is written against a `writePrompt` contract that is about to invert.** → Put every retrieval value in the untrusted map now. Correct before the merge and correct after; the alternative is a silent security regression at merge time, which is the kind that does not announce itself.
- **Chat and scans now compete for one monthly budget, and free is 300 cents.** → That is the specified behavior — one pool — and blocking with an upgrade prompt is exactly what the competition is supposed to produce. The risk is a user who spends their scan budget on chat and finds their Topic stopped scanning. The block message names the pool so the trade is visible before it happens.
- **A signed-out visitor reaches no paid call at all.** → Settled by making chat signed-in only. The composer takes typing and the send routes to signup, so the shared-pool question the earlier anonymous cap raised no longer applies.
- **Cost is estimated before the turn and known only after it.** → A turn can overshoot the budget by one turn's worth. Same shape as the existing per-Scan cap, which also charges after the fact, and the overshoot is bounded by one turn.
- **Retrieval quality is untested against real Topics.** → The `embedding_model` filter guarantees the failure mode is empty-and-honest rather than confident-and-wrong, which is the failure worth engineering against. Ranking quality itself is a smoke-test question after the surface exists.

## Migration Plan

1. Generate and run the `chat_turns` migration. Additive only — no existing table changes, so no backfill and no rollback data loss.
2. Move `EMBED_MODEL_NAME` into `db/schema.ts` beside `EMBED_DIMENSIONS`. Pure refactor, same value.
3. Ship the api and worker paths, then the UI panel. The route is inert until the panel calls it.

Rollback is removing the panel; the table and the route are harmless unused surface.

## Open Questions

- ~~The per-Topic anonymous hourly cap's actual number.~~ Resolved: chat became signed-in only, so no anonymous cap ships.
- Whether the pre-turn cost estimate should be a flat per-turn figure or scale with the assembled context size. Flat is simpler and the overshoot is bounded either way; scaling is a refinement if turns vary widely.
- Whether an owner should see their own chat spend broken out per Topic on the activity page, the way scan spend already is.
- Whether chat should refuse a Topic whose Findings all predate ingress screening, once `harden-launch-readiness` lands. Retrieving pre-screening material is the same exposure the `embedding_model` filter already handles for staleness, and the same answer — exclude and say so — may apply.
