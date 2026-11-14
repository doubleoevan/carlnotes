# Proposal

## Why

The switches an emergency would reach for are spread across Doppler, the admin page, and the code, with nothing
that says what each stops or proves it works, and the one that stops podcast recording also hides every published
podcast episode. An image that fails its check posts unchecked. One 9.5 MB spreadsheet from one free account takes a
worker replica from 54 MB to 1.5 GB and kills it three times. This is Part D of the last work before launch, launch
safety. Its sibling changes are `launch-hardening`, `launch-hardening-page-reads`, and
`launch-hardening-browser-load`.

## What Changes

- **A Launch runbook** in the deployment guide: a pre-wave checklist, what to watch, how to add capacity, every
  switch as a last resort, and how to roll back. Three switches move to the Limits card so they need no restart, two
  runbook switches are added, and every switch has a test and is off by default.
- **Public image moderation that fails closed.** A public-bound image whose check could not run is shown at once to its
  owner alone with one line of copy, and the sweep checks it again within minutes. An admin can reset a reported avatar
  and regenerate a reported podcast episode image.
- **Dependency advisories.** Every high and critical advisory is cleared or allowlisted with a reason, and a script
  fails CI on a new one without blocking a release.
- **A Recovery section** that states what holds each kind of data, what a loss costs, and how it comes back. A
  Redis outage no longer empties a Specials page.
- **One request cannot take a replica down.** Workbooks are read as a stream, an archive's unpacked size is checked,
  extraction runs in a memory-limited child process, avatars are checked and resized before they are drawn, and a
  chat turn is authorized before its body is read.
- **Account emails are retried**, change-email is counted by user, the MCP consent warns about a return host
  CarlNotes does not know, and an admin block takes a person's items off the home.

No route, field, or MCP tool return that a released build reads is removed or changed.

## Capabilities

### New Capabilities

- `emergency-switches`: every switch off by default, proven by a test, settable without a restart where a wave
  could need it, and listed in the Launch runbook.

### Modified Capabilities

- `content-moderation`, `user-avatars`, `topic-images`, `topic-posts`, `topic-podcast-episode-video-rendering`,
  `edge-caching`, `stored-object-deletion`: unchecked images, the owner's note, the sweep's recheck, and a rejected
  unchecked image's files.
- `content-reporting`: an admin's reset of a reported avatar and regenerate of a reported podcast episode image.
- `supply-chain`, `workspace-structure`: the advisory gate, its allowlist, and the Bun pin's check.
- `daily-spend-cutoffs`, `admin-console`, `home-page`: the Limits card's new switches, and an admin block that
  takes a person's items off the home.
- `redis-store`, `specials-dashboards`, `related-topics-and-episodes`: what a Redis outage may fail, snapshots kept
  until a rebuild has new ones, and the centroid's in-process copy.
- `topic-attachments`, `table-attachments`, `topic-chat`: bounded extraction and a body read after authorization.
- `email-delivery`, `user-auth`, `usernames`, `mcp-server`: retried account emails, the change-email count,
  reserved names, and the consent's warning about an unknown host.
- `project-docs`, `deploy-mechanics`: the Launch runbook and Recovery sections, and the migration test behind the
  rollback rule.
- `speech-model-routing`: the proxy at production's version charges a key for a transcription, which the dev stack
  now runs and the speech smoke test checks.
- `voice-chat`: the transcription's spend row is what the app's budget and cutoffs read, and the proxy charges the
  key for the same call.

## Impact

- `apps/docs/deployment.md`: `## Launch runbook` and `## Recovery`.
- `packages/db`: a `unchecked_images` table, an unchecked avatar column on `users`, new columns on
  `spend_control_settings`.
- `apps/api`: `moderation.ts`, `avatars.ts`, the five image upload and file routes, `report/adminReports.ts`,
  `spendControlSettings.ts`, `chat/privateChat.ts`, `chat/attachmentExtraction.ts`, `auth.ts`, `authEmails.ts`.
- `apps/worker`: an unchecked image recheck in the sweep, extraction in a child process.
- `packages/pipeline`: `attachTable.ts`, `attachText.ts`, the podcast plan and film image readers of the new
  switches.
- `apps/web` and `apps/mobile`: the unchecked image's note in the image editor and the avatar pickers, the Limits card,
  the admin reports table, the MCP consent page.
- `.github/workflows/ci.yml`, `.github/dependabot.yml`, root `package.json` (an override, a script),
  `apps/mobile/package.json` (`eas-cli`), a new `scripts/check-dependency-advisories.ts`.
- By hand, listed in the runbook's pre-wave checks: Sentry alert rules, an IP policy on the origin, termination
  grace periods, provider quotas, and the launch-day cutoffs.
