## 1. Lease claim

- [x] 1.1 Add `db/schema/claims.ts` with the `claims` table (name primary key, holder id, taken at, expires at),
      register it in `db/index.ts`, and run `bun run db:generate`
- [x] 1.2 Rewrite `runWithClaim` in `db/claim.ts` as the lease: one take statement, a 30-second renewal timer on a
      2-minute lease read from the database clock, a `ClaimLostError` through an `AbortController` on a lost or
      expired lease, and a release that deletes only the holder's own row. `runTask` receives the signal, and a task
      that ends after a lost claim rejects with the error
- [x] 1.3 Rewrite `db/claim.test.ts` over a stubbed connection: a second taker gets null while the lease is live and
      takes it once it expires, a renewal that finds the lease gone aborts the task, a renewal that throws is retried
      until the lease would have expired, a task's error still releases, and release deletes only the holder's row
- [x] 1.4 Pass the signal through `runScheduledTopicScans` into `sweepScheduledTopics` and
      `startScheduledTopicScans`, checking it before each stage and before each Topic, and update the sweep's tests
- [x] 1.5 Pass the signal into `resetMonthlyBudgets` and check it before each user's replacement, outside the
      per-user catch. Update `worker/resetMonthlyBudgets.ts` and the reset's tests so a lost claim exits non-zero
- [x] 1.6 Remove any connection pool headroom or comment that exists for the claim's held connection, and update
      `db/AGENTS.md` and `worker/AGENTS.md` where they describe the claim

## 2. Scanner on dev

- [x] 2.1 Give `llm-guard` in `docker-compose.yml` `restart: unless-stopped` and `APP_WORKERS=1`, and name it in the
      compose comments
- [x] 2.2 Name the scanner in `scripts/carl-up.sh`'s compose comment and its closing line with its url, with no wait
      on its model download, and update the README's Development section to match
- [x] 2.3 Start the local scanner and confirm that `screenText` returns `screened` against it

## 3. Chat image screening

- [x] 3.1 Add `tesseract.js` and `@tesseract.js-data/eng` at exact versions, and add `worker/imageText.ts` with
      `readImageText`: one worker per process created on first use, loading English data from the installed
      package, never from a CDN
- [x] 3.2 Add `screenImage` to `worker/guard.ts`: skipped before any import when `LLM_GUARD_URL` is unset, a dynamic
      import of `imageText.ts` otherwise, then `screenText(text, "document")`, with a failed read failing open and
      reported. Add tests for the unset url making no import and no call, a flagged text, and a failed read
- [x] 3.3 Screen images in `resolveChatAttachments`, replace a flagged one with the withheld line, return the
      withheld attachments, and have `answerChatTurn` leave them out of what `streamChatTurn` stores. Test that a
      flagged image never reaches the model and is never stored, and that an unset url passes the image unchanged
- [x] 3.4 Screen a kept image's description with `screenAttachmentText` before its row is written, deleting the
      uploaded object when it is flagged, with a test
- [x] 3.5 Screen a room image in `prepareChatRoomAttachment`, rejecting the post when it is flagged. Screen the
      description in `describeChatRoomImage`, marking the row `failed` when it is flagged. Make the image read in
      `api/chat/roomTurns.ts` skip `failed` rows. Test that a flagged description never turns ready and its image is
      never read into a turn
- [x] 3.6 Update `api/AGENTS.md` and `worker/AGENTS.md` for the new module and the image screen

## 4. Scanner measurement on images

- [x] 4.1 Render the benign article screenshot and the instruction image, commit them under
      `evals/review-pipeline/images/`, and add `injectionImages` to a fixture
- [x] 4.2 Extend the guard-only run to screen each image through `screenImage` and print the image rates on their own
      lines, with the eval's tests updated
- [x] 4.3 Run `bun run eval:review-pipeline --guard-only` against the local scanner, and record the text and image
      rates in the design's table and in the README where the measured numbers are published

## 5. Structural edit confirmation

- [x] 5.1 Run one live turn through the chat model alias with saves in its history and no saving tool bound, and
      record in the design whether the provider accepts it. If it rejects, switch the replay of saves to text before
      going on
- [x] 5.2 Add "proposal" to the Chat Turn row of the domain-model skill. Add `chat_proposals` to `db/schema/chat.ts`
      with the unique index, nulls not distinct, and run `bun run db:generate`
- [x] 5.3 Move the execute bodies of the saving tools and of `createTopic` into shared functions in `api/tool/` that
      return the toast lines and the result text, and have the room's tools call them
- [x] 5.4 Add `worker/chat/agreement.ts` with `checkAgreement` and the versioned `worker/prompts/check-agreement.md`,
      cheap tier, untrusted variables fenced, returning `agree`, `decline`, or `unclear` through `Output.object`, with
      `unclear` for empty words and for a failed call. Add tests for both fallbacks and for the prompt seeing only the
      words and the preview
- [x] 5.5 Add `api/chat/chatProposals.ts`: the canonical digest, recording a standing preview after a finished turn,
      taking and deleting the row at the start of a turn, rebuilding and matching the preview, and applying an agreed
      one as recorded tool calls, a decline as a `cancelTopicEdit` call, and a lapse as `isTopicEditCancelled`
- [x] 5.6 Wire it into `answerChatTurn` and `streamChatTurn`: take the proposal before the reply, put the server's
      calls into the model messages after the question, give the private edit block the outcome line, add the check's
      tokens to the turn's spend, and record the turn's own standing preview after the save
- [x] 5.7 Bind only `openNewTopicChat`, `proposeTopicEdit`, and `cancelTopicEdit` in the private topic chat. Add the
      `proposeNewTopic` tool and bind it in place of `createTopic` in the new-topic chat. Add
      `worker/prompts/chat-propose-topic-edit.md` for the private edit block, and revise step 9 of
      `chat-new-topic.md` with its version bumped
- [x] 5.8 Add tests: a confirmation in other words applies, a hesitant reply applies nothing and lapses the card, a
      mismatched digest applies nothing, a decline cancels, only the next message can agree to a preview, an unpersisted
      chat stores no preview words, and the new-topic chat creates only on agreement. Update
      `api/tool/chatTools.test.ts`, `api/tool/newTopicChatTools.test.ts`, and `worker/chat/chatMessages.test.ts`
- [x] 5.9 Update `api/AGENTS.md` and `worker/AGENTS.md` for the new modules and prompts

## 6. Tool-call evals

- [x] 6.1 Run solo cases in `evals/topic-chat-tools` through the private chat's path, with the real agreement check,
      stand-ins for the Topic Tools' writes, and the preview tools alone. Team cases stay as they are
- [x] 6.2 Add cases for a confirmation in other words, a hesitant reply, an instruction inside an attachment, an
      instruction inside an image, using the eval's instruction image, and a preview whose own text says to agree
- [x] 6.3 Move `evals/new-topic-chat` to `proposeNewTopic` and the server create through the agreement check, and add
      a case that the read-back calls `proposeNewTopic`
- [x] 6.4 Run `bun run eval:topic-chat-tools` and `bun run eval:new-topic-chat`, and fix until both gates pass

## 7. Verification and hand-off

- [x] 7.1 Run `bun run check` and the comment-groups hook on every changed `.ts` file
