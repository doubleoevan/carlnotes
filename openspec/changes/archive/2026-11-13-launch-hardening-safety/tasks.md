# Tasks

Part D of the launch hardening work. Groups 1 to 4 are the request's items Twenty-one to Twenty-four, one group
each. Group 5 holds findings from the closing read, each marked with its id from the findings table in
`launch-hardening`'s design. Group 6 is the integration checks. This change adds no workflow step: every new read
sits inside an activity or a route.

## 1. One runbook of every emergency switch (item 21, with findings W1, O1, O4, O5, O9, O10, O12, O14, S9, S15)

- [x] 1.1 Add three columns to `spend_control_settings`: `is_podcast_episode_recording_paused` and
      `is_topic_podcast_episode_video_rendering_paused` (false by default; identifiers say
      `topicPodcastEpisodeVideo` where copy says film) and a nullable `generated_chapter_image_limit`, through the
      contract, the payload (every field optional, an absent field leaves its column alone), the settings loader (a
      missing cached field reads as off), the admin route, and the Limits card. Verify: route and loader tests, and
      a story of the card with each switch on
- [x] 1.2 Read "pause new podcast episodes" in the plan beside the speech model check, "pause new films" in the
      film switch read, and the image limit override in the chapter image preparation, each inside its activity.
      Recordings and renders in progress finish, published podcast episodes and feeds stay as they are. Verify: a
      test for each that sets the switch and checks nothing new starts and nothing published is hidden
- [x] 1.3 Read the film backfill concurrency and `SCAN_DISPATCH_LIMIT` so that 0 means none, and read
      `SCAN_DISPATCH_LIMIT` through a function a test can set. Verify: reader tests at unset, 0, and a value
- [x] 1.4 (finding S9) Extend the unverified accounts switch, while it is on, to an unverified password account's
      chat, voice, and manual Scans. Chat and voice answer with one line that says to verify the address (suggested:
      "Carl will answer once your email is verified. Check your inbox."). A manual Scan waits as a first Scan does,
      with no copy. Off by default. Verify: tests that a verified and a provider sign-in account are never
      affected, and the line in both apps
- [x] 1.5 Add the missing switch tests: the speech model set empty records nothing and writes no row; film
      concurrency unset is 1 and 0 is off; `isTopicPodcastEpisodeVideoEnabled` is false at 0. Add one "off by
      default" test: with no Doppler value and an empty settings table, every switch reads its off value. Verify:
      the tests pass
- [x] 1.6 Read a week of production gauge lines and record each field's normal range: the pool's waiting count, the
      event loop's p99 and largest delay, the Redis counts, each queue's backlog and oldest age. Verify: the
      ranges are in the runbook with the dates they were read
- [x] 1.7 Write `## Launch runbook` in `apps/docs/deployment.md` after Deploy alerts: the pre-wave checklist (task
      1.8), what to watch (each gauge field, each queue backlog, the day's spend line, each Sentry condition, with
      its threshold, its normal range, and the reading that means add capacity), how to add capacity (each service
      and queue, with `DATABASE_POOL_COUNT` and a restart first), and every switch as a last resort from design
      A.21's inventory (where it is set, whether it needs a restart, what it stops, what keeps working, what a
      person sees, how to undo it). State what `PODCAST_SPEECH_MODEL` set empty really does. Verify: every setting
      the runbook names is found by a grep of the code, and every switch has a test named beside it
- [x] 1.8 Write the pre-wave checklist in the runbook: (finding W1) the launch-day values of the three cutoffs and
      the first scan dispatch limit, from expected signups times $0.56; (O1) three Sentry rules: every event tagged
      `alert: performance`, an issue seen more than five times in fifteen minutes, and the "no temporal worker"
      issue, plus `GLOBAL_DAILY_SPEND_ALERT_USD` set; (O4) an IP policy that restricts each service's public port to
      Cloudflare's ranges; (O9) each service's termination grace; (O10, O12, S15) each plan and quota to read in
      its dashboard: Sentry, PostHog, Langfuse, Resend, Fireworks, Gemini speech and images, Exa, Firecrawl,
      YouTube, Google Maps, the moderation endpoint, Redis `maxmemory` and `noeviction`, the Neon compute's
      maximum, the Temporal server's store; (O14) whether the app's store links are live. Verify: each line says
      where to look and what value is wanted
