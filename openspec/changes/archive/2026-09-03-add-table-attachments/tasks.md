## 1. The trust boundary and the three lists

- [x] 1.1 Add `toCanonicalContentType`: the reported type stands when an extractor knows it, and otherwise the
      filename extension answers, following `toAttachment`'s `TEXT_FILE_SUFFIXES` shape
- [x] 1.2 Call it in `api/topic/attachments.ts`, so storage, extraction, and the stored-file headers all read
      one resolved type
- [x] 1.3 Widen `isSupportedAttachmentType` in `worker/attach.ts` to the DOCX and XLSX media types, and to
      `application/json`, which the picker already offered while the gate rejected what browsers report for it
- [x] 1.4 Add `.docx` and `.xlsx` to `FILE_PICKER_ACCEPT` in `ui/src/lib/utils.ts`
- [x] 1.5 Give `CHAT_FILE_PICKER_ACCEPT` its own explicit list instead of deriving it from `FILE_PICKER_ACCEPT`,
      so each picker widens on its own terms
- [x] 1.6 Tests: the resolver's four cases in `worker/attach.test.ts`, and the picker agreement test in
      `ui/src/components/chat/useChatAttachments.test.ts` proving every chat entry is one the chat path accepts

## 2. Extractors

- [x] 2.1 Add `mammoth` and `exceljs`, loaded lazily inside the extractors so the api process never pays for
      them. `bun scripts/check-workflow-bundles.ts` stays green, so neither entered the Temporal sandbox
- [x] 2.2 DOCX extractor through `mammoth.extractRawText`
- [x] 2.3 XLSX reader behind `toSerializedWorkbook`, one function so the library can swap locally. exceljs
      resolves shared strings and date serials, and `toCellText` reads rich text, formulas, and hyperlinks
- [x] 2.4 Decode `text/*` by declared charset, then strict utf-8, then windows-1252
- [x] 2.5 Convert `text/html` to markdown-shaped text before extraction, dropping script and style bodies
- [x] 2.6 Tests: a zip-built docx fixture, an exceljs round-trip workbook with a date cell and an empty sheet,
      a windows-1252 csv with no replacement characters, html with no tags left, and json decoding as text

## 3. The table text

- [x] 3.1 `MAX_TABLE_ROWS = 150` and `MAX_TABLE_CHARS = 20000` beside `toTableText` in
      `worker/attach.ts`, where the table text is written, both dropping the whole row that would cross them
- [x] 3.2 The table text: a computed line naming the file, sheet, row count, and columns, then the header row
      and data rows verbatim. No model call anywhere on the path
- [x] 3.3 Every sheet with rows gets its own heading, sharing one budget
- [x] 3.4 A trailing `[N rows omitted]` line whenever rows were dropped
- [x] 3.5 Branch on `isTabularAttachmentType` inside `extractAttachmentText`, after screening, so the
      table text is written from the screened text
- [x] 3.6 Table routes past `summarizeChunk` and past the `MAX_CONTEXT_CHARS` slice through
      `finalizeTableAttachment`, so no table text is cut mid-row
- [x] 3.7 Tests: verbatim rows with no model call, the omitted-row line past the row budget, the character
      budget binding first on wide rows with every kept line whole, and two sheets under one shared budget

## 4. Screening and the merge

- [x] 4.1 A table screen gets `LLM_GUARD_TABLE_TIMEOUT_MS`, defaulting to 10 seconds against the general
      2.5, since its rows reach the prompt verbatim and a slow screen is worth the wait
- [x] 4.2 `ScreenVerdict` gained an `outcome`: `screened`, `skipped` for no configured scanner, `failed` for a
      configured one that did not answer. A table file with a `failed` outcome throws a retryable
      error, so Temporal retries the screen before the attachment lands failed, and `skipped` writes the table text
- [x] 4.3 `buildTopicScanContext` labels each attachment's context with its file. The fence stays at the
      prompt writer, which strips any delimiter tag a value includes — a merge-level fence would be stripped
      there, so the requirement became: every generative consumer interpolates the merge as untrusted
- [x] 4.4 Tests: the guard suite covers the outcome field on every path

## 5. The two correctness bugs on the same path

- [x] 5.1 A document past `MAX_PROCESS_CHARS` gets a cut marker naming its full length, mirroring
      `clipAttachmentText`'s wording, and `char_count` keeps recording the full length
- [x] 5.2 An empty or whitespace-only extraction throws `NoReadableText` non-retryably, which the workflow
      records as a failed attachment instead of a ready one with an empty context
- [x] 5.3 Covered by the extractor tests plus the activity branch, which is exercised live in 6.4

## 7. Chat takes the same file types

- [x] 7.1 A `document` chat attachment kind for Word files and workbooks, posted as a data url like a pdf
      and extracted at the api through the media type the data url declares
- [x] 7.2 `CHAT_FILE_PICKER_ACCEPT` offers `.docx` and `.xlsx`, with the picker-agreement test holding
      the picker and the accept path in step
- [x] 7.3 Migration 0083 adds the kind to the `chat_attachment_kind` enum
- [x] 7.4 Tests: the routing test proves a docx and an xlsx become document attachments, by media type
      and by suffix when the browser reports none

## 6. Documentation and the gate

- [x] 6.1 `docs/src/content/docs/topics/attachments.md` names the new types, the 150-row limit, and that
      redaction returns an email cell as a placeholder the owner can edit back
- [x] 6.2 No folder, entry point, or script changed, so the module docs stand as they are
- [x] 6.3 `bun run check` green
- [x] 6.4 Ran the shipped extractors over files real office software wrote: a Microsoft Excel 2007+ workbook
      (390 rows, cut to 150 with `[240 rows omitted]` and its columns named) and a Microsoft Word 2007+
      document (9,258 characters of clean text)
- [x] 6.5 Upload a `.xlsx` and a `.docx` through the running app with Temporal up, and read the stored context
      back in the attachment editor
