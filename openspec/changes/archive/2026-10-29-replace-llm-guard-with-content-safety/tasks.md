# Tasks

## 1. Fix the Smoke workflow

- [x] 1.1 Add `termsAcceptedVersion: TERMS_VERSION` and `termsAcceptedAt: new Date()` to every user that
  `apps/api/tool/topicToolsSmokeFixtures.ts` (`toUserRow`) and `apps/api/mcp/mcpSmokeFixtures.ts` (`seed`) insert
- [x] 1.2 Grep every `*SmokeFixtures.ts` and `*.smoke.ts` that inserts into `users`, and add the same two fields
  wherever that user makes a Terms-gated write (topic save, note, comment, room message, team, username)
- [x] 1.3 Run `apps/api/tool/topicTools.smoke.ts` and `apps/api/mcp/mcp.smoke.ts` under `doppler run` against the dev
  database, and confirm the three failing checks pass (editor save, editor version, MCP `create_topic`)

## 2. Remove the scanner module and its eval

- [x] 2.1 Delete `packages/models/guard.ts`, `guard.test.ts`, `guardTestFixtures.ts`, and `imageText.ts`, and remove
  `tesseract.js` and `@tesseract.js-data/eng` from `packages/models/package.json`, then `bun install`
- [x] 2.2 Delete `evals/review-pipeline/reviewPipelineScanner.ts` and `evals/review-pipeline/images/`. In
  `reviewPipelineEval.ts`, drop the `--guard-only` branch, the image fixture type, `injectionProse` and
  `injectionAttacks`, the two rate fields, and the two table columns
- [x] 2.3 Drop `injectionProse` and `injectionAttacks` from both fixture JSON files, from `reviewPipelineExport.ts`,
  and from `reviewPipelineEval.smoke.ts` and its rate assertions. Keep the precision, recall, and cost checks, and
  update `reviewPipelineEval.test.ts` and `reviewPipelineExport.test.ts` to match

## 3. Remove the scanner from every call site

- [x] 3.1 `packages/pipeline/review/score.ts`: score the clipped content directly, with no `screenText`. Delete the
`"flagged by scanner"` reason from `track.ts` and its tally (section 5 adds its replacement), and update `score.test.ts`
- [x] 3.2 `apps/worker/workflows/screenSourceActivities.ts`: drop the screen, `SOURCE_SCREEN_TIMEOUT_MS`, and the
  scanner retry, so a fetched page becomes ready. Keep the fetch retry and grace. Reword the comments in
  `screenSource.ts`, `packages/pipeline/screen.ts`, `stageTimeouts.ts`, `temporalClient.ts`, `ingest/index.ts`,
  `apps/worker/temporal.ts`, `apps/worker/schedule.ts`, `apps/api/topic/saveHelpers.ts`, `saveTopic.ts`, `topics.ts`,
`feedData.ts`, `packages/db/schema/columns.ts`, `packages/db/seed.ts`, and `apps/web/src/components/topic/TopicInfo.tsx`
  from "llm-guard screen" to "url Source screen"
- [x] 3.3 `apps/worker/workflows/processAttachmentActivities.ts` and its test: store the extracted text with no screen,
  and drop the "flagged by the scanner" failure. In `processAttachment.ts` and `packages/pipeline/attach.ts`, reword the
  comments that name the scanner
- [x] 3.4 `packages/pipeline/attachTable.ts`: drop `SCREEN_CHAR_HEADROOM` and the pre-screen skip that budgets for
  redaction, and limit by `MAX_TABLE_CHARS` alone, with tests updated
- [x] 3.5 Rename `apps/api/chat/chatAttachmentScreening.ts` to `chatAttachmentParts.ts` with its test, and remove every
  screen: images reach the model as image parts, and text is clipped and posted. Delete `screenAttachmentText` and
  `reportFlaggedAttachment`, and update `attachments.ts`, `attachments.test.ts`, `chatAttachmentReads.ts`,
  `roomAttachments.ts`, and `roomAttachments.test.ts`
- [x] 3.6 `packages/contracts/topics.ts`: keep `SCANNER_FLAGGED_REASON_PREFIX` and its branch in
  `toAttachmentFailureMessage`, with a comment saying the prefix only appears on rows from before the removal
- [x] 3.7 Grep for `guard`, `screenText`, `screenImage`, `LLM_GUARD`, `llm-guard`, `imageText`, and `scanner` across
  `apps/`, `packages/`, `evals/`, and `scripts/`, excluding `.tsbuild` and `dist`, and clear what remains

## 4. Remove the scanner's infrastructure

- [x] 4.1 Delete `infra/llm-guard/`, the `llm-guard` service in `docker-compose.yml`,
  `.github/workflows/llm-guard-update.yml`, `scripts/check-llm-guard-update.sh`, the `/infra/llm-guard` entry in
  `.github/dependabot.yml`, and the `llm-guard:up` script in `package.json`
- [x] 4.2 Remove the scanner from `scripts/carl-up.sh` (the compose comment and the startup line) and from
  `.github/workflows/smoke.yml` (the `env LLM_GUARD_URL=` override)
- [x] 4.3 Remove `LLM_GUARD_URL`, `LLM_GUARD_TIMEOUT_MS`, and `LLM_GUARD_INJECTION_THRESHOLD` from `.env.example`, and
  reword the `SCREEN_CONCURRENCY` comment. Add `OPENAI_API_KEY` with a comment saying it enables image moderation and
  is optional

