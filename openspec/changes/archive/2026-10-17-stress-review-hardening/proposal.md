## Why

A 100x stress review found three ways a busy day could go wrong. First, the claim that keeps the sweep and the
budget reset from overlapping holds an idle transaction open for the whole run. That pins a server connection, and if
anything drops the idle transaction, the lock goes with it and a second run can start beside the first. Second, the
LLM Guard scanner never reads chat images, though text inside an image is how an injected instruction most often
reaches a vision model, and Carl can call topic tools. Third, the rule that Carl saves a topic change only after the
user agreed lives only in the prompt. An instruction in an attachment, an image, or a finding could get Carl to
publish a private topic nobody agreed to publish.

## What Changes

- **Lease claim.** `runWithClaim` takes a row in a new `claims` table with a holder id and an expiry, instead of an
  advisory lock in an open transaction. The runner renews the lease on an interval while the task runs and deletes
  only its own row when the task ends. No transaction stays open between statements. A renewal that finds the lease
  expired or taken aborts the task through an `AbortSignal` that `runWithClaim` passes to it. The sweep and the
  budget reset check that signal between batches, so a run that lost its claim stops instead of overlapping.
  `runWithClaim` keeps its options and its null return when the claim is held.
- **Scanner on dev.** The local scanner container restarts after it is killed, which it was, with exit 137, and never
  came back. `carl-up` names it and does not wait for its model download, since every caller fails open. Production
  keeps running with `LLM_GUARD_URL` unset.
- **Chat image screening.** If the scanner is configured, each chat image's visible text is read with text recognition in the
  worker code and screened as a document. A flagged image in a private chat is withheld from the turn with the same
  line a flagged text attachment gets, and is never stored or described. A flagged image in a team room rejects the
  post, the way a flagged shared PDF does. A shared image's description is screened before its row turns ready, and a
  kept image's description is screened before it is stored. With `LLM_GUARD_URL` unset, the image path makes no call,
  costs nothing, and adds no wait.
- **Scanner measurement on images.** The review pipeline eval's guard-only run screens image cases: a benign
  screenshot of an article about prompt injection, and an image holding an instruction. The measured rates go in
  the design.
- **Structural edit confirmation in the private chat.** Each preview Carl shows is recorded on the server as a keyed
  digest with the turn that showed it. On the user's next message, a small model check reads only the user's own
  words and the pending preview, and returns agree, decline, or unclear through a Zod schema. On agree, the server
  applies the previewed change itself. **BREAKING** for the model's tool list: the private topic chat no longer offers
  `updateTopicPrompt`, `updateTopicFields`, `addSource`, or `removeSource`, and the new-topic chat no longer offers
  `createTopic`. Carl keeps `proposeTopicEdit` and `cancelTopicEdit`, and gains `proposeNewTopic` for the new-topic
  chat. A change that does not match its recorded preview, or a message the check does not read as agreement,
  applies nothing, and Carl is told why so he can say so.
- Team rooms keep their tools and their rule that each tool checks edit rights for whoever addressed Carl. MCP is
  unchanged, since its client approves each call.
- The promptfoo tool-call evals cover a confirmation in other words, a hesitant reply, and an instruction inside an
  attachment or an image.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `scheduled-scans`: the sweep's claim is a renewed lease row, and a sweep that loses it stops.
- `subscription-billing`: the budget reset stops between users once it loses its claim.
- `injection-defense`: chat images are screened by the text they show, and the local stack keeps the scanner running.
- `team-chat`: a shared image is screened before it posts, and its description before Carl reads it.
- `topic-tools`: the private chat applies only a recorded preview that the user's next message agrees to, and its
  model keeps only the preview tools.
- `topic-creation-chat`: Carl proposes the new topic with `proposeNewTopic`, and the server creates it on agreement.
- `topic-chat`: the edit chat's settings change through the agreed preview instead of a saving tool.
- `eval-harness`: image cases in the scanner corpus, and new confirmation cases in the tool-call evals.

## Impact

- **Database:** a `claims` table and a `chat_proposals` table, from one generated migration.
- **db:** `db/claim.ts` and its tests.
- **worker:** the sweep and the budget reset take the abort signal. `worker/guard.ts` gains the image screen with a
  new `worker/imageText.ts` for text recognition. A new `worker/chat/agreement.ts` holds the agreement check, with a versioned
  `check-agreement.md` prompt. The private chat gets a preview-only edit block prompt, and `chat-new-topic.md` is
  revised.
- **api:** `api/chat/attachments.ts`, `api/chat/roomAttachments.ts`, `api/chat/roomTurns.ts`,
  `api/chat/privateChat.ts`, `api/chat/chatTurnStream.ts`, `api/tool/chatTools.ts`, and
  `api/tool/newTopicChatTools.ts`, plus a new module that records and applies proposals.
- **Dependencies:** `tesseract.js` and its English language data, loaded only when `LLM_GUARD_URL` is set.
- **Dev:** `docker-compose.yml` and `scripts/carl-up.sh`.
- **Evals:** `evals/review-pipeline`, `evals/topic-chat-tools`, and `evals/new-topic-chat`.
- **Manual:** set the Northflank time limit of the scan-sweep job to 12 minutes or less, and sync the prompts to
  production after the deploy.
