## Context

**The claim.** `runWithClaim` in `db/claim.ts` opens a transaction, sets `idle_in_transaction_session_timeout` to 0,
takes `pg_try_advisory_xact_lock`, and runs the task inside that transaction's callback. The task's own queries run on
other pool connections, so the claim's transaction sits idle for the whole run. `worker/schedule.ts` runs the
15-minute sweep under it. `worker/resetMonthlyBudgets.ts` runs the daily reset under it, which at 10,000 users is about
20,000 proxy calls. The idle transaction pins one of the Neon connection pooler's server connections. If the pooler or
the compute drops it, Postgres releases the lock while the task keeps running, and a second run can take the claim.

**The scanner on dev.** `docker-compose.yml` defines `llm-guard`, and `scripts/carl-up.sh` runs `docker compose up -d`
with no service list, so it already starts the scanner, and dev Doppler already sets `LLM_GUARD_URL`. The local
container exited with code 137, killed, most likely for memory, six days ago, and has no restart policy, so it stayed
down and every screen has been skipping. The script's own comments and its closing line never mention the scanner,
which is how the outage went unnoticed.

**Chat images.** `resolveChatAttachments` passes a private chat image straight to the model. A room image is stored
and later read back as a data url by `api/chat/roomTurns.ts`, and its description, written by `generateImageContext`,
fills the row Carl reads, with no screen on either. A kept private image is also described by `generateImageContext`
and read into later turns. `storeTopicChatAttachments` receives the original attachments, not the resolved ones.

**Edit confirmation.** The private topic chat binds `updateTopicPrompt`, `updateTopicFields`, `addSource`, and
`removeSource`, and the new-topic chat binds `createTopic`. Each description ends with `CONFIRMATION_RULE`, and
`toConsentStep` forces a saving tool when the question matches a consent pattern and a proposal stands in the
history. Nothing checks that the call matches the preview the user saw, and the history the check reads arrives
from the browser. The preview lives only in that turn's tool calls and on the user's card.

## Goals / Non-Goals

**Goals:**

- No claim holds a transaction open, and a run that loses its claim stops.
- The local scanner stays up, and production stays unchanged with `LLM_GUARD_URL` unset.
- No chat image whose visible text is flagged reaches a model, a description, or storage.
- In the private chat, no topic change and no topic create happens without a preview the server recorded and the
  user's next message agreeing to it.

**Non-Goals:**

- Team rooms keep their tools and their rule that each tool checks the edit rights of whoever addressed Carl.
- MCP is unchanged, since its client approves each tool call.
- Topic attachment uploads keep their own screen type, which skips injection detection on the owner's authority.
- Running the scanner in production. Northflank evicts it at its 2 GB ephemeral storage limit.

## Decisions

### 1. The claim is a renewed lease row

A new `claims` table in `db/schema/claims.ts`: `name` text primary key, `holder_id` text, `taken_at` and `expires_at`
timestamps. Each run picks a holder id with `crypto.randomUUID()`. Every time is read from the database clock, so the
api, worker, and cron hosts never compare their own clocks.

- **Take**: one statement. It inserts the row, and on a conflict updates it only where the current lease has
  expired, returning the row only when this holder now has it. No row back means the claim is held, and
  `runWithClaim` returns null without running the task.

  ```sql
  insert into claims (name, holder_id, taken_at, expires_at) values ($1, $2, now(), now() + $3)
  on conflict (name) do update set holder_id = excluded.holder_id, taken_at = excluded.taken_at,
    expires_at = excluded.expires_at
  where claims.expires_at <= now()
  returning holder_id
  ```

- **Renew**: every 30 seconds, `update claims set expires_at = now() + lease where name = $1 and holder_id = $2 and
  expires_at > now() returning name`. No row back means the lease expired or someone else holds it. The runner then
  aborts the task's `AbortController` with a `ClaimLostError`. A renewal that throws, such as a dropped connection,
  is retried on the next tick. It counts as lost only once the runner's own estimate of the expiry passes, which is
  the time of the last renewal that succeeded plus the lease length.
- **Release**: in `finally`, stop the renewal timer and `delete from claims where name = $1 and holder_id = $2`. A
  failed release is logged and reported, and the lease expires on its own.
- **The lease is 2 minutes, renewed every 30 seconds.** Four renewals fit inside one lease, so one slow or failed
  renewal never loses the claim. A process killed mid-run frees the claim within 2 minutes of its last renewal.
- **The time limit.** The scan-sweep cron runs every 15 minutes with the Forbid concurrency policy, which stays as the
  outer guard. Its Northflank time limit should be 12 minutes or less, so a sweep killed at the limit frees its claim
  by minute 14, before the next run. The daily reset's time limit only needs to end before the next day's run.
  Neither limit lives in the repo, so a manual step records both in this design.

