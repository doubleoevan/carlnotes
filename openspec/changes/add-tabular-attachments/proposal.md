## Why

A spreadsheet is the format people keep their working lists in, and CarlNotes rejects it. A `.docx`
is rejected the same way. Both are ordinary things to hand a topic, and today the upload boundary
answers that the user's own file is unsupported.

Widening the gate alone would make the second problem worse. `generatePdfContext` returns a
document's subject and themes, which is the right shape for prose and the wrong shape for rows: a
sixty-row submission tracker summarizes to one sentence naming the spreadsheet, and every agency,
agent, and status the attachment existed to carry is gone. A table has to reach the scan as a table.

Removing the summarizer from that path removes an accidental defense, and that is the part this
change has to get right. Today a model rewrites an uploaded document before its text reaches a scan
prompt, and a summary of an injected instruction is usually not an injected instruction. A verbatim
projection launders nothing.

## What Changes

- Add a DOCX extractor and an XLSX extractor, widen `isSupportedAttachmentType` to the two OOXML
  media types, and add `.docx` and `.xlsx` to `FILE_PICKER_ACCEPT`. CSV needs no extractor: it
  already passes the `text/` wildcard and raw comma-separated rows are self-describing to a model.
- Resolve the content type at the trust boundary instead of trusting `file.type`. A browser reports
  CSV as `application/vnd.ms-excel` on Windows with Excel installed, and reports the long OOXML types
  as `application/octet-stream` or the empty string often enough that the picker would offer a file
  the gate then refuses. Fall back to the filename extension, the way `toAttachment` already does
  with `TEXT_FILE_SUFFIXES`, and settle on one canonical type that storage, the extractor, and
  `toStoredFileHeaders` all agree on.
- Give tabular attachments a deterministic projection instead of a summary: a computed header line
  naming the file, sheet, row count, and column names, then the header row and data rows verbatim.
  Branch inside `extractAttachmentText` after screening, so a spreadsheet is still screened as
  untrusted text. Limit by rows, with a trailing line naming how many rows were omitted.
- **BREAKING for prompt shape:** fence each attachment context in `buildTopicScanContext` with a
  per-call nonce delimiter. The merge currently joins the topic prompt and every attachment context
  with blank lines and no delimiter at all, which was tolerable for model-written summaries and is
  not tolerable for verbatim untrusted rows.
- Decide what an unscreened tabular attachment does. `screenText` fails open by design, and 64k
  characters through PromptInjection, BanTopics, and Toxicity is not reliably inside the 2500ms
  default timeout. Prose survives an unscreened pass because the summarizer stands between it and
  the prompt. A projection has no such step.
- Mark the truncation that already happens silently. `extractAttachmentText` screens
  `extractedText.slice(0, MAX_PROCESS_CHARS)` and nothing downstream says so, so a long document is
  summarized as a prefix while reading as the whole. Name the full length the way
  `clipAttachmentText` already does for chat.
- Fail an extraction that yields nothing. `chunk` returns no chunks for empty text,
  `finalizeAttachment` joins an empty summary list, and the attachment flips to ready with an empty
  context, so a scanned PDF with no text layer, an image-only DOCX, and a chart-only XLSX all look
  processed and contribute nothing.
- Convert uploaded HTML to Markdown before extraction. `text/html` passes the `text/` wildcard and
  decodes to tag soup, so an uploaded page is summarized worse than the same page added as a URL.
- Decode CSV by its declared or sniffed charset. Excel's plain CSV export is Windows-1252 and
  `TextDecoder` defaults to UTF-8, so accented characters arrive as replacement characters.
- Settle the chat picker. `CHAT_FILE_PICKER_ACCEPT` derives from `FILE_PICKER_ACCEPT`, so widening
  the topic picker makes both chat composers offer a file `toAttachment` then refuses with a toast.
  Either extend the chat path to post the new types or stop deriving its accept list.

## Capabilities

### New Capabilities

- `tabular-attachments`: what a tabular attachment is, how its projection is computed and limited,
  and what reaches a scan instead of a summary.

### Modified Capabilities

- `topic-attachments`: extraction covers DOCX and XLSX, the gate resolves a reported type by
  extension, an empty extraction fails instead of going ready, and a truncated document is marked.
- `injection-defense`: attachment contexts are nonce-fenced where they merge, and an unscreened
  tabular attachment is held to a stated rule.

## Impact

- `worker/attach.ts`: the type gate, `extractText`, and the `buildTopicScanContext` merge.
- `worker/workflows/process-attachment-activities.ts`: the tabular branch, the truncation marker,
  the empty-extraction failure, and where the row limit binds against `MAX_CONTEXT_CHARS`.
- `api/topic/attachments.ts`: the boundary that takes `file.type` from the browser with no fallback.
- `ui/src/lib/utils.ts`: `FILE_PICKER_ACCEPT` and whatever `CHAT_FILE_PICKER_ACCEPT` becomes.
- `ui/src/components/chat/useChatAttachments.ts`: only if the chat path is extended.
- Two new dependencies for the OOXML extractors, both parsing a zip of XML.
- Scan cost. `buildTopicScanContext` merges every ready attachment's context into every scan, so a
  projection is a recurring per-scan token cost where a summary was a one-time ~200 characters.
- No schema change. No migration.
