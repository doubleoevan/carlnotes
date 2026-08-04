## Why

A Topic already holds everything a reader needs — a prompt, up to 20 scored Findings with relevance explanations, the Resource text behind them, and Carl's scan notes — but the only way to consume it is to read the feed top to bottom. "Which of these are actually hiring?" is a question the page can't answer. Coffee talk answers it: a retrieval-augmented conversation scoped to one Topic, read-only by design.

Read-only is the load-bearing constraint. Chat never revises the Topic's context, never writes a Finding, and never feeds relevance scoring. The curation pipeline stays exactly as it is, and chat is purely a reader over what the Topic already holds.

## What Changes

- **Chat over a Topic.** A per-turn retrieval context assembled from the Topic's prompt, its Findings with relevance explanations, the stored Resource content or snippet behind those Findings, and the recent Scan summaries. Ranked by vector similarity against the turn's question over the Topic's existing `resources.embedding` values — the Finding set is already trimmed to the Topic's `max_results`, so no separate index is added.
- **Model-matched retrieval.** The question is embedded with the same model that produced `resources.embedding`, and retrieval is restricted to rows whose `embedding_model` matches the current one. A partially backfilled Topic degrades visibly rather than silently returning noise.
- **Replies lead with the Topic's material and may add the model's general knowledge, labeled apart** — the reader always knows what came from the Topic and what came from the model, and no reply ever emits a URL.
- **Streamed replies** from a `chat-model` LiteLLM alias at the synthesis tier, not the cheap scoring tier, so time-to-first-token stays low on an interactive surface. The alias already exists in `litellm-config.yaml` pointing at Qwen3.7 Plus on Fireworks; this change is the first consumer.
- **Chat spend is metered** against the user's per-account monthly budget — the same pool manual-scan overage draws from — using the existing best-effort `tokenCost` tally and a `canSpend`-style cap. A turn that would exceed the remaining budget is blocked with an upgrade prompt, never silently billed.
- **The account page's spend meter gains a second segment** so chat spend reads apart from scan spend inside the same bar.
- **Access reuses the topic-view gate for signed-in users.** A signed-in user who can see a Topic may chat about it — an invite Topic by its subscribers, a public one by anyone with an account. Attachment-derived context is the one exception and stays owner-only, matching the existing attachment download gate.
- **A signed-out visitor's composer is a signup funnel.** The panel shows and takes typing, and a send routes to the signup page; the api refuses anonymous turns outright. This resolves the gap the request called out between "anyone may chat" and "spend is metered per account" — visitors spend nothing because they never reach the model.
- **Every signed-in conversation persists server-side**, on every plan, resolved through the existing `isAllowed` gate. Page loads replay a bounded tail of the newest turns. Plans differentiate on budgets, scans, and topics — the cost drivers — not on chat memory.
- **New `chat_turns` table** recording every turn's spend, with the question and answer text kept for every signed-in sender. One table serves both metering and persistence.
- **UI: a docked "Coffee Talk" panel** on the Topic page in three states — collapsed to a pill, open (the default), and enlarged to full-screen. Markdown replies rendered with Streamdown, rounded conversation bubbles with one squared corner, and a steaming coffee cup in place of a generic spinner.

**Not in this change:**
- **Attachments that outlive their turn.** A turn may carry images, pdfs, and text to the model; keeping any of them for later turns is the separate `persist-chat-attachments` change.
- **LLM Guard.** Content-safety scanning is being built on a separate worktree and merged in afterward. Chat replies ship unscanned in this change. The design names the seam it will land on so the merge has one obvious place to go, and this change deliberately does not build a placeholder for it.

## Capabilities

### New Capabilities
- `topic-chat`: retrieval, generation, streaming, access, spend metering, and persistence for a Topic-scoped conversation. Chat is signed-in only, so there is no anonymous path to cap

### Modified Capabilities
- `domain-schema`: adds the `chat_turns` table and the Chat Turn domain noun
- `authorization`: adds `chat:send` and `chat:persist` capabilities to the `isAllowed` gate
- `subscription-billing`: monthly spend is now the sum of scan spend and chat spend, and the account meter renders them as separate segments
- `topic-detail-page`: the Topic page gains the docked Coffee Talk panel

## Impact

- **Schema**: one new table (`chat_turns`) and one migration. No changes to `topics`, `findings`, `resources`, or `scans`.
- **API**: a new streaming `POST /api/topics/:id/chat` route and a `GET` for a persisted conversation. Hono streams the reply; every other route stays JSON.
- **Worker**: a new chat module reusing `embedVector`, `getResourceContent`, and the `worker/prompts` registry loader. The curation pipeline is untouched.
- **UI**: a new `ui/src/components/topic/` chat panel. `markdown-to-jsx` and the animated `CoffeeMug` component are already dependencies — no new packages.
- **Infra**: none. Every service this change needs is already in `docker-compose.yml`.
- **Cost**: every chat turn spends real money against a budget that previously only scans drew from. Free-plan budget is 300 cents/month, so chat and scans now compete for it.
- **Skills**: `domain-model` gains the Chat Turn entity; `prompt-authoring` gains the chat prompt.
