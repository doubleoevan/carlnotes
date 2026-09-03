## Context

An attachment's path is three lists that must agree and one pipeline that must not flatten a table.

The lists: `isSupportedAttachmentType` in `worker/attach.ts` is the synchronous gate at the trust
boundary, `extractText` in the same file is the set of formats that actually parse, and
`FILE_PICKER_ACCEPT` in `ui/src/lib/utils.ts` is what the picker offers. Widen the gate without the
extractor and every upload of that type stores bytes, starts a workflow, and lands failed. Add the
extractor without the gate and a readable file is rejected at upload. Widen the picker alone and the
user is told their own file is unsupported after choosing it. The lists drifting apart is the
failure this change should make hard.

The pipeline: `extractAttachmentText` extracts, screens with llm-guard, and chunks;
`summarizeChunk` sends each chunk to `generateAttachmentContext` on the cheap model; `finalizeAttachment`
merges the summaries and marks the attachment ready. `buildTopicScanContext` then merges the topic
prompt and every ready attachment's context into the text every scan reads.

Current values: `MAX_PROCESS_CHARS` is `MAX_CHUNKS * CHUNK_CHARS`, 8 × 8000 = 64,000 characters.
`MAX_CONTEXT_CHARS` defaults to 8,000. `SCREEN_TIMEOUT_MS` defaults to 2,500.

## Goals / Non-Goals

**Goals:**

- A `.docx` and a `.xlsx` upload the way a PDF does.
- A spreadsheet reaches a scan as its rows, not as a sentence about the spreadsheet.
- The three lists agree, and a browser's unreliable `file.type` cannot break that agreement.
- Verbatim untrusted rows are fenced by the prompt writer, since no model rewrites them any more.
- An attachment that yielded no readable text says so instead of going ready and empty.

**Non-Goals:**

- No schema change and no migration. `attachments.context` already holds text.
- No formula evaluation, no charts, no embedded images, no cell styling. The table text is text.
- No table path for chat attachments. Chat has its own `toAttachment` and its own limits.
- No change to how a PDF or a plain text document is summarized.
- No backfill. Attachments already stored keep the context they have.

## Decisions

### Branch on kind after screening, not before

`extractAttachmentText` screens, then chooses. A spreadsheet is untrusted text like any other
document and gets the same llm-guard pass; only what happens to the screened text differs. Screening
first also means `Anonymize` has already run, and its substitution is in place, so commas, newlines,
and column alignment survive it. `PERSON` is deliberately absent from the entity list in
`infra/llm-guard/scanners.yml`, so agency and agent names are preserved; an email column comes back
as placeholders. That is correct behavior and the docs should say so, so an owner is not surprised.

Alternative considered: branch before screening, so the table text is byte-exact. Rejected — it
would hand the scan prompt unscreened verbatim rows, which is the one thing this change must not do.

### Compute the table text header, never generate it

The header line names the file, the sheet, the row count, and the column names. Every one of those
is derivable from the file. A model call to produce a sentence already in hand would add cost,
latency, and nondeterminism, and would mean the same file produced different context on different
runs.

### Limit by rows, not characters, and bypass `MAX_CONTEXT_CHARS`

`finalizeAttachment` slices the merged context at `MAX_CONTEXT_CHARS`, which cuts mid-row and leaves
a malformed final row inside a fence. A table context skips that slice and is bounded instead by
`MAX_TABLE_ROWS` and by a character budget it stops short of, dropping the whole row that would
exceed either. Rows alone would let a 200-column sheet spend an unbounded budget on long rows;
characters alone would cut mid-row. `MAX_TABLE_ROWS` sits beside `MAX_PROCESS_CHARS` as a constant, not a plan attribute:
the same file must produce the same context on every account, and plan differentiation already lives
in `monthlyBudgetCents` and scan frequency.

**The number is 150 rows**, with a trailing line naming how many rows were omitted. Sizing it
against what it changes: `buildTopicScanContext` merges every ready attachment's context into every
scan, so table text is a recurring per-scan cost where a summary was roughly 200 characters of
one-time work. 60 rows is under half a cent per scan and is noise; 500 rows is roughly a 30% rise on
median scan cost, per attachment, permanently. 150 sits near the low end of that curve, around 7-8%,
and covers an ordinary working list whole.

For a multi-sheet workbook, every non-empty sheet is written as table text under its own heading and they share
one row budget. First-sheet-only silently drops data when sheet one is a cover page or a pivot, and
a per-sheet limit multiplies the budget by sheet count.

### An unscreened table file fails

`screenText` fails open by design: a non-ok response, a network failure, or a timeout past
`SCREEN_TIMEOUT_MS` returns the original text unflagged. 64,000 characters through PromptInjection,
BanTopics, and Toxicity is not reliably inside 2,500ms.

