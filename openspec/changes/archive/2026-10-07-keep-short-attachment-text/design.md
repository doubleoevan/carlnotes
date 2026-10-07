## Context

The processing workflow extracts an attachment's text, screens it, splits it into chunks of 8,000 characters, has
the cheap model write a note for each chunk, and stores the joined notes limited to 8,000 characters. A table file
skips the model and stores its rows, up to 20,000 characters. A Scan merges the topic's name, its prompt, and every
ready attachment's context into one text and cuts it at 8,000 characters. That one text is embedded for the
relevance gate, hashed onto each Finding, read by the score prompt with the example pages added, and read by the scan summary.

The prod "Keeping Up with the Chens" topic shows the failure. Its PDF extracted to 638 characters, went to the model
as one chunk, and came back as 762 characters describing a numbered list of names, with none of the 36 names in it.

## Goals / Non-Goals

**Goals:**

- A short document reaches every Scan and chat exactly as written, so a list of names, places, or terms works as an attachment.
- The score prompt reads a full-length attachment beside the prompt.
- No re-review for a topic whose context is unchanged.

**Non-Goals:**

- Reprocessing existing attachments. Their stored contexts stay, and the owner can attach a file again.
- Chat attachments that a user keeps. They have their own summary path and limit.
- The search ingester's query prompt, which keeps its own 8,000-character slice of the topic context.

## Decisions

**The limit is on characters, and it equals the stored context limit.** A document is stored as written if its
extracted text is at most `MAX_ATTACHMENT_CONTEXT_CHARS`, which rises to 20,000, the same as a table's text. The
model only runs if the text can't be stored whole. Lines or items would be a worse measure, since a PDF's line
breaks are an extraction detail. Redaction can lengthen the screened text by a few characters, so it is sliced to
the limit, which keeps an owner's edit under the contract's maximum.

**One stored-as-written path for tables and short documents.** The activity result's `tableContext` becomes
`verbatimContext` and `finalizeTableAttachment` becomes `finalizeVerbatimAttachment`. A table file still builds its
table text first. A short document's verbatim context is its screened text. Both skip the model, and both get the
longer screen timeout.

**Every attachment fails open.** A table file failed closed against a configured scanner, since its text reaches the
Scan prompt with no model step in between. The same rule on a short document failed a 36-name PDF three ways in local
testing: the injection detector scored its numbered list at 0.98, the scanner ran out of memory, and it timed out. The
nonce-delimited fence wraps the merged topic context in every prompt, which is the defense that holds without the
scanner, so a screen that doesn't finish stores the text unscreened and reports the failure. A scanner response that
rejects text without naming a detector is a broken response and fails open the same way.

**An owner's upload skips injection detection and redaction.** A file the owner uploads has the authority of the
prompt they type, and an instruction in it is theirs. The new `upload` screen type sends llm-guard
`scanners_suppress` for `PromptInjection` and `Anonymize`, and keeps secrets, invisible text, banned topics, and
toxicity. A page attached by url keeps the `document` screen, since its text comes from a page the owner doesn't control.

**A minute for the screen, and spaced retries.** A local scanner under a scan's load took 50 to 70 seconds a text, and
the 10-second screen failed a short PDF three times in a few seconds. The screen of text stored as written now gets 60
seconds, and the workflow's retries wait 15 and then 30 seconds. The activity's own 5-minute limit fits a full screen
on every try.

**The owner sees why.** The worker records a known reason for a failure the owner can act on, from constants in
`shared/contracts.ts`, and `toAttachmentFailureMessage` turns a reason into the line the editor shows. Temporal wraps
an activity's error in its own, so the workflow records the innermost cause. The topic page sends the owner that line,
never the recorded reason, which can name internal details.

**The environment overrides go.** `MAX_ATTACHMENT_CONTEXT_CHARS` could set the worker's limit apart from the
contract's, and an owner then couldn't save an edit to a context the worker wrote. `LLM_GUARD_TABLE_TIMEOUT_MS` was
named for tables and was in no environment file. Both become constants.

**The score prompt reads 24,000 characters, the embedding 8,000.** `toTopicContextText` cuts the merged context at
24,000 characters, which fits the name, a 2,000-character prompt, and one 20,000-character attachment. That text is
what the score prompt and the scan summary read and what the hash covers. The gate embeds its first 8,000
characters, which bounds embedding spend and keeps the embedding focused on the prompt. A score call for a topic at
the full 24,000 characters reads about 6,000 tokens of context, about $0.004 per Resource on the premium model, and
the Scan's Budget still bounds the total.

**The hash covers the longer text.** A Finding's context hash decides when the Finding is reviewed again. Hashing
the 8,000-character embedding text would miss an edit past that point, though the score prompt reads it. For a
context of 8,000 characters or fewer the two texts are the same, so its hash doesn't change.

## Risks / Trade-offs

- [A topic whose context runs past 8,000 characters gets a new hash] → its Findings are reviewed again on the next
  Scan, once. That is correct, since the score prompt now reads more of its context.
- [An attachment can reach the prompt unscreened] → a scanner outage stores a table file or a short document
  unscreened. The prompt fence holds it as data, and the failure is reported. An owner's upload never gets injection
  detection, and the same fence covers it.
- [An owner's upload keeps its personal details] → phone numbers and email addresses in an uploaded file reach the
  model and the database. The owner chose to give Carl the file.
- [Unsummarized text is longer than a summary] → a short document's context can be several times its summary's
  length, and the score prompt, the scan summary, and chat read all of it. The 20,000- and 24,000-character limits bound it.

## Migration Plan

No schema change. The workflow renames an activity and a field of an activity's result, so an attachment that is
processing during the deploy can stay pending or be stored with an empty context. Processing takes seconds, and the
owner can remove that attachment and attach the file again.
