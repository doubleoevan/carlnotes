# Tasks

## 1. Schema and contracts

- [x] 1.1 Add `reports` and `user_blocks` to `packages/db/schema/` with the indexes and cascades the design names, add
      `terms_accepted_version` and `terms_accepted_at` to `users`, run `bun run db:generate`, and verify the migration
      applies on a fresh local database and that `bunx tsc -b` passes
- [x] 1.2 Grow `flagContentPayload`'s subject kinds by `chatMessage`, `note`, and `noteComment` with an optional
      `shouldBlockAuthor`, add the report, block, terms version, moderation verdict, and `termsOutdated` contracts to
      `packages/contracts/`, add the Carl-voiced rejection copy per category, and verify their zod tests pass

## 2. Reports

- [x] 2.1 Extend `toFlaggedSubject` in `apps/api/flagContent.ts` with the message, note, and comment arms through
      `loadChatRoom` and `canSeeNote`, store the report row with the subject's text and author before the send, keep
      the limit and refund, and verify route tests cover each kind, the hidden-subject 404 in the same words, and the
      refund keeping the row
- [x] 2.2 Filter the reporter's reported subjects out of `loadChatRoomMessages`, `loadChatRoomDeltas`, the comment
      list, the note lists, and the note read, and verify tests show the reporter's reads omit the subject while
      another reader's include it
- [x] 2.3 Move the report email into a `packages/emails` template with the text, author, reporter, reason, and the
      `/admin?report=<id>` link, and verify its render test and the `flag-content` send
- [x] 2.4 Add the admin reports routes to `apps/api/admin.ts`: the open list, Remove through `deleteChatRoomMessage`,
      the note delete, and the comment delete with its new admin arm, Keep, and the open count, and verify route tests
      cover a non-admin rejection, each resolution, and already-gone content
- [x] 2.5 Add the open-report reminder stage to the worker sweep, mailing once past twelve hours and writing
      `reminded_at`, and verify a test shows one reminder and no second
- [x] 2.6 Update `apps/api/AGENTS.md`, `packages/emails/AGENTS.md`, and `apps/worker/AGENTS.md` for the new modules
      and the sweep stage, and verify the paths they name exist

## 3. Blocking

- [x] 3.1 Add the block routes and the blocked-ids subquery helper to `apps/api/`, rejecting a self block, and verify
      route tests cover block, repeat block, unblock, self block, and the list
- [x] 3.2 Apply the helper to the room message list and deltas with the hidden-reply marker, the mention count with
      its cache cleared on block, the comment list and count, the pending invite lists and badge, `acceptInviteToken`,
      and people search, and verify tests show each read omits the blocked person for the blocker only
- [x] 3.3 Make `createUserInvite` reject a blocked sender with the "not-accepting" result, and verify a test shows the
      response equal to the setting's response
- [x] 3.4 Cascade blocks on account close and add the admin console's block count, and verify the close test and the
      console test

## 4. Moderation

- [x] 4.1 Write `packages/models/prompts/moderate-user-text.md` with frontmatter and a fenced text variable, its thin
      builder, and `classifyUserText` on the cheap tier with the schema-locked verdict, the four-second timeout, the
      master key, and no trace input or output, and verify a unit test with a stubbed proxy for a clean, a violating,
      an off-schema, and a timed-out answer
- [x] 4.2 Add the api's `rejectObjectionableText` helper answering 422 with the category and reporting a failed
      classification without the text, and wire it into the room message post, note create, rename, and body save
      with the sanitizer's text pass, comment post, username save, team create and update, and `saveTopic` for invite
      and public Topics including the visibility change, and verify route tests for a rejection, a clean post, and the
      fail-open path on each
- [x] 4.3 Record the moderation call in `packages/models/AGENTS.md` and the prompt in its catalog, and verify
      `bun scripts/check-package-boundaries.ts` passes

## 5. Terms and contact