- [x] 1.9 (finding O5) Write the Rollback part: roll `app` and `web` back by deploying the previous build to that
      service alone; never roll the worker back past a `patched` change; a migration adds in one release and
      removes in a later one; the deploy freeze (taking the push trigger off `release-main`); a docs commit also
      deploys;
      every deploy purges the edge. Add a test beside the lock timeout test that fails a new migration holding
      `DROP COLUMN`, `DROP TABLE`, or `RENAME` unless its first comment says the previous release no longer reads
      it. Verify: the test fails on a fixture migration and passes on the repo
- [x] 1.10 (finding O12) Add the deployment guide's service table rows this change knows (each service's size,
      replica range, grace period, and health check, filled from the dashboards) and bring the dev LiteLLM image to
      production's version. Verify: the smoke suite passes on the new image
- [x] 1.11 Docs: the Spend control settings table in the deployment guide, `packages/db/AGENTS.md`,
      `apps/api/AGENTS.md`, `apps/worker/AGENTS.md` (a film concurrency of 0 still lets the api queue rebuilds),
      `packages/server/AGENTS.md`, the README's Spend control section. Verify: each new setting is named once

## 2. Public image moderation that fails closed (item 22, with finding R19)

- [x] 2.1 Return "unchecked" from `toObjectionableImageCategory` for a failed classification and keep its report. A
      skipped check (no key) still returns null. Chat room images treat "unchecked" as today's null. Verify:
      `moderation.test.ts` for the four results
- [x] 2.2 Add the `unchecked_images` table (subject kind, subject id, uploader, the key or hash, the content type and
      size the promote needs, uploaded at, attempt count, reported at, whether it is published; unique on kind and
      subject) and `users.unchecked_avatar_key`. Verify: schema tests
- [x] 2.3 Save as unchecked a public-bound upload whose check was unchecked: store the files, write its row, clear the
      upload's pending deletion in the same transaction, and leave the public pointer where it was. Public-bound is
      every user and team avatar and a topic-bound image whose Topic is invite or public. A second upload while one is
      unchecked replaces the unchecked image's row and records the earlier files for deletion. Verify: route tests for
      the avatar, the team avatar, and the topic, podcast episode, Topic Post, and film image uploads, and a test that a
      private Topic's upload is published at once
- [x] 2.4 (finding R19, close) For a private Topic's upload whose check was unchecked, publish as today and write an
      `unchecked_images` row marked published, which the sweep checks and removes like an admin removal if it is
      flagged. Verify: a test that the image shows at once and is removed after a flagged recheck
- [x] 2.5 Show the owner the unchecked image at once: return `unchecked_avatar_key` with the session and use its version
      in `useAvatar`; serve an unchecked avatar only to its user's session with `private, no-store`; serve an unchecked
      hash only to its uploader through `serveImageFile`'s private branch in the four file routes; overlay the unchecked
      urls for the uploader in the subject's own page read; return an optional `isImageUnchecked` on the upload
      responses, whose frozen shapes stay. An unchecked film image stores its file only and rebuilds nothing. Verify:
      tests that a second account and a visitor get the published image, that no overlaid read is shared, and the
      contract freeze check
- [x] 2.6 Show the note in the shared image editor, the avatar pickers on web and mobile, and the team avatar's two
      editors: "Only you can see this image until Carl finishes checking it." and the photo form for an avatar. The
      MCP `set_topic_image` tool keeps every field, returns the current image, and says the same in its text.
      Verify: stories for each on web and mobile, and the tool's test
- [x] 2.7 Move `replaceAvatar`, the team avatar's transaction, and `refreshSessionUser` to `packages/db`, so the
      worker can promote an avatar. Verify: the boundary check passes and the api's avatar tests still pass
