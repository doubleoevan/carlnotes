# Proposal

## Why

Both apps now carry user-written prose that other people read: chat room messages, notes, and note comments. The
content-reporting spec says that the day a free-text field ships, the one-flag-control moderation surface stops being
enough, and the App Store (guideline 1.2) and Google Play (the User Generated Content policy) both require filtering,
in-app reporting with timely responses, in-app blocking, accepted terms that prohibit objectionable content, and a
published contact before the mobile app can be submitted. This change finishes that work on web and mobile before the
store submission, reusing the report dialogs, legal pages, and settings sections already shipped.

## What Changes

- Reports extend from Topics, profiles, and Teams to chat room messages, notes, and note comments, through the existing
  flag contract, api route, client, and report dialog on both apps. A report is stored, not only mailed. The reporter
  stops seeing the reported content at once. The admin email reuses the existing send and gains a template with the
  reported content, the reporter, and a link into the admin console's new Reports view, where an admin removes the
  content or keeps it. The sweep reminds the admin inbox of a report left open past half a day, and the console shows
  the open count. The mobile Admin entry keeps handing off to the web console.
- Blocking is new: one `user_blocks` table and migration, block and unblock routes, and a Blocked people section in
  both apps' Account settings. A blocker no longer sees the blocked person's room messages, note comments, mentions,
  pending invites, or people search results, on first load and in live events alike, and a new invite from the
  blocked person is rejected with the same words the "not accepting invitations" setting already uses. The blocked
  person is never shown who blocked them. Block and Report sit together on messages, comments, notes, and profiles.
- Filtering is new: every text another user can read is classified before it posts, through the existing LiteLLM
  route's cheap tier with a schema-locked prompt. A confirmed violation is rejected in Carl's voice and the draft stays
  in the composer. The filter fails open: if it cannot answer, the post is allowed and the failure is logged and
  reported without the text. Public Topic names and prompts, Team names and descriptions, usernames, note names and
  bodies, comments, and room messages are covered.
- Terms gain a prohibited-content and removal section, drafted in this change's folder for human review before it is
  published. The Terms get a version. Every sign-up path on both apps records acceptance of the current version, and
  an existing account accepts it once in a dialog on its next signed-in load. A user-content write from an account
  that has not accepted the current version is rejected.
- A Contact entry for support@carlnotes.com, the address the Terms and Privacy pages already name, joins the footer
  and the mobile Settings screen beside the existing Privacy, Terms, License, and docs links.
- Storybook covers the new states on both apps: the report dialog per subject kind, the block confirmation and the
  blocked profile, the Blocked people section, a rejected draft, the terms dialog, and the contact entries.

## Capabilities

### New Capabilities

- `user-blocking`: one person blocks another, and the block hides the blocked person's messages, comments, mentions,
  invites, and people search results from the blocker without telling the blocked person.
- `content-moderation`: user text that others read is classified before it posts, a violation is rejected in Carl's
  voice with the draft kept, and an unanswered classification lets the post through with the failure reported.
- `terms-acceptance`: the Terms carry a version, every sign-up path records acceptance of it, existing accounts accept
  it once, user-content writes need it, and the operator's contact address is published in both apps.

### Modified Capabilities

- `content-reporting`: the flag control is no longer the whole moderation surface. Reports cover chat room messages,
  notes, and note comments, are stored and hidden from the reporter, reach the admin through an email with a console
  link, and are resolved in the admin console's Reports view, with a reminder for a report left open.
- `tasting-note-comments`: a comment's delete is no longer the author's alone. An admin resolving a report removes the
  comment through the same route.

## Impact

- `packages/db/schema/`: new `reports` and `user_blocks` tables, `users.terms_accepted_version` and
  `users.terms_accepted_at`, and their generated migration.
- `packages/contracts/`: the flag payload's subject kinds, the report and block contracts, the terms version, the
  moderation verdict, and the Carl-voiced rejection copy.
- `apps/api/`: `flagContent.ts` and the report store, the admin console's reports routes, block routes, the block
  filters on room messages, room events, mention counts, note comments, pending invites, and people search, the
  moderation step on every user-text write route, the terms acceptance route and gate, and Better Auth's sign-up hook.
- `packages/models/`: the moderation prompt under `prompts/` and its thin builder.
- `packages/emails/`: the report email template and the open-report reminder.
- `apps/worker/`: the sweep's open-report reminder.
- `packages/core/`: the shared report, block, terms, and blocked-people composition both apps render.
- `apps/web/` and `apps/mobile/`: the report and block actions on messages, comments, notes, and profiles, the
  Blocked people settings section, the rejected-draft state, the terms dialog, the contact entries, the admin Reports
  view on web, and the stories for each state.
- Docs: the Terms page's new section after review, `apps/docs` user docs for reporting and blocking, the affected
  AGENTS.md files, and `apps/mobile/parity.md`.
- Spend: one cheap-tier classification per user-text post, on the master key, bounded by the posting rate limits that
  already exist.