- [x] 5.1 Add `TERMS_VERSION`, the Better Auth user-create hook writing it on every sign-up path, the
      `POST /users/me/terms-acceptance` route, the session's version field, and `requireTermsAccepted` on the
      user-readable write routes answering 403 `termsOutdated`, and verify tests cover a provider sign-up, a password
      sign-up, a stale account's rejected post, and an accepted account's post
- [x] 5.2 Add the approved Terms section from `terms-draft.md` to `TermsPage.tsx` with the version date on its first
      line and the Contact section's new line, and verify the page renders in Storybook and the date matches
      `TERMS_VERSION`
- [x] 5.3 Add the Contact entry to the shared footer and the mobile Settings screen through the link component, and
      verify the footer story and the settings story show it opening a mail draft

## 6. Web

- [x] 6.1 Add Report to the message and comment footers and the note dialog, the "Block @name" checkbox to
      `ReportIssueDialog` for an authored subject, and Block or Unblock to the profile action menu, and verify the
      component tests and stories for each subject kind and the blocked profile
- [x] 6.2 Add the shared `BlockedUsersSection` to `packages/core/components/AccountFields.tsx` and render it in
      `AccountSettings.tsx` with the Invitations section, and verify its story shows the list and the empty state
- [x] 6.3 Show the Carl-voiced rejection next to the room composer, the comment box, the note editor, the username
      form, the team form, and the topic form with the draft kept, and verify a story per composer and a test that the
      draft survives a 422
- [x] 6.4 Add the shared terms dialog to the root layout on a stale session and on a `termsOutdated` rejection, with
      the kept draft re-sent on accept and Not now as the other choice, and verify its story and a test of the re-send
- [x] 6.5 Add the Reports view to `AdminPage.tsx` with the open list, Remove, Keep, the header count, and the
      `?report=` focus, and verify its story and the page test
- [x] 6.6 Run `apps/web/src/components/stories.test.ts` and verify every new component in a covered folder has a story

## 7. Mobile

- [x] 7.1 Mirror 6.1 on mobile: Report in the message and comment footers and note management, the block checkbox in
      the report sheet, Block or Unblock in the profile action menu, and verify stories for each with their web
      references named
- [x] 7.2 Render the shared `BlockedUsersSection` in mobile `AccountSettings.tsx` with the Invitations section, and
      verify its story
- [x] 7.3 Show the rejection with the kept draft in the room composer, comment box, note editor, username, team, and
      topic forms, and verify a story per composer
- [x] 7.4 Show the shared terms dialog on a stale session and on `termsOutdated` with the re-send, and the sign-up
      screens' acceptance line, and verify their stories
- [x] 7.5 Update `apps/mobile/parity.md` and `apps/mobile/AGENTS.md` with the new actions and the Admin hand-off, and
      verify `bun scripts/check-client-parity.ts` passes

## 8. Docs and verification

- [x] 8.1 Add the reporting and blocking user docs page under `apps/docs/src/content/` and run `bun run docs:embed`,
      and verify the page builds
- [x] 8.2 Run `bun run check` and verify it is green
- [ ] 8.3 With two accounts on the web and on the Android emulator, report a message, note, and comment and verify the
      reporter's hiding, the email with its link, and removal from the console; block and unblock and verify room
      messages, comments, pending invites, people search, and live events; post an abusive draft and verify the
      rejection keeps it; unset the classification route and verify the post goes through with a report
- [ ] 8.4 Sign up by email, Google, Apple, and GitHub on each app and open an existing account, and verify each records
      the version and the existing account sees the dialog once

## Workflow follow-up

- The wording in `terms-draft.md` was approved on 2026-10-29. Task 5.2 sets the version date in its commit.
- After the deploy: answer the content rating questionnaire and the child safety self-certification in Play Console,
  name support@carlnotes.com as the child safety contact, and describe the report, block, and filter tools in App Store
  Connect's Notes for Review with the demo account.
- Archive the change after the project's review requirements are satisfied.
