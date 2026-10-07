## 1. Store a short document as written

- [x] 1.1 Raise `MAX_ATTACHMENT_CONTEXT_CHARS` in `shared/contracts.ts` to 20,000, and have the worker read it in
  place of the `MAX_ATTACHMENT_CONTEXT_CHARS` environment variable
- [x] 1.2 In `extractAttachmentText`, return a document of at most that length as `verbatimContext`, its screened
  text limited to the same length, and chunk only a longer one. `tableContext` becomes `verbatimContext`
- [x] 1.3 Give a stored-as-written document's screen the table file's timeout as the constant
  `VERBATIM_SCREEN_TIMEOUT_MS`, removing `LLM_GUARD_TABLE_TIMEOUT_MS`
- [x] 1.4 Rename `finalizeTableAttachment` to `finalizeVerbatimAttachment`, and have `processAttachment` call it for
  any verbatim context
- [x] 1.5 Give the verbatim screen 60 seconds, and space the workflow's retries 15 and 30 seconds apart
- [x] 1.6 Record the known failure reasons from shared constants and the activity's innermost error, and send the
  owner `toAttachmentFailureMessage`'s line in place of the editor's one message
- [x] 1.7 Fail every attachment open, a table file included, and treat a rejection with no detector as a failed screen
- [x] 1.8 Screen an owner's upload as the `upload` type, with no injection detection and no redaction, and a page
  attached by url as a `document`
- [x] 1.9 Derive the table text budget from `MAX_ATTACHMENT_CONTEXT_CHARS`, keeping room for the omitted-rows line

## 2. Read more of the topic context

- [x] 2.1 In `worker/review/filter.ts`, cut the topic context text at 24,000 characters, embed its first 8,000, and
  hash and score the whole text

## 3. Tests, docs, and config

- [x] 3.1 Test that a 40-name text file is stored exactly with no chunks, that a long document is chunked, that an
  unscreened short document is stored as written, and that a rejection with no detector passes the text
- [x] 3.2 Test that the score text reads past 8,000 characters while the embedding reads only the first 8,000, and
  that a short context keeps its hash
- [x] 3.3 Remove `MAX_ATTACHMENT_CONTEXT_CHARS` from `.env.example`, update `worker/attach.smoke.ts` for a context
  stored as written, and update the attachments docs page
- [x] 3.4 Add the removed environment variables to the stale-name list in `.agents/commands/audit-structure.md`