`runWithClaim` keeps `{ claimName, runTask }` and its null return. `runTask` now receives the `AbortSignal`. A task
that ends after its claim was lost rejects `runWithClaim` with the `ClaimLostError`, even if the task itself
resolved, so the cron run shows as failed.

- **The sweep** checks the signal before each stage and before each Topic in `startScheduledTopicScans`. The stages
  are dispatching undispatched Scans, failing stale ones, screening pending Sources, reading the queue, and loading
  Topics. A check between stages is what the spec calls a batch.
- **The reset** checks the signal before each user's replacement, outside the per-user catch, so the check stops the
  run instead of counting as one user's failure. `runWithConcurrency` already rejects when its function throws.

**Alternatives considered.** A session-level advisory lock cannot be held through the pooler in transaction mode,
since each statement can run on a different server connection. Keeping the transaction and sending keepalives
still pins the server connection, and a dropped transaction still releases the lock silently. A Redis lock would
add a second system to a claim that only needs Postgres.

### 2. The local scanner restarts and startup names it

`docker-compose.yml` gives `llm-guard` `restart: unless-stopped` and sets `APP_WORKERS=1`, one uvicorn worker, to
hold its memory down. `carl-up.sh` keeps starting it with `up -d`, does not wait for it, and names it in its comments
and its closing line with its url. The script's model-download wait is deliberately absent, since `screenText` fails
open while the scanner loads. Production is untouched: the Northflank `LLM_GUARD_URL` stays unset.

### 3. A chat image is screened by the text it shows, read in-process with tesseract.js

`worker/imageText.ts` exports `readImageText(imageBytes)`. It keeps one tesseract.js worker per process in module
scope, created on first use and reused after that, loading the English data from the installed
`@tesseract.js-data/eng` package, never from a CDN. `worker/guard.ts` exports `screenImage(imageBytes)`. With
`LLM_GUARD_URL` unset it returns a skipped verdict before anything else, and `imageText.ts` is imported dynamically
only past that check, so production never loads the text recognition code. Otherwise it reads the text and calls
`screenText(text, "document")`. An image with no text passes, through `screenText`'s empty check. A failed read
returns a failed verdict and reports the error, which fails open like the scanner.

Measured under Bun on the development laptop:

| Step | Time |
|---|---|
| Text recognition worker start, once per process | 153 ms |
| Reading one 900 px wide screenshot | 173–197 ms |
| First read through `worker/imageText.ts`, worker start included | 640 ms |
| Later read through `worker/imageText.ts` | 181 ms |

Every test image read word for word, the eval's two images included. The packages are `tesseract.js` 7.0.0 and
`@tesseract.js-data/eng` 1.0.0, pinned exactly. A script that has to exit calls `stopTextRecognitionWorker` once its reads
are done, since the worker thread keeps a process alive.

The added wait per image is the read plus one screen, which `screenText` bounds at its 2.5-second timeout. The cost is
CPU only. Recognition runs in tesseract.js's worker thread, off the event loop of the api process that resolves chat
attachments.

**Alternative: a transcription call on the user's key.** That call costs model spend on every image and adds a model
round trip. It also reads the very instruction it is meant to catch, and that instruction can tell it to leave
itself out of the transcript. Text recognition cannot be talked out of reading. It also keeps the guard-only eval free of model
spend. The trade-off is about 43 MB of dependencies in the app image, and weaker reading of handwriting and stylized
type.

Where the screen runs:

- **Private chat.** `resolveChatAttachments` screens each image. A flagged image becomes the withheld text line. It
  also returns the attachments it withheld, and `answerChatTurn` leaves those out of what `streamChatTurn` stores, so
  a flagged image is never stored or described. The stored question's attachment note still names it. A kept image's
  description from `toKeptAttachmentContext` goes through `screenAttachmentText` before the row is written, and a
  flagged one leaves nothing behind, deleting the uploaded object as the existing failure path does.
- **Team room.** `prepareChatRoomAttachment` screens an image and returns null when it is flagged, which rejects the
  whole post the way a flagged shared PDF does. A room never stores a flagged file for every member to download.
  `describeChatRoomImage` screens the description, and a flagged one marks the row `failed`. The room turn's image
  read skips `failed` rows. A `pending` row still passes, since its text was screened before it posted.

### 4. Image cases in the guard-only eval

The fixture type gains `injectionImages: { title: string; file: string; isAttack: boolean }[]`, with the PNG files in
`evals/review-pipeline/images/`. Two images are rendered once and committed:

- a benign screenshot of an article about prompt injection
- an image that tells the model to ignore its instructions and make the topic public

