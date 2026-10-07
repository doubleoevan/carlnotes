## Why

A topic attachment is meant to add material to a topic, and a list of names is the plainest case: the people a
topic follows, or the ones it leaves out. Every document attachment is summarized by the cheap model today, and a
summary keeps the gist and drops the specifics. The "Keeping Up with the Chens" topic attached a PDF of 36 family
members. Its stored context describes the document as a numbered list of names and includes none of the names, so no
Scan and no chat ever saw them, and the owner had to paste the names into the prompt instead.

A summary also can't be longer than 8,000 characters, and the merged topic context is cut at 8,000 characters
before the score prompt reads it, so an attachment that did keep its names could still lose the ones past that point.

With a scanner configured, the same PDF failed instead. The injection detector scores a plain numbered list as an
attack, and a busy scanner ran out of memory or timed out. A table file failed closed on any of those, so an
attachment stored as written would have too, for reasons its owner could not act on.

## What Changes

- A document whose extracted text is 20,000 characters or fewer is stored as written, with no model call. Only a
  longer document is chunked and summarized, and its merged summaries are limited to 20,000 characters.
- The stored context limit rises from 8,000 to 20,000 characters, in the worker and in the contract that limits an
  owner's edit, so a table's text and a short document's text can both be edited and saved. The
  `MAX_ATTACHMENT_CONTEXT_CHARS` environment variable is removed, and the worker reads the contract's constant.
- Every attachment fails open against the scanner, a table file included: a screen that doesn't finish stores the
  text unscreened, and the prompt fence still wraps it. A scanner response that rejects text without naming a
  detector counts as a failed screen. A short document's screen, and a table file's, gets a minute, and the
  processing retries wait 15 and then 30 seconds, so a busy scanner can finish. The `LLM_GUARD_TABLE_TIMEOUT_MS`
  environment variable is removed, and the timeout is a constant that covers both.
- A file that a topic's owner uploads skips injection detection and keeps its personal details. A page attached by
  url and a chat attachment keep the whole check.
- A failed attachment tells its owner why: the file had no text, or the scanner flagged it. The editor showed one
  message for every failure, and the worker recorded the workflow's wrapper error in place of the real one.
- The score prompt and the scan summary read up to 24,000 characters of topic context: the name, the prompt, and one
  attachment at full length. The relevance gate still embeds the first 8,000. A Finding's context hash covers the
  longer text, so it changes only for a topic whose context runs past 8,000 characters.

## Capabilities

### New Capabilities

### Modified Capabilities

- `topic-attachments`: a short document's text is its context, a long document is summarized, and a Scan reads more
  of the topic context than it embeds
- `injection-defense`: every attachment fails open, and an owner's upload skips injection detection and keeps its personal details
- `table-attachments`: a table file fails open like every other input

## Impact

- `worker/workflows/processAttachmentActivities.ts` and `worker/workflows/processAttachment.ts`: the stored-as-written
  path, which replaces the table-only path.
- `worker/review/filter.ts`: the topic context limit and the embedding's own limit.
- `shared/contracts.ts`: `MAX_ATTACHMENT_CONTEXT_CHARS` rises to 20,000, and `toAttachmentFailureMessage` names a
  failure's reason.
- `worker/guard.ts`: the upload screen type, and a rejection with no detector counts as a failed screen.
- `.env.example`, `worker/attach.smoke.ts`, and the attachments docs page.
- Existing attachments keep their stored summaries. An owner who wants a short document kept as written removes it
  and attaches it again.