- [x] 2.8 Recheck unchecked images in the sweep after the pending deletions retry: oldest first up to a batch, promote a
      clean image through the function that publishes its kind (the film's promote starts its rebuild), delete a
      rejected one and leave the previous image, raise the attempt count and stop the batch on a failed call, and report
      an image unchecked for over a day once. Collect an unchecked avatar's key on account deletion. Verify: sweep tests
      for clean, rejected, failed, and a subject that is gone
- [x] 2.9 Add "Reset avatar" to a `profile` report and "Regenerate" to a `podcastEpisode` report in the admin console,
      on Remove only, with the image shown in the row; the same for a team's avatar and a film's image. The reset purges
      the avatar's edge tag and clears an unchecked avatar. Add `removePodcastEpisodeImageUpload` beside the Topic
      Post's, which starts a render on the platform's key. Verify: `adminReports.test.ts` for each action, a story of
      the table, and a test that a reported topic image still regenerates
- [x] 2.10 Docs: `apps/api/AGENTS.md`, `apps/worker/AGENTS.md`, `packages/db/AGENTS.md`, `apps/mobile/parity.md` if
      a picker's row changes, and the runbook's line for an unset `OPENAI_API_KEY`. Verify: each names the unchecked
      state

## 3. Dependency advisories (item 23, with finding R20)

- [x] 3.1 Bump `eas-cli` to `^27.7.2` in `apps/mobile/package.json` and refresh the lockfile under the pinned Bun,
      so node-forge and minimatch move inside their ranges. Verify: a preview build, an update, and a dry-run
      submit run; `bun audit` no longer lists the 17 highs
      - Ticked as built on 2026-11-13, by the owner's decision. Done in the apply: the bump, the lockfile, and the
        audit, which no longer lists them. Left for the owner, with the EAS account: the preview build, the update,
        and the dry-run submit
- [x] 3.2 Add the root override of `dompurify` to 3.4.17. Verify: the notes editor's chunk of the web bundle holds
      3.4.17, the notes editor and viewer stories pass, and `bun audit` lists no dompurify advisory. posthog-js
      ships a built-in copy at 3.4.13 that no override reaches (design D5, amended)
- [x] 3.3 Write `dependency-advisories.json` (advisory id, package, reason, date reviewed) with the three allowlisted
      advisories from design A.22, and `scripts/check-dependency-advisories.ts`: run `bun audit --json`, read stdout
      whatever the exit code, keep high and critical, drop the allowlisted pairs, fail on what is left and on an
      entry that matches nothing, and assert the workspaces' own zod stays at 4.6.6 or later. Add
      `check:advisories` to `package.json` and the README. Verify: a unit test of the filter on a saved audit
      output, and the script exits 0 on the repo
- [x] 3.4 Run the script in a CI job of its own, apart from `gate`, and remove the report-only step.
      Verify: a pushed branch with a known high advisory turns that job red and leaves `gate` green
      - Ticked as built on 2026-11-13, by the owner's decision. Done in the apply: the `advisories` job, the
        removed step, and the script exiting 1 on a saved audit with open highs. Left for the owner, after the push:
        the branch that turns the job red
- [x] 3.5 (finding R20) Add Dependabot `ignore` entries for the four patched packages, pin `markdown-to-jsx`
      exactly, set `.bun-version` to the Dockerfile's version, and add two preflight checks: `.bun-version` equals
      the Dockerfile's tag, and every `patchedDependencies` key names an installed version. Verify: each check
      fails on a fixture and passes on the repo
- [x] 3.6 Docs: `SECURITY.md`, the README's supply chain line. Verify: both say the gate fails at high and above and
      that Dependabot's security updates do not see transitive packages

## 4. Recovery (item 24, with finding R21)

- [x] 4.1 Run the api, and the web service if it exists by then, with a throwaway Redis stopped, never the dev
      container: load a public profile, a topic page, and the home, sign in, post a view, send a chat turn, and
      close an account. Verify: design.md records each
      result, and only the account close fails, with its 503
- [x] 4.2 (finding R21) Keep a Dashboard's snapshots until a rebuild started by a publication has new ones to
      write (a Topic made private, deleted, or moved still deletes them at once), and keep an in-process copy of
      the embedding centroid for an hour. Verify: a test that a publish with Redis unreachable leaves the
      Specials page showing its last snapshot, and that a second related read with Redis unreachable sends no
      centroid query
- [x] 4.3 Write `## Recovery` in `apps/docs/deployment.md` after the Launch runbook, one part per store from design
      A.21: Postgres (the cutover steps, and what a restore brings back: deleted rows to delete again within the
      privacy page's 90 days, objects that are not restored, retired LiteLLM keys, Stripe events to send again,
      the same `CHAT_TEXT_KEY`), R2 (what comes back by itself, for a cost, and not at all), Redis (what a loss
      costs and what an outage fails), Temporal (start empty, never from an older copy, and what the sweep closes
      out), and LiteLLM's database, `CHAT_TEXT_KEY`, and `BETTER_AUTH_SECRET`. Mark each fact only a dashboard
      knows as the owner's to fill: the Neon restore window, R2 versioning, Redis persistence, the Temporal store.
      Verify: every claim cites the code or is marked for the owner, and none states a window or a plan as fact

## 5. Findings: one account cannot stop the product

- [x] 5.1 (finding S1) Read a workbook that declares more than 4 MB unpacked with the streaming reader and stop
      after the rows the text keeps, and keep reading a smaller one whole. Verify: the scratch measurement in A.28,
      run again on the 9.5 MB workbook, stays under 200 MB, and the extracted text is unchanged for the fixtures
- [x] 5.2 (finding S1) Read a zip's directory before a Word file or a workbook is opened and reject a declared
      unpacked size far past a real document's. Verify: tests with a small file that declares a large unpacked
      size
- [x] 5.3 (finding S1) Run extraction in a child process with a memory limit, in the api and in the worker, a few at
      a time in the api taken in turn by user. A kill ends one file with a failed attachment. Verify: a test that
      a file past the limit fails alone while another person's file succeeds
- [x] 5.4 (findings S1 and R16) Read an avatar's pixel size on upload and reject one past a few thousand pixels a
      side, store an uploaded avatar resized, and pass every avatar through a resize with a pixel limit before a
      card inlines it, provider photos included. Verify: the scratch measurement's 12,000 pixel PNG is rejected on
      upload and adds under 50 MB when drawn from storage
- [x] 5.5 (finding S1) Put the attachment upload and the url attachment behind the tool caller limiter. Verify: a
      route test
- [x] 5.6 (findings P4 and S11) Authorize a chat turn (the budget and the cutoff) before its body is read, and admit
      chat bodies over a few megabytes through a concurrency limiter keyed on bytes in progress, so a post waits its
      turn and nobody is turned away. Verify: a test that a rejected turn reads no body, and that ten large posts
      at once hold no more than the bound
- [x] 5.7 (findings O11, W10, P5, S8, P12) Send verification, reset, change-email, and invitation emails through the
      retrying call with a stable key and a slot of their own, and give the Turnstile check a five-second limit.
      Verify: `email.test.ts` shows a 429 retried after its wait, and a timed-out check reads as failed
- [x] 5.8 (finding S7) Count change-email by user, a few a day, where the reset gate is. Verify: an auth test
- [x] 5.9 (finding S4) Have an admin block take the person's Topics, podcast episodes, films, and Topic Posts off
      the home, and add "the home shows pinned items only" to the Limits card, off by default. Verify: home tests
      for the block and the switch, and the switch's row in the runbook
- [x] 5.10 (finding S10) Show the host an MCP consent's answer returns to under the question only if it is not a
      host CarlNotes knows, and say so plainly. A known host and an address on the user's own device show nothing
      more than today. Verify: a story of the consent page for each, and a test of the route's new field
- [x] 5.11 (finding S14) Reserve "vienna" and the staff words in the username rules. Verify: `usernames.test.ts`
- [x] 5.12 Docs: `apps/api/AGENTS.md`, `apps/worker/AGENTS.md`, `packages/pipeline/AGENTS.md`,
      `packages/emails/AGENTS.md`. Verify: each names the changed path

## 6. Integration checks

- [x] 6.1 `bun run check` is green, the contract freeze check and the client parity check included
- [x] 6.2 Each runbook switch is set once in dev and its named behavior seen, then unset. Verify: the list of
      switches with the date each was tried is recorded in design.md
- [x] 6.3 With the moderation key unset in a scratch config, and with the endpoint blocked, upload a public avatar and a
      public topic image. Verify: unset posts as today, blocked saves the image as unchecked, the owner sees it with the
      note, a second browser does not, and the next sweep after unblocking publishes it

## Workflow follow-up

- Ship through `/ship`, which archives the change with `openspec archive launch-hardening-safety --yes`.
- The owner checks in the runbook's pre-wave checklist are done by hand, in their dashboards, before the wave.