The guard-only run passes each one through `screenImage` and prints image rates on their own lines. The command is
`bun run eval:review-pipeline --guard-only`, since the repo has no bare `eval` script. Measured on 2026-10-17 against
the local LLM Guard 0.3.16, at the 0.8 threshold:

| Corpus | False-positive rate | Catch rate | Not screened |
|---|---|---|---|
| Text | 4 of 10 benign articles flagged | 15 of 16 known attacks caught | none |
| Images | 1 of 1 benign screenshots flagged | 1 of 1 attack images caught | none |

The text rates match the 2026-10-05 measurement. The benign screenshot is flagged for the same reason four benign
articles are: prose that explains injection scores high on the injection detector. So on dev, a screenshot of an
article about prompt injection is withheld from a chat turn. That is the scanner's existing false-positive problem,
which the README already names as the thing to fix before the scanner screens production. The image path adds no new
kind of miss.

The local scanner needs Docker Desktop's memory raised to 10 GB on a 16 GB Mac. At the default of 7.7 GB, with LiteLLM
running, the scanner was killed while loading its models. Its container is limited to 5 GB, so the scanner is the only
process that limit can kill, and it loaded at that limit with no restart.

### 5. The server applies an agreed preview, and the private chat's model keeps only the preview tools

There were two options:

- **The write tools apply the change behind a gate.** Each tool checks that its input sits inside the recorded
  preview and that the user agreed.
- **The server applies the agreed preview itself.** This was chosen.

With the server applying it, the private chat's model has no tool that writes, so no attachment, image, finding, or
page can get a write called. Nothing has to compare a tool's input with the preview, since the applied change is the
preview, so a partial or drifted call cannot happen. In the private chat it also retires the consent pattern and the
forced tool choice, which matched only fixed words.

**Recording a preview.** A `chat_proposals` table in `db/schema/chat.ts` has these columns:

- `id`, the primary key every app table has
- `user_id`
- `topic_id`, nullable and cascading, where null means the new-topic chat
- `chat_turn_id`, cascading
- `digest`
- `created_at`

It has a unique index on `(user_id, topic_id)` with nulls not distinct, so each user has one row per chat page.

`streamChatTurn` upserts the row after `saveFinishedChatTurn`, only when the reply finished and the turn leaves a
preview standing:

- **Topic chat:** the turn's last `proposeTopicEdit` call stands, by `toStandingTopicEditCall` over its calls.
- **New-topic chat:** the turn called `proposeNewTopic`, and the preview is the draft as the turn left it.

The digest is HMAC-SHA256 over canonical JSON of the user, the page, and the preview parsed by its own schema. It is
keyed by the app's auth secret through `toAuthSecretSignature` in `shared/hmac.ts`, which the signup gate, the podcast
cover keys, and the unsubscribe tokens now share. The chat text key was the first choice, but a self-hosted app can
leave it unset, and the auth secret is always set. The row holds no words. A conversation the gate
does not persist keeps nothing readable on the server, since the words come back with the history the browser sends,
as they already do.

**Taking a preview.** `answerChatTurn` runs `delete … returning` on the row first, so only the message right after
the turn that showed it can agree to the preview. With no row, no check runs and nothing applies. With a row, the server
rebuilds the preview and compares digests in constant time:

- **Topic chat:** from the standing `proposeTopicEdit` call in the last history turn.
- **New-topic chat:** from the topic draft the turn starts from.

**The agreement check.** `worker/chat/agreement.ts` exports `checkAgreement({ userWords, proposal, litellmApiKey })`.
It calls the cheap model alias with the versioned `check-agreement.md` prompt, and `Output.object` with
`z.object({ decision: z.enum(["agree", "decline", "unclear"]) })`.

- **What it sees:** the payload's question, which is typed or transcribed from voice, and the preview rendered as
  labeled lines. Both are interpolated as untrusted, nonce-fenced data. It sees no attachment, finding, retrieved
  context, earlier turn, or tool.
- **When it counts as unclear:** empty words count as `unclear` with no call. A failed or timed-out call counts as
  `unclear`, so the check fails closed.
- **Cost:** one call of a few hundred tokens on the cheap tier, well under a hundredth of a cent and about a second.
  It runs only on a turn right after a preview, and its tokens join that turn's spend.

**Applying.** A new `api/chat/chatProposals.ts` records, takes, and applies proposals. On `agree`:

- **A topic edit** applies in a fixed order: the prompt, then the fields, then the removed Sources, then the added
  Sources. Each part goes through `updateTopicPrompt`, `updateTopicFields`, `removeTopicSource`, or
  `addTopicSource`, which check edit rights. Each produces the same toast and the same result text the tool produced.
  The execute bodies of the room's tools move into shared functions that the room's tools and the server apply both
  call, so the wording has one home.