Prose survives an unscreened pass because the summarizer stands between it and the scan prompt. A
table text does not, so unscreened table text would put verbatim unchecked rows into the prompt
on every scan for as long as the file stays attached. A table file whose screen did not
complete is failed with a reason naming that it could not be checked, which the owner already sees
on the attachment. The screen for a table file gets a longer timeout before that verdict, so
the common case is a slow screen that finishes, not a failure.

Alternative considered: keep failing open for tables too. Rejected — it converts a sidecar timeout
into a prompt-injection path.

### Label the merge, and leave the fence to the prompt writer

Implementation surfaced a conflict in the original plan. `fenceUntrusted` strips every delimiter tag
a value includes — any nonce, not only its own call's — so a fence written at the merge would be
removed the moment a prompt interpolates the merged context as untrusted. Pre-fencing there is not
defense in depth. It is a fence the prompt writer deletes.

What the merge can genuinely add is structure: each attachment's context now sits under a line
naming its file, so verbatim rows read as one file's content. The security fence stays at the one
place it works, the prompt writer: the search prompt already interpolates the merged context through
the untrusted map, and the relevance gate only embeds it, where a vector obeys nothing. The spec
requirement is therefore that every generative consumer of the merge passes it as untrusted, which
is checkable, instead of a merge-level fence, which is stripped.

### Resolve one canonical content type at the boundary

`api/topic/attachments.ts` takes `file.type` from the browser with no fallback. When the reported
type is empty or unknown, fall back to the filename extension, the way `toAttachment` already does
with `TEXT_FILE_SUFFIXES`. The resolved type is what gets stored, what the extractor reads, and what
`toStoredFileHeaders` sends, so the three never disagree about one file.

### Dependencies: `mammoth` for DOCX, `exceljs` for XLSX

`mammoth` (1.12.2, published 2026-08-28) has `extractRawText`, which is exactly this job.

`exceljs` (4.4.0, published 2024-12-20) reads the shared-string table and converts date serials to
dates. Those two are where a spreadsheet reader quietly gets it wrong: a hand-rolled parser gives
`45678` where the cell shows a date, which is worse than useless in a tracker. It is the stalest of
the candidates and the heaviest, so the reader is isolated behind one function and swapping it stays
a local change.

Alternatives considered: `xlsx` (SheetJS) — the npm copy is frozen at 0.18.5 while SheetJS publishes
current releases from its own CDN, so the registry version is not the maintained one. `fflate` plus
a focused reader (~120 lines) — genuinely smaller, and the right move if `exceljs` proves too heavy,
but date serials and shared strings are exactly the subset a hand-rolled reader gets wrong on a real
file.

Both run in activities, not in the Temporal workflow sandbox, so neither enters the workflow bundle
and `scripts/check-workflow-bundles.ts` is unaffected.

### The chat picker stops deriving its accept list

`CHAT_FILE_PICKER_ACCEPT` currently derives from `FILE_PICKER_ACCEPT`, so widening the topic picker
would make both chat composers offer a `.xlsx` that `toAttachment` then rejects with a toast. Chat
gets its own explicit list holding what chat actually accepts.

The chat path then took the same files. Chat attachments are per-reader and have their own size and
retention story, so they post as a `document` kind of their own and are read by the same extractor
the topic path uses, rather than through the table text a scan reads. A test asserts every type the
chat picker offers is a type the chat path accepts, so the two lists cannot drift apart.

## Risks / Trade-offs

- **Table text is a recurring cost where a summary was one-time.** → 150-row limit, one shared
  budget across sheets, and the number is stated here so it can be revisited against real bills.
- **Verbatim untrusted rows reach the scan prompt.** → Screened as documents, labeled by file at
  the merge and fenced under a per-call nonce by the prompt writer, and failed outright when the
  screen did not complete.
- **`exceljs` 4.4.0 was last published in December 2024.** → Isolated behind one function; `fflate` plus a
  focused reader is the named fallback.
- **A wide spreadsheet spends the budget on columns instead of rows.** → The character budget is the
  second bound, and table text stops before the row that would exceed it.
- **Extension fallback trusts the filename when the browser says nothing.** → The filename is
  attacker-controlled in the same sense `file.type` already is, and the gate still admits only the
  known list, so the worst case is an unreadable file that fails in the workflow instead of at
  upload. That is the pre-existing behavior for a corrupt PDF.
- **Failing an empty extraction changes existing behavior.** → A scanned PDF with no text layer that
  used to go ready-and-empty now goes failed. That is the point, but an owner with such a file
  attached will see it flip to failed on its next processing.

## Open Questions

- Should the docs page for attachments state the redaction behavior (an email column returns as
  placeholders), or is that only worth saying if someone asks? Leaning toward stating it.
- Is 150 rows right? It is a guess anchored on the two cost points in the brief, not on a measured
  distribution of real uploads.
