## 1. The trust boundary and the three lists

- [ ] 1.1 Add a canonical content-type resolver: reported type first, filename extension when it is empty or unknown. Follow `toAttachment`'s `TEXT_FILE_SUFFIXES` shape in `ui/src/components/chat/useChatAttachments.ts`
- [ ] 1.2 Call it in `api/topic/attachments.ts` and pass the resolved type to storage, extraction, and `toStoredFileHeaders`, so the three agree about one file
- [ ] 1.3 Widen `isSupportedAttachmentType` in `worker/attach.ts` to the DOCX and XLSX media types
- [ ] 1.4 Add `.docx` and `.xlsx` to `FILE_PICKER_ACCEPT` in `ui/src/lib/utils.ts`
- [ ] 1.5 Give `CHAT_FILE_PICKER_ACCEPT` its own explicit list instead of deriving it from `FILE_PICKER_ACCEPT`
- [ ] 1.6 Tests: the gate accepts DOCX and XLSX and rejects an unsupported type; a `.csv` reported as `application/vnd.ms-excel` and a `.docx` reported as `application/octet-stream` both resolve by extension; every type the chat picker offers is one the chat path accepts

## 2. Extractors

- [ ] 2.1 Add `mammoth` and `exceljs`. Confirm neither enters the Temporal workflow bundle — both are used from activities, so `bun scripts/check-workflow-bundles.ts` must stay green
- [ ] 2.2 DOCX extractor in `worker/attach.ts` returning plain text through `mammoth.extractRawText`
- [ ] 2.3 XLSX reader returning sheets of rows, isolated behind one function so the library can be swapped locally. Convert date serials to dates and resolve shared strings
- [ ] 2.4 Decode `text/*` by declared or sniffed charset instead of always UTF-8
- [ ] 2.5 Convert `text/html` to Markdown before extraction
- [ ] 2.6 Tests: each extractor returns readable text for a small fixture; a Windows-1252 CSV decodes with no replacement characters; uploaded HTML extracts to text carrying no tags

## 3. The tabular projection

- [ ] 3.1 Add `MAX_TABLE_ROWS = 150` and a character budget beside `MAX_PROCESS_CHARS` in
      `worker/workflows/process-attachment-activities.ts`, both dropping the whole row that would exceed them
- [ ] 3.2 Add the projection function: a computed header line naming the file, sheet, row count, and column names, then the header row and data rows verbatim. No model call
- [ ] 3.3 Project every non-empty sheet under its own heading, sharing one row budget across sheets
- [ ] 3.4 End with a line naming the omitted row count when rows are dropped
- [ ] 3.5 Branch on kind inside `extractAttachmentText`, after screening, so a spreadsheet is screened as untrusted text and projected from the screened text
- [ ] 3.6 Route a tabular attachment past `summarizeChunk` and past the `MAX_CONTEXT_CHARS` slice in `finalizeAttachment`, so no projection is cut mid-row
- [ ] 3.7 Tests: a CSV fixture projects its header and rows verbatim with no model call; a projection over the row limit carries the omitted-row line; a wide sheet stops on the character budget before the row limit; a two-sheet workbook projects both under one shared budget; a projection's last content line is always a whole row

## 4. Screening and fencing

- [ ] 4.1 Give a tabular attachment's screen a longer timeout than `SCREEN_TIMEOUT_MS`
- [ ] 4.2 Fail a tabular attachment whose configured scanner did not answer, with a reason naming that its contents could not be checked. An unset scanner url is not a failure and still projects
- [ ] 4.3 Fence each attachment context in `buildTopicScanContext` with a per-call nonce delimiter through the existing `fenceUntrusted` helper, for every attachment kind
- [ ] 4.4 Tests: a projected table is fenced, a cell containing the fence delimiter cannot escape its block, a configured-but-dead scanner fails the attachment, and an unset scanner url does not

## 5. The two correctness bugs on the same path

- [ ] 5.1 Mark the `MAX_PROCESS_CHARS` cut in the extracted text, naming the full length, the way `clipAttachmentText` does in `shared/contracts.ts`. Keep `char_count` recording the full length
- [ ] 5.2 Fail an empty or whitespace-only extraction with a reason naming that the file held no readable text, instead of flipping to ready with an empty context
- [ ] 5.3 Tests: a file longer than `MAX_PROCESS_CHARS` carries the cut marker and records its full length; an empty extraction lands failed instead of ready

## 6. Documentation and the gate

- [ ] 6.1 Update the attachments docs page with the supported types and the row limit, and state that a redacted column returns as placeholders so an owner is not surprised
- [ ] 6.2 Update `worker/AGENTS.md` if the extractor layout changed, and the root routing table if it changed what it says
- [ ] 6.3 `bun run check` green: Biome, `tsc -b`, the workflow bundle check, and the test suite
- [ ] 6.4 Upload a real `.xlsx` and a real `.docx` against a dev topic and read the stored context back, since no offline test proves the libraries parse a file a real Excel wrote