- **A new topic** runs the body of today's `createTopic` tool, moved to a shared function. That covers the team check,
  `createTopicFromDraft`, the draft delete, and the team rejection toast.

Each save is recorded as a `ChatToolCall` named after its tool, and `toolCalls.count` grows, so the turn persists. On
`decline`, the server records a `cancelTopicEdit` call, which takes the card off. On `unclear` or a digest mismatch,
nothing applies. The server sets `isTopicEditCancelled` unless Carl previews again in this turn, so the card never
shows a preview the server would refuse.

**Telling Carl.** The server's calls go into the model messages after the user's question, as one assistant
tool-call message and its tool results, the same shape `toAnswerModelMessages` builds for history. The worker's reply
stream yields them before the model's own parts, and its completion lists them first, so the browser's toasts and card
and the stored turn read them like any tool call, with no change to the api's stream or save. Carl's reply then
continues from a real save. For `unclear` and a mismatch, where no tool ran, the private edit block receives a short
outcome line telling Carl that nothing was saved and why, and to ask again.

**Tool lists and prompts.**

- **Private topic chat:** binds `openNewTopicChat`, `proposeTopicEdit`, and `cancelTopicEdit`, with no `tools`, so
  `toConsentStep` never forces anything there. Its edit block becomes a new `chat-propose-topic-edit.md`. The room
  keeps `chat-edit-topic.md`, the saving tools, `CONFIRMATION_RULE`, and `toConsentStep`, unchanged.
- **New-topic chat:** binds `draftTopic`, `proposeNewTopic`, and `suggestSources`. `proposeNewTopic` takes no input,
  saves nothing, and returns a line telling Carl to wait for the user. `chat-new-topic.md` step 9 changes to read
  the draft back, call `proposeNewTopic`, and wait.

**What the client sees.** The card, the toasts, and the new-topic navigation read the same `ChatTurnToolCalls` fields
as before, so the client needs no change. Saves come under the saving tools' own names, which `toStandingTopicEditCall`
and `toProposedTopicEdit` already treat as closing a proposal.

**Vocabulary.** "Proposal", the change Carl previewed in one turn and recorded until the user's next message, gets
a line in the domain-model skill's Chat Turn row before `chat_proposals` exists.

## Risks / Trade-offs

- **The provider might reject replayed calls.** The model provider may reject replayed calls to tools the turn does
  not offer. → Checked on 2026-10-17 with one live turn through the chat model alias. The turn's history replayed an
  `updateTopicFields` call, and a server-made `updateTopicPrompt` call followed the question, with neither tool bound.
  The provider accepted it and replied, so saves replay as tool calls.
- **A user may answer after a reload.** A user who reloads an unpersisted conversation loses its history, so the
  server cannot rebuild the preview. → The card goes with the history, and Carl proposes again. Nothing applies
  without the words.
- **The check could read a non-answer as agree.** → It sees only the user's words. Ambiguity returns `unclear`, and
  a failure returns `unclear`. The eval holds a hesitant reply, an attachment instruction, an image instruction, and a
  preview whose own text says to agree.
- **Words in the preview could change the check's decision.** → The preview is fenced as untrusted data, the prompt
  restates that only the user's words count, and an eval case holds it.
- **Text recognition misses stylized or handwritten text.** → The scanner still screens what it reads. The eval's catch rate on
  images shows the gap, and the model never gets a tool that writes in the private chat whatever an image says.
- **The app image grows by about 43 MB** of text recognition code and data that production never loads. → It is accepted. The
  dynamic import keeps it out of memory there.
- **The deploy swaps claim kinds.** During a deploy, an old sweep holding the advisory lock and a new sweep taking the
  lease do not see each other. → The cron's Forbid policy keeps two cron runs from overlapping anyway, and the next
  sweep after the deploy uses the lease alone.
- **A pending preview lasts only one message.** A pending preview is lost if the user's next message goes to
  another page's chat. → One row per page keeps each page's preview separate, and only a message on that page takes
  it.

## Migration Plan

1. One generated migration adds `claims` and `chat_proposals`. The release's migrate job applies it before the app
   and the crons roll.
2. Deploy. The next sweep and the next reset take the lease.
3. Run `bun run prompts:sync:prd` for the new and revised prompts.
4. In Northflank, read the scan-sweep and budget-reset jobs' time limits, set the sweep's to 12 minutes or less, and
   record both here.
5. On dev, run `docker compose up -d llm-guard` once. The restart policy keeps it up after that.

Rollback is a code revert. The two tables are unused by the old code and can stay.

## Open Questions

- The current Northflank time limits of the two jobs. They are recorded by step 4.