## 5. Source flags and the scorer's safety field

- [x] 5.1 Reddit: add `over_18` to `RedditListing`, skip a flagged child in `parsePosts`, and add tests in
  `reddit.test.ts` for a flagged post, an unflagged post, and a listing that mixes both
- [x] 5.2 X: check one live TwitterAPI.io advanced-search response, or its schema, for the sensitivity field. Type it
  in `SearchResponse`, skip flagged tweets in `toResources`, and test it in `x.test.ts`. If no field exists, record that
  in `packages/pipeline/AGENTS.md` and skip the code change
- [x] 5.3 Bluesky: add `labels` to `BlueskyPost` and its author, add the `ADULT_LABELS` set (`porn`, `sexual`,
  `nudity`, `graphic-media`), skip a labeled post in `parseLinks`, and test a post label, an author label, and an
  unrelated label in `bluesky.test.ts`
- [x] 5.4 Add `isUnsafe: boolean("is_unsafe").notNull().default(false)` to `resources` in
  `packages/db/schema/scans.ts`, then run `bun run db:generate`
- [x] 5.5 `summarize-resource.md`: bump to version 7 and add the safety paragraph outside the premium-tier block, with
  the reporting-versus-doing-harm line. Restate `isUnsafe` in the closing task line
- [x] 5.6 `score.ts`: add `isUnsafe` to `scoreSchema`, and return it from `scoreResource`, skipping the premium tier
  if the cheap tier says unsafe. In `fetchAndScoreResource`, write `is_unsafe`, skip the upsert, and return the
  `"unsafe content"` filtered reason. Add the reason to `track.ts` and the scan report's drop tally
- [x] 5.7 Tests in `score.test.ts`: cheap-tier unsafe skips the premium tier and writes no Finding, premium-tier
  unsafe writes no Finding, a safe score clears the mark, an existing Finding is left untouched, and a missing field
  reads as safe
- [x] 5.8 `apps/api/chat/linkPreviews.ts`: skip `fetchLinkPreviewImage` if the normalized url is a Resource with
  `is_unsafe`, and test that no image fetch is made and the metadata is stored

## 6. Image moderation and topic tags

- [x]  6.1 `packages/contracts/moderation.ts`: add the omni-moderation response schema and the category map from the
      design table
- [x]  6.2 `packages/models/moderation.ts`: add `classifyImage`, a direct `fetch` keyed by `OPENAI_API_KEY`, bounded by
      `MODERATION_TIMEOUT_MS`, that returns the shared `ModerationClassification` union. Test skipped, flagged and
      mapped, clean, timeout, and a malformed response in `moderation.test.ts`
- [x]  6.3 `apps/api/moderation.ts`: add `toObjectionableImageCategory`, and extract the shared
      `reportModerationFailure` that both checks use. Test the image path in `moderation.test.ts`
- [x]  6.4 Avatar upload: moderate after the size and type checks and before storage, and return the 422 on a category.
      Test in `avatars.test.ts`
- [x]  6.5 Room images: in `roomRoute.ts`, moderate each image before anything stores and reject the post with the 422.
      In `roomAttachments.ts`, store the description as generated. Test in `room.test.ts` and `roomAttachments.test.ts`
- [x]  6.6 Check the 422 copy fits an image. If the copy changes, rename `OBJECTIONABLE_TEXT_REJECTION` and
      `ObjectionableTextResponse` to their content forms everywhere
- [x]  6.7 Show the avatar 422 in the web and mobile avatar uploaders through the existing rejection display, and check
      both at phone width
- [x]  6.8 `saveTopicGate.ts`: append the tags to the classified text, and change the `ModeratedTextKind` to `"a topic's
      name, prompt, and tags"`. Test a public save with a tag violation in `saveTopicGate.test.ts`

## 7. Docs

- [x] 7.1 README: rewrite "Content screening (LLM Guard)" as "Content safety and injection defense" (current state,
  both defenses), fix the two mermaid diagrams, the stack line, and the process table, and update the Development
  section for the removed `llm-guard:up` script
- [x] 7.2 `evals/README.md`: remove the scanner sections and the `--guard-only` command, and keep the precision,
  recall, and cost docs
- [x] 7.3 Update the root `AGENTS.md` (module map and eval routing row), `packages/models/AGENTS.md`,
  `packages/pipeline/AGENTS.md`, `apps/worker/AGENTS.md`, and `.agents/commands/audit-structure.md`
- [x] 7.4 `apps/web/src/pages/PrivacyPage.tsx`: add an OpenAI row for avatar and room-image moderation, and move the
  page's updated date if it has one
- [x] 7.5 Add a release note per `apps/docs/release-notes.md` for the user-facing changes: explicit Findings filtered,
  and avatar and room images moderated

## 8. Verify

- [x] 8.1 `bun run check`: Biome, boundaries, parity, `tsc -b`, workflow bundles, and the full test suite
- [x] 8.2 Run `bun scripts/check-comment-groups.sh` on every changed `.ts` file
- [x] 8.3 One local scan through `bun run dev` on a Topic with a Reddit Source and a document attachment: the
  attachment becomes ready with no scanner, the scan completes, and the report's drop tally has the unsafe reason
- [ ] 8.4 With `OPENAI_API_KEY` set locally, upload a clean avatar and share a clean room image, and confirm both post.
  With the key unset, confirm both post with no call
- [ ] 8.5 After the push, confirm the Smoke workflow passes on `main`
