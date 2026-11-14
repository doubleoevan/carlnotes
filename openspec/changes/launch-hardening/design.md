# Design

## Read this first

This section holds what the request asked to see before anything else: how the work is split, where a person's
experience would change, every finding from the closing read, and every claim the code no longer matches. The
decisions for this change follow under Decisions, and each sibling change has its own.

### The work ships as four changes

- **Chose:** four changes, one per part. `launch-hardening` is Part A (the worker, the sweep, and the web service),
  `launch-hardening-safety` is Part D, `launch-hardening-page-reads` is Part B, and `launch-hardening-browser-load` is
  Part C. Each has its own proposal, design, delta specs, and tasks, and ships through its own `/ship`.
- **Why:** the 24 items grew by 80 findings (56 from the closing read, 24 from the research on the items), and this
  repo's ship ritual verifies and archives one change against one diff. One change would mean one review over several
hundred files and nothing live until all of it is done. Four
  changes let the worker and safety work reach production and soak before launch while the page work continues.
- **Rejected:** one change shipped once (too large to review or bisect), and one change pushed in parts (the specs
  would lag what is live, and `/ship` cannot verify a change that is half built).
- **Order:** this change and `launch-hardening-safety` modify no requirement in common, so they ship in either order
  or side by side. `launch-hardening-page-reads` follows this change, and `launch-hardening-browser-load` follows
  it. Four requirements are modified by more than one change: `edge-caching` "A signed-out page and the signed-out
  feed are shared at the edge for a minute" (this change, then page reads), `ui-routing` "Public routes render on
  the server, signed-in routes render on the client" (this change, page reads, then browser load),
  `monitoring-analytics` "Sentry instruments the api and the worker with an environment tag and sampled tracing"
  (this change, then browser load), and `performance-telemetry` "A cached route has a query budget" (page reads,
  then browser load). Each later change's block already holds the earlier change's text, so archiving out of order
  would lose an edit. A check over all four changes found no other requirement modified twice and no added header
  that collides, and each change passes `openspec validate --strict`.

### Where scaling is not possible and a person's experience would change

| # | Where | What a person would see | Chose |
|---|---|---|---|
| X1 | **The daily spend cutoffs are thresholds in force, never "off by default".** At their defaults ($65, $100, $150, and 5 waiting scans a sweep) the wave's own people pass them: a new free person costs about $0.56 on their first day (A.26), so the $100 cutoff passes after 180 to 1,000 signups | From then every free person's first and manual Scan waits and starts at 20 an hour while 3,000 arrive (production's sweep runs every 15 minutes, read from Northflank on 2026-11-13, and each sweep starts 5), and chat pauses for every free user until midnight UTC. No capacity in this change can lift a spend cutoff | No code changes the cutoffs, as the request says. The Launch runbook gains a step before the wave: set the three cutoffs and the first scan dispatch limit on the Limits card from expected signups times $0.56. **The dollar figure is yours.** 3,000 signups would spend about $1,670 |
| X2 | **The speech provider allows 10,000 requests a day**, by a comment in `.env.example` that was not checked with Google. Each chapter, chapter retry, discussion, and spoken chat reply is one | Past it, podcast episodes publish with chapters missing or fail, and chat replies lose their voice that day. Slots cannot add what the provider will not serve | The scheduled chapter queue takes 32 slots a replica, the size at which the worker stops being the limit. The runbook records the allowance and counts the day's speech requests. **Raising the allowance with Google is yours** |
| X3 | **Scan capacity is fixed at about 290 first Scans an hour** on two replicas of 8 slots, and nothing scaled it | 3,000 first Scans would take ten to thirteen hours | Capacity: scheduled Scans move to a queue of their own, the main worker scales out on the scan backlog, and a task measures 16 and 24 slots a replica. The model and fetch providers' rate limits then become the limit, and those are yours to raise (the runbook lists each) |
| X4 | **The connection pool.** With every service at its autoscaling maximum an equal share at production's `max_connections` of 901 is 35 to 42 connections, and a worker replica already peaks at 78 open | Queries queue inside a pool, and one that waits 10 seconds fails its request or its activity | Pools are sized by shares, with the worker's main role taking two. **Raising the Neon compute's maximum before the wave is yours**: 4 CU reads 1,802 by Neon's formula. The runbook's step names the startup line that confirms it |
| X5 | **A Topic at its limit on a quiet feed stops changing between Scans** once item eleven stops re-scoring removed pages | Its scheduled email says "nothing new" more often and its push is sent less often. Today those "new" Findings are pages deleted and written again, losing their reactions and read state each time. The Topic's notes card would also go blank more often, because it reads the latest Scan's recap even if empty | The notes card and the feed card read the newest Scan that wrote a recap, as the page's meta description already does, so a quiet Scan never blanks the note. The docs state the rule |
| X6 | **An unchecked image.** A public image whose check could not run is shown to its owner alone | Other people see the previous image or the default for the minutes that the image is unchecked. The owner sees the new image at once with one line of copy | As item twenty-two asks. It happens only while the moderation endpoint is failing |
| X7 | **A quiet person's late activity moves to the next day's notifications email** once the quiet day is recorded | A person quiet at 15:00 UTC who gets a reaction at 18:00 is mailed the next day at 15:00, where today a later sweep mails them at about 18:01 | Record the quiet day, as item ten asks. The living spec already says this for a person who was sent an email |
| X8 | **Comment Mentions join the one badges poll**, which a living spec forbids ("SHALL never read it on a timer") | Nothing visible: the badge can update up to 45 seconds sooner | Modify the spec (close, in `launch-hardening-browser-load`). The read is a five-minute cache that every writer clears |
| X9 | **The MCP consent dialog gains one line, only for a host CarlNotes does not know**, naming the host the answer returns to | Nothing for a known AI app or a client on the person's own device. One warning line for any other host. The request says Parts A, B, and D change no copy | Add it (finding S10, in `launch-hardening-safety`), kept light by the owner on 2026-11-13: anyone can register a client named "Claude" today |

Three more switches change what a person gets while they are on. Each is off by default and lives only in the
Launch runbook: "the home shows pinned items only" (finding S4), the unverified accounts switch extended to chat,
voice, and manual Scans (finding S9), and the two pause switches for new podcast episodes and new films (item 21).

### Every finding from the closing read

Four read-only passes read the whole system for what no item covers: operations (O), the worker and the data (W),
the api process (P), and abuse and cost (S). The evidence for each is in appendix A.25 to A.28. The research on each
item also found things outside it, listed last (R). "Task" names the change and the task group that holds it, marked
as a finding there.

| # | Finding | Severity | Recommendation | Where it went |
|---|---|---|---|---|
| S1 | A 9.5 MB workbook takes a process from 54 MB to 1.5 GB, and one upload kills a worker replica three times; a small PNG avatar decodes to 582 MB in a share card | critical | Stream the workbook, check a zip's declared unpacked size, extract in a memory-limited child process, check and resize avatars before drawing, and put the upload behind the tool caller limiter | safety, group 5 |
| O1 | Threshold warnings and repeated errors notify nobody under the documented alerts | critical | Three Sentry rules recorded in the guide, an `error-loop` crossing, and `GLOBAL_DAILY_SPEND_ALERT_USD` documented | code: this change, group 13. docs: safety, group 1 |
| O2 | Scan capacity is fixed and no item scales it | critical | Scale the main worker on the scan backlog and measure more slots | this change, group 12 (X3) |
| W1 | The cutoffs at their defaults hold the wave's own first Scans | critical | A pre-wave runbook step | safety, group 1 (X1) |
| W2 | A person's Scan waits behind scheduled Scans on one queue, twice | high | Scheduled Scans on `topic-scans-scheduled` with their own Worker | this change, group 12 |
| W3 | A podcast episode fails for good after a half-minute model rate limit | high | A backoff and a schedule-to-close on the script and standard chapter activities | this change, group 12 |
| W4 | A Firecrawl rate limit scores the snippet instead, and that verdict stays | high | Retry a 429 and a 5xx, tell a spent credit apart, and leave the reviewed hash unset after a failed fetch | this change, group 12 |
| W5 | A deploy mid-review ends the Scan as succeeded with part of its pages and no recap | high | Throw on a worker shutdown so the review retries and resumes; three attempts | this change, group 5 |
| O3 | The api has no shutdown handling, so a deploy cuts every stream | high | Drain on SIGTERM: fail readiness, finish requests, end streams, flush | this change, group 13 |
| O4 | The origin answers at a hostname the public repo publishes | high | Yours: an IP policy in Northflank. The hostname is left out of every new file | safety, group 1 (owner check) |
| O5 | Rollback has no runbook, and a worker rolled back past a `patched` change strands its workflows | high | A Rollback section, a deploy freeze, and a test that fails a renaming or dropping migration | safety, group 1 |
| O6 | The sweep has no heartbeat, one failed stage skips the rest, and its throttles reset every run | high | A finish time the worker checks, a try around each stage, and a Redis slot per warning | this change, group 3 |
| O7 | `/api/home` is not cached at the edge, and every new shared path inherits the gap | high | Record Cloudflare's rule in the guide, list each new path as a manual step, and add a script that fails on `DYNAMIC` | page-reads, group 7 |
| P1 | A signed-in browser's image, avatar, favicon, and cover reads all skip the edge | high | A Cloudflare rule for the versioned public file paths whatever the cookie, a check, and the image prefixes routed to `web` | rule and check: page-reads, group 7. routes: this change, group 4 |
| P2 | Podcast covers are drawn on the request path, one at a time, with memory that is not returned | high | Draw once for both sizes in a recycled worker thread, and have the worker's image step store both | this change, group 13 |
| P3 | Every process takes an equal share of the pool | high | Shares by role | this change, group 4 (X4) |
| S2 | The client address trusts Cloudflare's Workers range | high, unverified | Resolve the client from `cf-connecting-ip` behind a trusted Cloudflare hop, with a live Worker probe | page-reads, group 1 |
| S3 | Four paid calls have no budget gate and no spend row | high | Record each as spend, check the budget, use the tool caller limiter, and keep a moderation verdict by text hash | this change, group 9 |
| S4 | The public home fills from any brand-new account's public Topic | high | An admin block takes the person's items off the home, and a "pinned only" runbook switch | safety, group 5 |
| S5 | Cards, covers, favicons, the sitemap, llms.txt, and feeds sit outside every origin cache | high | `cacheJson` for the documents and each card's lookup, and a redirect of any other query string to the versioned url. No new limiter | page-reads, group 7 |
| W6 | The sweep reads every due Topic and owner's limits each minute, in no order | medium | Oldest first, a page at a time, with the key budget cached | this change, group 12 |
| W7 | A Scan carries every Resource through its workflow history three times | medium | Ingest returns the url, the Source, and two flags; a stored snippet gets a length limit | this change, group 12 |
| W8 | The review's duplicate check reads every Topic's Resources | medium | Compare only with pages this Topic has judged (close: it raises a new Topic's scoring spend a little) | this change, group 11 |
| W10, O11, P5, S8 | An account email is sent once with no retry | medium | Send through the retrying call with a slot of its own, and give the Turnstile check a timeout | safety, group 5 |
| O8 | A shed render is uncounted and shows a bare line of text | medium | Count renders and sheds in the minute line, and serve a small page that retries | this change, group 13 |
| O9 | The worker's grace rests on a platform setting the repo does not record | medium | Yours: the termination grace. Recorded in the guide's service table | safety, group 1 (owner check) |
| O10, O12, S15 | Sentry, PostHog, Langfuse, Redis, LiteLLM, Temporal, Neon, and provider quotas are unrecorded | medium | A service table and a quota list in the runbook, and the dev LiteLLM image brought to production's version | safety, group 1 |
| P4, S11 | A chat post holds up to 26 MB for the whole reply, read before the budget check | medium | Authorize before the body is read, and admit large bodies by bytes in progress | safety, group 5 |
| P6 | The search bar waits on an embedding call that may run 360 seconds | medium | A two-second limit, then the text matches; a chat turn sends its headers before retrieval | page-reads, group 7 |
| P7 | The sitemap and llms.txt read everything on each request | medium | With S5 | page-reads, group 7 |
| P8 | Callers with no token share 30 MCP requests a minute, handshake included | medium | Count protocol messages apart from tool calls | page-reads, group 7 |
| S7 | An unverified account sends verification mail to any address, 18 a minute | medium | Count change-email by user | safety, group 5 |
| S9 | About 75 unverified accounts can spend the chat cutoff for everyone | medium | A runbook switch, off by default (yours to reach for) | safety, group 1 |
| S10 | The MCP consent names only the name a client gave itself | medium | Show the redirect host if CarlNotes does not know it (X9) | safety, group 5 |
| S6 | Text moderation fails open, reads a note's first 8,000 characters, and has no spam category | medium | **Not added.** An unchecked state for text touches every comment, post, name, and tag read, and needs a design of its own. The runbook names it | not added |
| W9 | `resources` grows by 13 KB a row and nothing deletes a row | medium | **Not added.** Nothing breaks in the first weeks. This change keeps a filtered Finding's Resource, so a later cleanup has its rule | not added |
| O13 | An edge purge has no retry, and its report holds the tag | low | Retry once on a 429, and a fixed message | page-reads, group 7 |
| O15 | Six click ids are missing, and a missing asset costs a render | low | Add the ids, and a plain 404 under `/assets/` | page-reads, group 7 |
| P12 | The Turnstile check has no timeout | low | With the email task | safety, group 5 |
| S12 | Each search query stores a 20 KB vector for a day | low | An hour, in a compact form | page-reads, group 7 |
| S14 | "vienna" is not reserved | low | Reserve it and the staff words | safety, group 5 |
| O14 | No status page, and the docs' Get the app page holds a placeholder | low | Yours to decide | safety, group 1 (owner check) |
| W11, W12, W13, P9, P10, P11, P13, S13 | The nightly Dashboard build is sequential; LiteLLM keeps every spend row; 33 foreign keys lead no index; one thread reads attached files; a room stream polls its access; the Topic Post search scans every body; a share card's key holds its counts; registered clients are never pruned | low | **Not added.** None bears on the wave's first days. Each is named in its appendix with the reading that would raise it | not added |
| R1 | A failed duplicate render can delete a playing film's files | high | A queued film gets its row at once, and the backfill renders by child workflow under the film's id | this change, groups 8 and 9 |
| R2 | A deploy may hard-kill activities at Northflank's 30-second default | high | Yours: the grace period (O9). Stored shots and uncounted interrupted attempts make a kill cheap | this change, group 8 |
| R3 | 16 audio joins can run at once on 2 vCPU | medium to high | The encode on a queue of its own with slots equal to the cores | this change, group 12 |
| R4 | The chapter activity pays for speech again on its own retry | medium | Check for the stored chapter first | this change, group 10 |
| R5 | Podcast, discussion, and image activities have no heartbeat | low | A heartbeat on the encode and the discussion's recording, with item ten's fix | this change, group 10 |
| R6 | A failed discussion is not reported | low | Report it | this change, group 6 |
| R7 | Pending topic image renders and pending attachments are never closed out | low | The close-out covers both | this change, group 6 |
| R8 | A failed first render is never rendered again | medium | The close-out's restart covers a row stuck at rendering. Rows already failed are listed once by the backfill | this change, group 9 |
| R9 | `GET /api/activity` on one's own profile runs 30 queries in 16 sequential stages | high | The page read returns the person's topic rows, and the activity loader runs its reads together | page-reads, group 3 |
| R10 | One page read can hold most of a replica's pool | high | Each page read's widest stage is held under a bound, beside its query budget | page-reads, group 3 |
| R11 | A topic made private stays public at the edge for up to two minutes | medium | A per-topic page tag, purged on a visibility change and a delete | page-reads, group 2 |
| R12 | A signed-in viewer's scan poll never hits its cache: about 2,000 queries a second for 200 viewers of one Scan | high | A scan status read beside the film's and the discussion's | page-reads, group 6 |
| R13 | The Topics feed reads every succeeded scan with its summary for every listed topic | high | A lateral `limit 1` | page-reads, group 4 |
| R14 | The Topic Post counts read and view POST select the whole body | medium | The narrow access row | page-reads, group 3 |
| R15 | The topic page's largest paint on a phone is the film player's poster | high for item 19 | The poster gets a sized source and the priority, and leaves the animation | browser-load, group 2 |
| R16 | Avatars are stored as sent, up to 2 MB, and shown at 64 px | medium | Resized on upload, with S1's pixel check | safety, group 5 |
| R17 | `/carl-hero.png` is 305 KB, shown at 112 px on a phone | medium | A webp at two widths | browser-load, group 4 |
| R18 | The badge poll's query cost barely drops with one route | medium | Cache the note badges and the invitations per user, cleared on each write | browser-load, group 1 |
| R19 | A private topic's unchecked image becomes public unchecked | medium | An `unchecked_images` row for it too, checked in the background (close) | safety, group 2 |
| R20 | A Dependabot bump of a patched package drops its patch; `.bun-version` and the Dockerfile disagree | medium | Ignore entries for the four patched packages, and two preflight checks | safety, group 3 |
| R21 | While Redis is unreachable a publish empties its owner's Dashboards, and related reads recompute an 8-second centroid | medium | Keep the old snapshots until a rebuild has new ones, and an in-process copy of the centroid | safety, group 4 |
| R22 | Server-rendered visitor searches share one embedding bucket | low to medium | Skip the count for a request the search limiter skips | page-reads, group 1 |
| R23 | A generated image is never image-checked | medium-low | **Not added.** The image model's own filter guards it, and failing a render while moderation is down would cost a Topic its image. Named in the runbook | not added |
| R24 | A sign-out during a Redis outage can leave the session usable for up to a day | low to medium | **Not added.** Unverified by test, and it needs Redis to return with its data. Named in Recovery | not added |

### Claims under "What exists" that the code no longer matches

Each is evidenced in the appendix section named. "Did" says what the design does about it.

| Item | The request says | The code says | Did |
|---|---|---|---|
| all | Every new index is built concurrently, as migration 0119 does | 0119 runs no `CREATE INDEX CONCURRENTLY`. Every pending migration runs in one transaction, so it sets a 3-second lock timeout and uses `IF NOT EXISTS`, which skips an index built concurrently by hand before the deploy. No doc describes the by-hand build (A.1) | Every index task has two steps: the by-hand concurrent build, then the migration in 0119's shape. The deployment guide gains the procedure |
| all | Version every workflow change with `patched`, as `runTopicScan.ts` does | Its patches guard new child workflow starts. Activity options, a queue among them, are safe to change without one, and the scan-closing queue shipped with none (A.2) | `patched` is kept wherever a command changes or a queue moves, and left out for an option change. Each task says which |
| 1 | `publishPodcastEpisode` already rejects a podcast episode that is no longer recording | The check is a read before the transaction; the publishing update has no status predicate (A.1) | The predicate is added |
| 1, 6 | A limit derived from the workflow's timeouts is the longest time it can legitimately take | Only the flex chapter bounds its queue wait, so a healthy workflow on a backed-up queue can be older than the sum (A.1) | The close-out asks Temporal whether the workflow still runs before it acts |
| 2 | The scan-closing writes have their own concurrency setting | It is a constant 8 (A.2) | The new queue's setting follows `PODCAST_RECORDING_CONCURRENCY` |
| 3 | A daily count batch that keeps failing is not reported | Every failed batch is reported on every sweep. A count of repeats and two silent paths are missing (A.1) | The task adds the repeat count and the two reports |
| 4 | `app` runs two instances with no autoscaling, and the pool count goes from 8 to 11 | `app` autoscales 2 to 4, and production already sets the count to 10 (A.4) | The pool decision starts from production's numbers |
| 4 | `API_ORIGIN` is read in `router.tsx` | The server base url lives in `apps/web/src/lib/webApiClient.ts:12` (A.4) | Read there |
| 4 | The split's routing table | No `card.png` route exists, the Topic Post preview is missing, and `/api/podcast-feeds` holds only the route that counts a play (A.4) | The table is corrected, and that prefix stays on `app` |
| 5 | A restart mid-review waits out a heartbeat timeout | True for a hard kill. A graceful stop past its two-minute grace ends the Scan as succeeded with part of its pages (A.26) | The behavior is fixed, then the README states the fixed behavior |
| 6 | A film stuck at rendering is re-read every 30 seconds for good | The poll pauses in a hidden tab and stops after four hours a page view (A.1) | Nothing to do |
| 7 | Stills are up to 2560 by 1440 | Every still is composed at 5120 by 2880, four times the film (A.7) | Smaller stills were measured (A.8). The still stays for launch, because a change means re-rendering every film |
| 7 | A film is a join and a mux | Three joins, a mux, and a pause detection pass over the audio, together 2.4% of a film's CPU (A.8) | Nothing to do |
| 7 | Bounding the lower third input cut CPU from 38.1 to 25.1 seconds | It still does on a 60-second segment (36.8 to 24.7), but since the montage the lower third is fed only to shots that start before a segment's eighth second, so a film saves about 20 of 770 CPU seconds (A.7, A.8) | Kept: it is free and changes no pixel |
| 8 | A first render or a re-render can be rendered again by a version bump | A failed first render is never listed again at any version (A.7) | Finding R8 |
| 8 | The backfill logs its remaining podcast episodes | It counts the current page's Topics, at most 100 (A.7) | The task counts every Topic |
| 9 | Two places skip the platform's cost | Three: the film's own image too (A.7) | All three record it |
| 10 | A push recipient's badge count is five queries | 3 on no team, 7 or 8 for a team member (A.2) | The grouped read replaces all of them |
| 10 | Each sum's table may have an index on its time column | None of the seven, nor `users`, has one led by it (A.2) | Eight indexes |
| 10 | Podcast chapters store their audio first | Between activities only; the chapter's own retry pays again (A.2) | Finding R4 |
| 11 | `filterTopicFindings` closes every Scan | A review stopped before its paid stage returns without filtering (A.11) | The filtered rows are written only where the filter runs |
| 11 | Topic Specials reads a removed Finding's daily view counts by item | Through an inner join on `findings`, so they already drop out (A.11) | Nothing to build beyond not deleting them |
| 11 | The Topic page shows a missing-recap placeholder | Only the Brew diary's popover does; the notes card shows no note (A.11) | X5 |
| 12 | The skip rests on the render arriving from localhost | It rests on no session and no external forwarded address. Nothing reads the peer address (A.4) | The rule is kept, with tests for the private-network shape |
| 13 | The profile has no cache | Its news is cached 60 s, its rendered page is at the edge 60 s, and its counts 30 s (A.13) | The cache covers the profile read itself |
| 13 | The topic page arrives in one read, and its cache is cleared by the writes that change it | The head is a second, uncached request, and no worker write clears the page (A.13) | The head joins the page read, and the pipeline's writes clear by topic |
| 13, 19 | A Topic Post body image is a row with a width and height | The ids, width, and height live in the body's `<img>` tags (A.13) | "Read with the post" is already true |
| 14 | A podcast episode page is 26 queries; row 63 added queries | 27; row 63 added none to the profile, team page, or home (A.13) | Budgets start from the measured counts |
| 15 | Leave a post's body out of every list read | Done since November 10 (A.15) | Dropped as a task |
| 15 | Your Topics' paging loads the next page ahead | It loads a page when it is opened (A.15) | The early load is new work |
| 17 | The topic page's film section polls while a newer film renders | It shows a filming line and runs no poll (A.17) | The status poll covers the newer film |
| 17 | The film, discussion, and scan polls do not pause in a hidden tab | They do. The web's `?episode=` poll and the image render poll do not (A.17) | Those two are moved |
| 19 | A signed-in home shows visitor cards; the Topic Post swap moves the discussion card | It shows skeletons and the visitor's "How it works" steps; only the comments move (A.19) | The fix targets what flashes |
| 20 | `EditTopicModal` is in four page chunks; the word cloud is an ECharts extension; the summary contract is in `podcastEpisodes.ts` | It is in the layout, so on every page; it is the app's own svg; it is `packages/contracts/podcast.ts` (A.19) | Corrected in the tasks |
| 21 | Every switch is off by default; `PODCAST_SPEECH_MODEL` empty stops recording; the film backfill concurrency and the scan dispatch limit are switches | The cutoffs are on; an empty model also hides every published podcast episode and 404s the feeds; both read 0 as their default (A.21) | X1, a pause switch on the Limits card, and readers that take 0 |
| 22 | The console removes five kinds; chat images are public | Seven kinds; no chat image is public (A.22) | Chat images keep today's behavior |
| 24 | Redis loss drops buffered counts and nothing else; every use degrades without failing a request; a Temporal schedule may need recreating | It also drops the day's view claims, day-long counts, sign-up tokens in progress, the day's opener, and open reservations; an account close answers 503 and the Dashboard build fails; no schedule exists (A.21) | Recovery states each |

## Context

See proposal.md for why. What shapes the approach:

- One worker process hosts 14 Temporal Workers and 88 activity slots a replica, on two replicas of 2 vCPU and 4 GB.
  One api process serves pages, files, chat streams, and the MCP server, on 2 to 4 replicas. A cron runs one sweep
  per run in a fresh process, so nothing the sweep remembers in memory survives to the next run.
- Workflows are running across every deploy: a film render runs up to four hours an attempt, a scheduled podcast
  episode up to eight hours, and the film backfill for days. A worker rolled back past a `patched` change strands
  the workflows that recorded its marker.
- Every count and measurement was taken on 2026-11-13 at `32d3dded`, read-only, and is in the appendix. Production
  facts came from the Northflank CLI, 24 hours of gauge lines, and header-only GETs.
- This change folds in the unapplied `split-web-from-api` change, whose folder is removed. Its design is carried in
  D1 to D3 and the migration plan, its measurement appendix in A.4, its tasks in task group 4, and its five delta
  specs in this change's `specs/`, each corrected against today's code.

## Goals / Non-Goals

**Goals:**

- No row is left in progress for good: a podcast episode, a film, a Topic Post Discussion, a topic image render, and
  an attachment are each started again once or closed out.
- A person's Scan, podcast episode, and film never wait behind the platform's own scheduled or backfill work.
- Films, scans, and page renders each scale out with their own backlog, on services that do not share a process
  with a chat stream.
- A deploy during the wave costs a stream a reconnect and a render at most one shot.
- A Scan pays to score a page once.

**Non-Goals:**

- Changing a spend cutoff or adding a spend limit. The cutoffs' launch-day values are a runbook step (X1).
- Removing the page routes from the `app` service after the web service takes them. They stay, so a rollback is one
  routing change.
- A cleanup of `resources` (W9), a per-Topic limit on anything, or a new limit on what a person may start.
- Temporal task priority. The production server's version is not recorded, so nothing here rests on it.

## Decisions

Each decision gives what was chosen, why, and what was rejected. "Close" marks the few where I was torn, with what
would tip it.

### D1. The web service starts the api's own entry under a second name

- **Chose:** `bun run web` starts `apps/api/index.ts` with the process name `web`. Both services serve every path.
- **Why:** a pages package would move 105 of the api's 321 modules, `authorization.ts`, the invite emails, and the
  topic save path among them, and the runtime image holds no `apps/web` source. With one entry the readiness render,
  the fail-fast boot, the image smoke, and every page test come along unchanged, and a mis-routed path still reaches
  a process that serves it.
- **Rejected:** `packages/pages` with `apps/web/server.ts`. It buys a smaller process and nothing else, as the largest
  file move in the repo made days before launch.
- **The routes**, corrected from the split design (A.4): to `web` the preview images (the Topic Post's added), the
  podcast covers, favicons, avatars, team avatars, the stored images, and one exact route for `/api/health/ready`, so
  the external monitor watches the service that renders pages; to `app` the prefixes `/api`, `/mcp`, and the two
  oauth well-known paths; the base path to `web`. `/api/podcast-feeds` stays on `app`, because its one route counts
  a play with its place.

### D2. A web render reads its own `/api`, and `API_ORIGIN` ships unset

- **Chose:** `API_ORIGIN` is read in `apps/web/src/lib/webApiClient.ts` with today's loopback default, and the web
  service starts with it unset, so a render reads the web process's own api. **This departs from the request**, which
  has renders call the `app` service over the private network.
- **Why:** with the second process name the web service is a full api. Reading itself moves the page reads' queries
  and JSON work off the event loop that holds the chat streams, where reading `app` would leave them there. It also
  avoids contract skew: the web parses responses strictly, so between `deploy-app` and the end of `deploy-web` an old
  render reading a new api can turn a page into a 503 on every release. And a render no longer fails while `app`
  rolls. The browser's own `/api` reads still go to `app` by path, and both services share one Redis, so the caches
  and limits hold across them.
- **Rejected:** `API_ORIGIN` set to `app` from the start. To try it, set it in the web service's own Northflank
  variables, never in Doppler, where `app` would read it and call itself over the network. The after-measurement is
  taken both ways, and the reading decides.

### D3. Web replicas, and pools sized by shares (close)

- **Chose:** the web service runs 2 to 4 replicas on `nf-compute-100-2`, scaling on cpu at 70%, the shape `app`
  already has. A process's pool is its shares of the pooler's server pool: the api, the web service, the sweep, the
  reset, and a film replica take one share, and the worker's main role takes two. The default pool count in
  `packages/db/index.ts` becomes 14 shares at rest (two api, two web, two main workers at two each, one film
  replica, the sweep, the reset, three for overlap and jobs). Production's `DATABASE_POOL_COUNT` is the sum at every
  service's maximum: 25 with app 4, web 4, main worker 4, film 4.
- **Why:** an equal split fails the check the request asked for. At 901 connections and every service at its maximum
  a share is 35 to 42, and a worker replica already peaks at 78 open with 46 in use, while an `app` replica peaks at
  28. Two shares for the worker give it 64 at 901 and 128 once the Neon compute's maximum is raised to 4 CU (X4).
- **Rejected:** the split design's count of 11 (written before `app` autoscaled and before a film service), and a
  fixed `DATABASE_POOL_MAX` per service, which the count's formula cannot subtract.
- **What would tip it:** if you would sooner raise the Neon compute further and keep equal shares, the count is the
  only thing that changes, and the shares come out.

### D4. A close-out asks Temporal first, starts the work again once, then fails it

- **Chose:** one sweep module closes out five kinds of row: a podcast episode at `recording`, a film at `rendering`,
  a Topic Post Discussion at `recording`, a topic image render at `pending`, and an attachment at `pending`. Each
  limit is its workflow's longest run plus the 15-minute margin `failStaleScans` uses, derived in
  `packages/pipeline/stageTimeouts.ts`, where the workflows' timeouts move so both sides read one copy. Past the
  limit the sweep asks Temporal whether the row's workflow still runs. If it is gone, the sweep starts the work again
  once on the same row and records `restarted_at`; a row already restarted is failed. If it still runs, the row is
  left and reported. A day past the limit a running workflow is terminated and the row failed.
- **Why:** the limits are sums of run times and no workflow here bounds its wait for a slot, so a healthy workflow on
  a backed-up queue can be older than its limit, and failing it would be a skipped job. Asking Temporal costs
  nothing on a normal sweep, because few rows are ever past a limit. A restart keeps the promise that every person
  gets their podcast episode and film: a new Topic's first podcast episode is the one a lost workflow would
  otherwise cost. The restart reuses what is stored: the saved script, each stored chapter, each stored shot.
- **Rejected:** failing every row at its limit (fails healthy work in a backlog), a schedule-to-close on every
  activity (turns a backlog into failures), `failed_render_version` as the restart mark (it already means something
  else), and a new discussion row for a restart (it would count twice against the starter's month).
- **The close-out never cancels a workflow at the first limit.** It terminates only at the second, where a live
  workflow would otherwise keep paying for speech on a row already failed.
- **A restarted film bills the platform if its row's cost is zero**, which is how a backfill's first render reads, and
  the owner otherwise.

### D5. Scheduled chapters record on `episode-scheduled-chapters`, 32 slots a replica

- **Chose:** the queue `episode-scheduled-chapters`, an activities-only Worker, and the setting
  `PODCAST_SCHEDULED_CHAPTER_CONCURRENCY`, default 32, read like `PODCAST_RECORDING_CONCURRENCY`. The move sits behind
  `patched("scheduled-chapter-queue")`, and the queue's backlog is gauged.
- **Why:** capacity must not shrink, and flex chapters can take all 16 recording slots today. A flex slot holds an
  open request and about 30 MB, so 32 is cheap, and 64 slots on two replicas reach 9,216 chapters a day at ten
  minutes each, the size at which the provider's 10,000 a day becomes the limit (X2).
- **Rejected:** 16 (today's limit exactly), a queue named for the flex tier (the tier is a consequence of the
  trigger), and no patch (Temporal allows it, but two lines make a replayed history schedule where it recorded).

### D6. Films run as the worker's `films` role, on a service that scales on film demand (close)

- **Chose:** the setting `WORKER_ROLE` takes `films`, `main`, or nothing for every Worker, set by the root scripts
  `temporal:films` and `temporal:main` after `doppler run --`, because a Doppler value would win over the
  service's own. The film service runs on `nf-compute-200` (2 vCPU, 4 GB) with one live slot, one backfill slot, and
  one rebuild slot a replica. Every ffmpeg thread count is set to 2: each input, the filter graph, and the encoder.
  The lower third's input is bounded. The service scales from 1 to 4 replicas on a gauge the worker serves at a
  Prometheus endpoint: its running renders plus the film queue's backlog divided by the queue's pollers, with the
  threshold at one replica's live slot.
- **Why:** measured (A.8), one render is two cores wide and peaks at 1.14 GB with the thread counts at 2, and two at
  once at 1.68 GB, 42% of 4 GB. With no thread count set, a render's memory follows the node's cores: one run
  measured 538 MB as on 10 cores and 1,066 MB as on 32. The bounded lower third saves 27% of a chapter's second
  shot with identical frames. An encode then never shares a process with a scan, and an out-of-memory kill ends
  films alone.
- **The still stays at 5120 by 2880 for launch.** A 2560 still enlarged inside ffmpeg keeps today's smoothness for
  13% less CPU, but any change to the still changes every frame, which means a render version bump and a re-render
  of every film on the platform's bill. The frames and clips to judge it by eye are in
  `logs/launch-hardening/research/film/`.
- **Capacity, and what is yours:** one replica finishes about eight short films or three and a half full films an
  hour (an estimate: a Northflank vCPU was not measured). Four replicas are about 34 short films an hour. A day of
  3,000 new podcast episodes needs about 16. The maximum is a cost you set, with `DATABASE_POOL_COUNT` raised to
  match, and the runbook's first step for a film backlog is to pause the backfill, which costs nobody anything.
- **Rejected:** 2 GB (a second render does not fit), more live slots on a larger replica (the same cost a slot, and
  one kill then ends two renders), a second entry file (it copies the start, the gauges, and the shutdown), and a
  memory threshold for scaling.
- **What would tip it:** Northflank's custom metric autoscaling is unverified on this plan. If it is not available,
  scale on cpu at 70%, which needs no endpoint and climbs a step at a time. And if a backfill render must never
  slow a live one on the same replica, use `nf-compute-400` with the same slots.

### D7. A new film goes ahead of the backfill by queue, by a wait, and by a row written at once

- **Chose:** the two queues that exist stay. Before each render the backfill reads the live queue and waits while it
  has a backlog. The film workflow's first activity, on the short-write queue, writes the `rendering` row, so a
  queued film shows its card, starts its poll, is visible to the close-out, and is never listed by the backfill.
  Each backfill render runs as a child workflow under the film's own workflow id, so Temporal rejects a duplicate.
- **Why:** it holds on any Temporal server and is testable in the time-skipping server. The row at queue time also
  closes the case where two renders of one podcast episode write the same files and the one that fails deletes the
  files the other plays (R1).
- **Rejected:** priority keys on one queue. They would use every slot for new films first, but they rest on a
  production server version the repo does not record.

### D8. A film's encoded shots are stored, and an interrupted attempt is not counted

- **Chose:** each encoded shot is stored under the render version, keyed by a hash of its ffmpeg arguments with each
  still's content hash in place of its path, with a deletion date past the render's last attempt. A retry lists the
  prefix once and skips what is stored. Shots are deleted on success, on a final failure, and on a removal. An
  attempt that a worker shutdown cancelled reports its own failure type, and the workflow schedules it again
  without counting it, behind `patched`. The heartbeat timeout drops from 10 minutes to 2. A render stops between
  shots if its podcast episode was removed, checked on the heartbeat timer.
- **Why:** a deploy, a scale-down, and a kill each interrupt a render that runs 30 to 90 minutes. With stored shots
  the cost of each is the shot in progress, which is what "the time a deploy needs" comes to. Without the uncounted
  attempt, three deploys fail a film for good.
- **Rejected:** counting interrupted attempts without limit (a film that kills its replica every time would loop, so
  a heartbeat timeout still counts), and a schedule-to-start limit (it would fail a queued film for good).

### D9. Spend that no user's existing row holds is recorded in one `spends` table

- **Chose:** a table `spends` with a kind, a nullable user, a nullable Topic and podcast episode, a cost, and a time.
  A row with no user is the platform's: a backfill's render minutes, its generated chapter images, the film's own
  image, and text moderation. A row with a user is that user's: a url attachment's fetch, a url Source's screen
  fetch, and a source suggestion's search (finding S3). `loadSpendSince` gains an eighth sum over it. With no user
  and no plan it sums every row, so the day's total and its alert see the platform's cost as `platformDollars`. With
  a user or the free plan it sums that user's or free users' rows, so a platform row can never reach a free-plan
  cutoff or an owner's budget.
- **Why:** each cost needs its own time to land in the right day, and the film sum filters on the film row's creation
  time, so a cost added today to last week's film would be outside today's total.
- **Rejected:** a column on the film row (it cannot be dated), and `topic_image_renders` with no user (no read
  changes, but it files render minutes as an image).

### D10. A filtered Finding leaves a row of its own, `filtered_findings`

- **Chose:** a table keyed by Topic and Resource that holds the two hashes the page was scored against, its score,
  its personal source bonus, and when it was filtered. The filter writes the row as it deletes the Finding. The
  selection skips a page whose row still holds: the same Topic context hash, the same content hash, a bonus at least
  this Scan's, and no rated chapter waiting. A url Source's own page is still read on every Scan. Open places are
  decided by the filter's own function: the Topic's Findings and the held rows of this Scan's rediscovered pages are
  ranked together, and a held row that ranks inside the limit goes back to the model, best first, one page per open
  place. A row is deleted when its page goes to the model, so a page judged again that ends with no Finding holds no
  place. A tie stays with the Finding the Topic keeps.
- **Why:** on dev's full Topics, 85% of the pages a later Scan scored were not kept, and the paid section was $38.74
  of $50.20 in 30 days (A.11). A column on the Finding would keep the row for 59 readers in 46 modules, of which 23
  filter hidden rows, and 8 tables point at it.
- **Rejected:** a column on the Finding, the name `finding_verdicts` (the code's own verb is "filter"), an expiry (a
  row is about 0.4 KB beside a 12.8 KB Resource that is never deleted), and counting open places as the limit less
  the Findings (it misses a kept Finding whose score fell below a removed page's).
- **With it (finding W8, close):** the duplicate check compares a page only with pages this Topic has judged, its
  Findings and its filtered rows, so one Topic never loses a story another stored first. It raises a new Topic's
  scoring spend a little. If that was meant to be site-wide, say so and the task comes out.

### D11. Scans get capacity: a queue for scheduled Scans, and a main worker that scales

- **Chose:** a scheduled Scan's workflow starts on `topic-scans-scheduled` with its own Worker and the setting
  `SCHEDULED_SCAN_CONCURRENCY`, default 8, so a first or manual Scan never waits behind scheduled ones. The main
  worker service scales from 2 to 4 replicas on scan demand, served at the same endpoint as D6. A task measures a
  replica at 16 and 24 scan slots and sets the default from it. The audio encode moves to `episode-encodes` with
  slots equal to the replica's cores (finding R3).
- **Why:** this is the request's own rule applied to the first thing every new person waits for (X3). A Scan's
  activities already run on its workflow's queue, so the workflow file does not change and a Scan running across
  the deploy finishes where it started.
- **Rejected:** Temporal task priority (D7), and a dispatch limit as the answer to a backlog.

### D12. A worker shutdown is told apart from a person's stop

- **Chose:** the review throws on a cancellation whose reason is the worker's shutdown, so Temporal retries it and
  it resumes after the pages already scored, and it gets three attempts. The podcast script and standard chapter
  activities take a backoff like the chapter's and a schedule-to-close of an hour in place of three and five quick
  attempts. The encode and the discussion's recording heartbeat.
- **Why:** today a deploy mid-review ends the Scan as succeeded with part of its pages and no recap (W5), and a
  half-minute model rate limit fails a podcast episode for good (W3). These are activity options and activity
  bodies, so none needs `patched`.
- **Rejected:** only correcting the README's sentence, which item five asks for and which would then describe a bug.

### D13. The sweep watches itself and reports across runs

- **Chose:** each stage of the sweep runs in its own try and reports its failure. The sweep saves its finish time
  to Redis, and the worker's minute line warns if it is older than forty minutes: production's sweep runs every 15
  minutes for at most 10, so two finishes are never more than 25 minutes apart. A warning or report from the sweep
  takes a one-hour Redis slot per condition first, and is sent anyway if Redis cannot say. A failed queue read is
  reported, and the scheduled starts stop at the first transport failure.
- **Why:** each sweep is a new process, so "once an hour" resets every run (a new warning for each condition on
  every run, four an hour in production),
  one thrown stage skips the daily counts and the emails, and nothing reports a sweep that stops running.
- **Rejected:** an external dead man's switch (a vendor to choose and a secret to hold, where the worker is already
  running and already reports).

### D14. A podcast cover is drawn off the request path

- **Chose:** the cover modules move beside `cardElementPng.ts` in `packages/pipeline`. A draw makes both sizes from
  one PNG, in a worker thread that is replaced every few draws, and the worker's podcast episode image step stores
  both sizes. The route keeps its draw as the fallback for a cover not stored yet, and the chain's length joins the
  minute line.
- **Why:** a draw stalls the event loop 170 to 300 ms and forty draws took a process to 1.8 GB that was not returned
  (P2). Path routing moves the route to the web service, which moves the stall onto page renders and removes
  nothing.
- **Rejected:** a new workflow activity for the draw (the image step already runs after the publish, so its body
  takes the work with no change to the workflow).

### D15. Every new index is built by hand first, then declared in a migration shaped like 0119

- **Chose:** each index task has two steps: `CREATE INDEX CONCURRENTLY IF NOT EXISTS` by hand in production with
  `statement_timeout` off and a check of `pg_index.indisvalid`, then a generated migration edited to open with the
  3-second lock timeout and to use `IF NOT EXISTS`. The deployment guide gains the procedure. A new table's indexes
  are created with the table and need neither step.
- **Why:** every pending migration runs in one transaction, where Postgres rejects a concurrent build, and the
  role's 30-second statement timeout cancels a long one.

## Risks / Trade-offs

- [A worker rolled back past a `patched` change strands the workflows that recorded its marker] → the Rollback
  section says to roll the worker forward, never back. Each queue this change adds needs a poller, so a rollback
  waits for those queues to drain.
- [`release-main.json` applied before the `web` or film service exists fails every release at that step] → the
  migration plan creates each service first.
- [The pool count is raised by hand, and a wrong value fails quietly: the pooler queues] → the runbook's step names
  the startup line that prints the size, and `pool.waitingCount` above zero is the reading for more connections.
- [The first sweep after the deploy restarts every row already stuck: 13 films in dev] → restarted films bill the
  platform if their cost is zero, and the count is logged.
- [A restarted podcast episode whose Scan email workflow is gone] → the task covers a recording started by the
  client and not as a Scan's child, with a test that a missing email workflow does not fail it.
- [The first Scan of each Topic after the deploy still scores its removed pages, because no filtered row exists yet]
  → the saving starts with the second Scan, and the verify step scans twice.
- [A stored shot is the same shot only if its inputs are] → the key is a hash of the arguments and each still's
  content, and a stored shot that fails to download counts as not stored.
- [Custom metric autoscaling is unverified on this plan] → cpu is the fallback, named in D6.
- [The film service's disk: one render holds a segment's stills, its shots, a part, the film, and the audio] → A.8
  records the temp folder's peak, and the service's disk is sized for slots times that.

## Migration Plan

1. Ship the code. Nothing changes in production yet: with no role set the worker hosts every Worker, the `app`
   service serves every path, and the new queues are polled by the worker that exists.
2. Build the new indexes by hand (D15), then let the release run its migration.
3. In Northflank, by hand: set each service's termination grace above the worker's two minutes; create the `web`
   service from the build image with `bun run web`, the health checks in `app-health-checks.json`, and autoscaling;
   create the film service with `bun run temporal:films`, its plan and disk from A.8, and its autoscaling.
4. Raise `DATABASE_POOL_COUNT` in Doppler prd to the sum of shares at every service's maximum, raise the Neon
   compute's maximum, and restart every process, because a pool is sized at boot.
5. Apply `release-main.json`, which now deploys `web` after `app` and the film service beside the worker.
6. Switch the worker service's command to `bun run temporal:main`, once the film service polls the film queues.
7. Add the path routes. Check a public page's second request is an edge hit, the chat stream and `/api` still bypass
   the cache, a forged forwarded header is still counted, and a view still records its place.
8. Rerun the render measurement and record both readings in A.4.

Rollback: point the base path back at `app` and remove the routes; set the worker's command back to
`bun run temporal` once the new queues have drained. The film service can stay or go.

## Open Questions

- **The production Temporal server's version.** Recorded nowhere. Nothing here depends on it. If it supports task
  priority, D7's wait and D11's second queue could later become priority keys.
- **Whether Northflank's custom metric autoscaling is on this plan.** D6 and D11 fall back to cpu if it is not.
- **Northflank's surge during a rollout.** The pool count allows three shares of overlap, as the split design did.

## Appendix A: counts and measurements, taken 2026-11-13 at 32d3dded

Each entry was written as it was taken, read-only. The research reports behind them, their scripts, the Lighthouse runs,
and the
film clips are in `logs/launch-hardening/research/` (gitignored, on the machine that ran them). They are summarized
here in full, so this appendix stands alone. Sections A.12, A.13, A.15, and A.17 are in
`launch-hardening-page-reads`' design, A.17 and A.19 in `launch-hardening-browser-load`'s, and A.21 and A.22 in
`launch-hardening-safety`'s.

### A.0 Row 63.5 is on main

`apps/api/topicPost/topicPostImagesRoute.ts:51` defines the body image upload path `/topic-posts/:id/body-images`, and
`apps/api/noteHtml.ts:89` admits `img` on a Topic Post's body. Commit 32d3dded shipped it. No task waits on row 63.5.

### A.1 Close-outs and the sweep's reports (items 1, 3, 5, 6), by reading and by counting dev rows

Two facts cut across every close-out:

1. **No workflow here bounds its queue waits.** Only the flex chapter has a schedule-to-close
   (`apps/worker/workflows/recordPodcastEpisode.ts:85-89`). Every other podcast, film, and discussion activity sets a
   start-to-close alone, and the child workflows have no workflow timeout. So "the longest time a workflow can
   legitimately take" is a sum of run times, and a wait for a worker slot comes on top with no limit. A row older than
   the sum can belong to a healthy workflow on a backed-up queue. The Scan differs: its ingest and review each have a
   one-day schedule-to-close (`runTopicScan.ts:47-61`), which is why `MAX_SCAN_DURATION_MS` is a true bound.
2. **Process state does not survive a production sweep.** Production runs one sweep per cron run in a fresh process
   (`README.md:75`, `package.json:117`), so the report limit of 10 an hour per key and the threshold's quiet hour
   (`packages/server/monitoring.ts:34-61`) never carry from one sweep to the next. "Report once" or "count repeats"
   needs Postgres or Redis.

Claims that no longer match the code:

- **Item 3: a failed daily count batch is already reported on every sweep**, in the `database` stage
  (`apps/worker/saveDailyCounts.ts:72`), since its first commit. What is missing is a count of repeats, and two
  silent paths: a take that finds Redis down returns with no report (`saveDailyCounts.ts:42-45`), and a put-back that
  fails loses the batch, because `runWithRedis` returns null instead of throwing (`packages/db/redis.ts:76-104`).
- **Item 5: only `README.md:216` holds the 30-minute claim.** No AGENTS file, docs page, or spec repeats it.
- **Item 6: the film poll already pauses in a hidden tab and stops after four hours** per page view
  (`packages/core/hooks/useTopicPodcastEpisodeVideoRenderingPoll.ts:7,10`, `packages/core/lib/limitedPoll.ts:16-32`).
- **Item 1, a gap in a true claim:** `publishPodcastEpisode` rejects a row that is no longer recording in a read
  before its transaction (`publishPodcastEpisode.ts:86-89`), but the publishing update has no status predicate
  (`:285-297`), so a close-out between the two is published over.
- **"Built concurrently, as migration 0119 does":** 0119 does not run `CREATE INDEX CONCURRENTLY`. Every pending
  migration runs in one transaction, so 0119 sets `SET LOCAL lock_timeout = '3s'` and uses `CREATE INDEX IF NOT
  EXISTS`, which skips an index built concurrently by hand before the deploy
  (`packages/db/migrations/0119_search_finding_indexes.sql:1-6`). That is the pattern every new index here follows.

The recording workflow's timeouts (`apps/worker/workflows/recordPodcastEpisode.ts:30-101`), default retry backoff 1 s
doubling:

| Activity | Per attempt | Attempts | Longest run |
|---|---|---|---|
| plan, save script, publish, fail, film switch read | 2 min | 3 | 0:06:03 |
| outline; script segments (in parallel) | 10 min | 3 | 0:30:03 each |
| chapter, standard tier (in parallel) | 4 min | 5, backoff 30 s doubling | 0:27:30 |
| chapter, flex tier, a scheduled Scan | 13 min | no limit, backoff 30 s to 15 min | 6:00:00 schedule-to-close |
| encode | 10 min | 3 | 0:30:03 |
| draw the image, after the publish | 3 min | 3, backoff 15 s, 30 s | 0:09:45 |

No activity in this workflow heartbeats. Longest path while the row is `recording`, with a slot granted at once:

```
plan 0:06:03 + outline 0:30:03 + segments 0:30:03 + save 0:06:03 + flex chapters 6:00:00
  + encode 0:30:03 + publish (fails) 0:06:03 + fail 0:06:03 = 7:54:21 from the workflow's start (28,461,000 ms)
```

The standard tier's path is 2:21:51. The film workflow: render 4 h x 3 attempts with a 10-minute heartbeat timeout,
then the mark 2 min x 3, so **12:06:06** from an attempt's first row write. The discussion workflow
(`recordTopicPostDiscussion.ts:9-37`): script 5 min x 2, audio 10 min x 3 with backoff 30 s and 60 s, fail 1 min x 3,
so **0:44:34** from the row's insert. The topic image render workflow: 0:27:51. The Scan close-out today:
48:21:00 picked up and 24:15:00 never picked up, with a 15-minute margin (`packages/pipeline/staleScans.ts:11-19`).

Rows in the dev database, 2026-11-13 11:56 UTC (selects only):

| Table | Rows | Stuck |
|---|---|---|
| `episodes` | 416: 340 published, 60 removed, 16 failed | 0 recording |
| `topic_podcast_episode_videos` | 79: 61 ready, 5 failed | **13 rendering**, last written 9.5 hours to 2 days 9 hours ago, each with `cost = 0` and an image, so all 13 are the backfill's |
| `topic_post_discussions` | 10, all published | 0 recording |
| `topic_image_renders` | 316 | **1 pending**, a `regenerate` 2 days 16 hours old |

Facts the design rests on:

- **The sweep's order** (`apps/worker/schedule.ts:42-87`), under the `scheduled-scan-sweep` lease: cutoff state,
  `reportScanQueue`, `startUndispatchedScans`, `failStaleScans()`, `screenPendingSources`, scheduled Topics, personal
  sources recovery. A stage that throws ends the leased task, and `runSweep` skips everything after it in that
  process (`schedule.ts:300-316`).
- **`packages/pipeline/stageTimeouts.ts` is already imported by workflow files and by the sweep.** It imports one
  value, `DAY_MS` from `@carlnotes/contracts/time`. A module both can import holds no `Bun` or `process` read, no
  Node built-in, no `@temporalio/client`, `worker`, or `activity`, and no `@carlnotes/db`, `server`, or `models`
  value import. The podcast workflow's timeouts are unexported constants in its workflow file today
  (`recordPodcastEpisode.ts:30-55`), the discussion's too, and the film's are exported from its workflow file.
- **`failPodcastEpisode({ podcastEpisodeId, reason })`** (`publishPodcastEpisode.ts:168-209`) sets `failed` only where
  the row is still `recording`, records the audio keys as pending deletions in the same transaction, deletes them,
  releases the shared Comments the script read, and reports in the `podcast-episode` stage. A second call writes
  nothing. It does not stop the workflow: no later activity reads the status, so a live workflow keeps paying for
  speech, uploads audio after the keys were deleted, and draws and bills an image for the failed podcast episode
  (`recordPodcastEpisode.ts:191`, `podcastEpisodeImage.ts:31-38`).
- **The recording workflow's id is `episode-<scanId>`**, built inline at `runTopicScan.ts:236`. A deleted Scan nulls
  `episodes.scan_id`, so such a row has no id to derive. No helper describes or cancels a workflow from the sweep;
  `cancelTopicScanWorkflow` (`packages/pipeline/scanWorkflowClient.ts:70-98`) is the shape to copy.
- **`loadPodcastEpisodeSpendSkipReason`** checks a recording short podcast episode first (`planPodcastEpisode.ts:193`),
  then
  the monthly cutoff (`:198`), then the daily cutoff (`:203-208`). Only a row with `is_short = true` blocks, and only
  a new short podcast episode. A stuck row also holds its shared Comments.
- **`episodes` has `created_at` and `updated_at` and no status time**, and no index includes `status`. The row is
  inserted as `recording`, so `created_at` is when the recording began.
- **The film row** has statuses `rendering`, `ready`, `failed`. No row exists until a film worker picks the activity
  up. Every attempt of a first render runs an upsert that sets `rendering` and moves `updated_at`
  (`topicPodcastEpisodeVideoRows.ts:72-80`). A re-render never writes `rendering`, so `status = 'rendering'` selects
  first renders and retries of failed rows, and the clock is `updated_at`. A first render that finishes sets `ready`
  with no status predicate (`:104-108`), so a late render heals a wrong close-out.
- **No client function starts the film render workflow.** It is started only by the recording workflow's `startChild`.
  The discussion has `startTopicPostDiscussionWorkflow({ discussionId, hint? })` (`temporalClient.ts:189-199`), which
  swallows an already-started error, so restarting a running workflow does nothing.
- **No existing column can record that a close-out restarted a row.** The film's `error` is cleared by the next
  attempt's upsert, and `failed_render_version` already means "this version's re-render failed for good".
- **The topic image render row** is inserted `pending` and `startTopicImageRender` awaits the start with no catch
  (`packages/pipeline/topicImages/topicImageRenders.ts:52-62`), for eight callers, the MCP `set_topic_image` tool
  among them. The month's limit counts every `regenerate` row whatever its status (`packages/db/quotas.ts:205-215`).
  `startTopicPostDiscussion` deletes its row on a failed start (`topicPostDiscussions.ts:71-77`).
- **A restarted film's bill.** The film workflow bills the owner and the backfill bills the platform. A
  platform-billed first render leaves `cost = 0` with an `image_hash`, as all 13 dev rows show.
- **A restart of a discussion reuses its row.** A new `regenerate` row would count twice against the starter's month.
- **What a restart mid-review does now.** A hard kill: the server fails the attempt for a missed heartbeat within two
  minutes, the review's second and last attempt starts a second later, resumes after the Resources already scored
  with the Budget the first attempt last heartbeated, and a second kill during it fails the Scan.
- **`reportScanQueue`** (`apps/worker/scanQueue.ts:145-172`) logs a failed read and returns null, and the worker's
  minute gauges swallow the same failed read (`apps/worker/temporal.ts:295-296`). Every Temporal client call has a
  10-second deadline. The production cron's interval is not in the repo.

Found outside the items:

- **Medium: a graceful worker stop can record a cut-short review as a succeeded Scan.** After the two-minute grace
  the SDK aborts each running activity's signal, the review reads that signal as the user's stop and returns what it
  has with an empty report (`runTopicScanActivities.ts:124,345-347`, `packages/pipeline/review/index.ts:50,125,211`),
  and the workflow, which was not cancelled, finishes the Scan. Every review still running two minutes after a
  deploy's SIGTERM, up to 8 a replica, ends as a succeeded Scan with part of its Resources scored and no recap.
- **Medium: each deploy uses one of a film's three attempts**, and three deploys fail a long film for good.
- **Low: podcast, discussion, and image activities have no heartbeat**, so a killed attempt waits out its whole
  timeout (10 minutes for a script, 4 or 13 for a chapter, 10 for an encode) before its retry.
- **Low: a failed discussion is not reported** (`topicPostDiscussions.ts:308-313`).
- **Low: a sweep that dies between the daily count take and its save loses that take**
  (`packages/db/dailyCountBuffer.ts:85-89`).
- **Low: `screenPendingSources` sends one workflow start per pending Source on every sweep**
  (`packages/pipeline/screen.ts:18-36`).

### A.2 The recording queue and the small worker fixes (items 2, 10), by reading, by dev rows, and one ffmpeg run

Claims that no longer match the code:

- **"Version with patched, as runTopicScan.ts does":** its three patches each guard a new child workflow start. The
  scan-closing queue itself shipped with no patch (commit `16f2f260` added `taskQueue` to the proxy and nothing
  else), and Temporal's docs list an activity's options among the changes that cause no non-determinism. This change
  still uses `patched` for the queue move: two lines make a replayed history schedule on the queue it recorded.
- **The scan-closing "concurrency setting" is a constant 8** (`apps/worker/temporal.ts:59-60`), not a setting.
- **A push recipient's badge count is 3 queries on no team and 7 or 8 for a team member**, never five
  (`packages/db/updateCounts.ts:30-86`, `packages/db/noteBadges.ts:21-185`). Five is the depth of the round trips.
- **None of the seven summed tables, nor `users`, has an index led by its time column.** Every index that includes the
  time column leads with another column (`scans.ts:87-88`, `chat.ts:77-79`, `podcast.ts:89`, `personalSources.ts:306`,
  `topicImages.ts:64-65`, `topicPosts.ts:93`), and `topic_podcast_episode_videos` and `users` have none on it.
- **"Podcast chapters store their audio first" holds between activities only.** The encode starts from the stored
  chapters, but the chapter activity never checks for a stored chapter, so its own retry pays for speech again
  (`packages/pipeline/podcast/podcastEpisodeAudio.ts:84-101`).
- **Caching the day's total "the same way" saves little:** the sweep is its only reader and runs once a minute, the
  cache's 60-second lifetime. The saving needs a longer lifetime for this one read.

Every task queue and Worker (`apps/worker/temporal.ts`), 88 activity slots a replica at the defaults:

| Queue | Runs | Slots | Setting |
|---|---|---|---|
| `personal-sources-email` | receive a Personal sources email | 4 | constant |
| `personal-sources` | summarize Personal sources context | 8 | `SCREEN_CONCURRENCY` |
| `attachment-processing` | process an attachment | 8 | `SCREEN_CONCURRENCY` |
| `topic-scans` | ingest and review | 8 | `SCAN_CONCURRENCY` |
| `scan-closing` | the closing writes, no workflow bundle | 8 | constant |
| `scan-emails` | the Scan email | 4 | constant |
| `push-notifications` | push sends | 4 | constant |
| `episode-recordings` | every recording and discussion activity | 16 | `PODCAST_RECORDING_CONCURRENCY`, 0 reads as 16 |
| `topic-images` | the image render and its backfill | 8 | `SCREEN_CONCURRENCY` |
| `topic-posts` | publish and summarize a Topic Post | 8 | `SCREEN_CONCURRENCY` |
| `source-screening` | screen a Source | 8 | `SCREEN_CONCURRENCY` |
| `dashboard-snapshots` | the nightly Dashboard build | 2 | constant |
| `episode-videos` | the film render and the rebuild | 1 | `TOPIC_PODCAST_EPISODE_VIDEO_CONCURRENCY`, 0 turns films off |
| `episode-video-backfill` | the film backfill and its renders | 1 | `TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_CONCURRENCY`, 0 reads as 1 |

Measured on the dev database, seconds from a podcast episode row's creation to its publish:

| What asked for the Scan | Length | Episodes | Chapters (mean) | p50 | p90 | max |
|---|---|---|---|---|---|---|
| scheduled (flex) | full | 260 | 13.6 | 723 s | 1,886 s | 2,785 s |
| scheduled (flex) | short | 21 | 4.5 | 508 s | 1,196 s | 1,396 s |
| manual (standard) | full | 51 | 12.5 | 188 s | 293 s | 548 s |
| creation (standard) | full | 6 | 13.2 | 192 s | 207 s | 212 s |

A scheduled full podcast episode takes 3.8 times as long as a manual one at the median. All of a podcast episode's
chapters are scheduled in one workflow task (`recordPodcastEpisode.ts:160-167`), so one scheduled full podcast
episode can take 15 of a replica's 16 slots.

Measured here, one run on an Apple M2 Pro: the join of 15 chapters, 40 minutes of 24 kHz mono audio, with the
loudness filter and the 64 kbps MP3 encode, took **50.6 seconds of wall time and 59.2 CPU seconds**. One join uses
about one core. The encode activity has 10 minutes, and 16 can run at once on a 2 vCPU replica.

Other numbers:

- Speech call timeout: standard 3 minutes, flex 12 minutes (`packages/models/speech.ts:41`). The flex activity attempt
  has 13 minutes and a six-hour schedule-to-close that counts the wait in the queue.
- Chapters: one per Finding, 15 at most for a full podcast episode and 5 for a short one
  (`packages/contracts/podcastEpisodes.ts:15-16`), each planned at 1 to 8 minutes.
- Speech provider allowance, from a comment (`.env.example:110-111`), not checked with Google: 1,000 requests a minute
  and **10,000 a day**, and each chapter, chapter retry, discussion, and spoken chat reply is one request. 10,000 is
  666 full or 2,000 short podcast episodes a day.
- A flex slot holds an open request while the provider finds capacity, then about 30 MB while the audio is decoded.
- Scans: `SCAN_DISPATCH_LIMIT` 100 a sweep (`apps/worker/scanQueue.ts:28-29`), 8 at a time a replica, a 244-second
  mean Scan (`.env.example:83-85`), so about **118 Scans an hour a replica**.
- Outline wait before the Scan email sends without a podcast episode section: 10 minutes
  (`apps/worker/workflows/sendScanEmail.ts:19`).
- Push: 100 messages a chunk, 5 recipients counted at once, so the worst chunk is 800 queries in 20 rounds before the
  first heartbeat (`packages/pipeline/pushDelivery.ts:124-126`) against a 30-second heartbeat timeout.
- The sweep runs 9 uncached reads for the day's spend (7 sums and 2 signup counts) beside the 7 cached free-plan
  sums (`apps/worker/dailySpend.ts:24-46`, `packages/db/dailySpendCutoffs.ts:172-225`).
- The notifications email sends at 15 UTC, and from then to midnight is up to 540 sweeps. Its recipients read joins
  every opted-in user to all of that user's send rows and filters on today in JavaScript
  (`apps/worker/notificationsEmails.ts:92-105`), then runs seven activity reads for each one without a row today.
- `runFfmpeg` takes `timeoutMs` (no limit by default) and `signal`, and kills with SIGKILL
  (`packages/models/ffmpeg.ts:9-36`). Three callers pass neither: the audio join, the discussion's join, and the
  podcast cover in the api (`apps/api/share/podcastCover.ts:215`). The server tells a worker about a timeout only in
  a heartbeat's reply, so the signal alone does not stop a timed-out encode: the timeout on `runFfmpeg` does.
- A Topic Post Discussion's WAV lives in memory from the speech call to the MP3's upload
  (`topicPostDiscussions.ts:191-253`), and a retry pays for the speech and adds the cost a second time.
- A generated chapter image is stored only if moderation passes, and a check that fails to run reads as "not
  allowed", so both are drawn again on every later render (`generatedChapterImages.ts:272-331`). The film image
  route serves whatever is at a chapter's key, so an unchecked image never goes under the served key.
- A drawn topic image is stored only after six resizes and seven uploads
  (`apps/worker/workflows/renderTopicImageActivities.ts:117-239`). The podcast episode's image and the film's own
  image share the paid call and the gap, through `renderTopicImageOriginal`.
- Drizzle sends `'running'` as a bound parameter, and the planner uses a partial index only if it can prove the
  predicate, so the sweep's filter writes the literal, as `isFindingShown` does (`packages/db/index.ts:110`).

Found outside the items:

- **High, if the comment is current: the speech provider's 10,000 requests a day.** Past it a standard chapter makes
  5 attempts over about 7.5 minutes and is left out, and a flex chapter retries for 6 hours and is left out. Podcast
  episodes publish with chapters missing, or fail if none recorded.
- **Medium to high: 16 audio joins can run at once on 2 vCPU.** Each needs about a core for a minute. Standard
  chapters finish within minutes of each other, so a burst of first podcast episodes reaches the encode together,
  and sixteen joins on two cores approach the 10-minute timeout.
- **Medium: a chapter backlog on the scheduled queue drops chapters after six hours with no gauge**
  (`recordPodcastEpisode.ts:85-89`, `publishPodcastEpisode.ts:99-106`).
- **Low:** the recipients read scans `users` once a sweep after 15:00 with no index on the switch.

### A.4 The web service and the server render's rate limits (items 4, 12), by reading, the Northflank CLI, and live probes

Production facts were read on 2026-11-13 through the Northflank CLI (field selection only, no secret printed), 24
hours of gauge lines, and six read-only GETs. The split design's `oha` burst was not run against production, because
it sheds real visitors' renders at the render limit; the apply runs it.

Claims that no longer match the code or production:

- **`app` already autoscales 2 to 4 replicas at 70% cpu** on `nf-compute-100-2`, and **production already sets
  `DATABASE_POOL_COUNT` to 10** (the startup line reads "81 connections from max_connections 901 and 10 pools"). The
  code default is still 8 (`packages/db/index.ts:48`). `temporal-worker` runs 2 instances on `nf-compute-200` with no
  autoscaling.
- **`API_ORIGIN` would be read in `apps/web/src/lib/webApiClient.ts:12`**, where the server base url literal
  `http://localhost:3000` lives. `router.tsx` only calls `configureWebApiClient()`.
- **Item 12's premise is wrong: the rate limit skip does not rest on localhost.** `isUncountedRequest`
  (`apps/api/rateLimit.ts:111-114`) tests for no session and no `x-forwarded-for` entry that resolves to an external
  address. Nothing in the api reads the socket's peer address. A private-network fetch sends no header either, so
  the skip holds from the web service unchanged, and no route needs `isReadByPageRenders` set.
- **The split design predates `/api/health/ready`**, which Northflank's readiness probe and the external monitor use.
  Four more `deploy-mechanics` requirements, the `edge-caching` purge requirement, and `request-capacity`'s
  page-render requirement name `app` or "loopback" and need deltas.
- **The pages package's import closure is 105 api modules of 321** (75 beyond its 30 seeds), up from about 70:
  `share/preview.ts` reaches the profile cards, the feed, the findings, and the topic save path, and
  `share/pageHead.ts` reaches the invite emails. The runtime image also holds no `apps/web` source
  (`Dockerfile:97-109`).
- **The design's routing table is stale.** No `card.png` route exists, `topic-posts/:id/preview.png` is missing from
  its regex, and `/api/podcast-feeds` holds only `GET /api/podcast-feeds/:token/episodes/:id/:file`
  (`apps/api/podcast/podcastFeeds.ts:130`), which counts a play with its place, so that prefix stays on `app`.
- **`countPodcastEpisodePlayRequest` lives in `apps/api/podcast/podcastEpisodeFiles.ts:56-78`.**
- **The uptime monitor polls `https://carlnotes.com/api/health/ready`** (`apps/docs/deployment.md:201-213`), which
  falls under the `/api` prefix and would land on `app` after routing, off the service that renders pages.

The passive baseline before the split, production `app`, 2026-11-12T12:00Z to 2026-11-13T11:55Z, 2,862 minute lines,
never more than 2 replicas, about nine rollouts:

| Reading | Value |
|---|---|
| Event loop p99 per minute | median 0 ms, p95 3 ms, **max 7 ms** |
| Largest single delay per minute | median 14 ms, p95 55 ms, max 2,113 ms (one minute) |
| Minutes with p99 over 100 ms | 0 |
| Open connections per `app` replica | median 0, p99 17, **max 28** of 81 |
| Open connections per worker replica (8.3 hours) | **max 78**, 46 in use at one sample, no waiting request |
| Minutes with a waiting request, minutes with Redis down | 0, 0 |

The active rerun for the before and after readings is the split appendix's two commands, `oha -n 120 -c 50 <page
url>` and `oha -z 62s -q 2 -c 16 <page url>`, against a public topic page through the service's own Northflank
hostname so the edge does not cache it, reading each replica's next minute line and its replica count. The
2026-10-22 run: a 2.2 s burst rendered 40, shed 78, with p99 3 ms and 2 ms; the steady run rendered 123 with p99 10
ms and 6 ms.

The split design's own measurements, carried over from its appendix (2026-10-22, production's `app` service, two
replicas, one address, through the service's own Northflank hostname so the edge did not cache the page, no chat
stream held open):

| Run | Responses | Event loop p99 | Largest delay |
|---|---|---|---|
| The prior 1,000 minute lines, about 8 hours | not a run | 17 ms at most, 0 ms median | 1,324 ms in one minute |
| `oha -n 120 -c 50`, a 2.2 s burst | 40 rendered, 78 shed at the render limit, 2 rate limited | 3 ms, 2 ms | 282 ms, 316 ms |
| `oha -z 62s -q 2 -c 16`, the per-address render limit for a minute | 123 rendered, 1 rate limited, 374 ms average | 10 ms, 6 ms | 40 ms, 32 ms |

Its load test baseline, from the archived apps-and-packages-restructure design: 77 requests a second and a p99 of
2.27 s on `/api/topic-feed`, measured 2026-10-21. The split change waited, unapplied, for render load to move the
event loop's p99 past its 100 ms warning. Neither its runs nor today's passive baseline came near it. This change
ships the split anyway, ahead of the wave, as the request asks.

Pool sizes at `max_connections` 901 with equal shares, `floor(0.9 x 901 / count)`:

| Count | Example | Pool size |
|---|---|---|
| 10 | production today | 81 |
| 12 | two each of app, web, worker, one film, the sweep, the reset, three overlap | 67 |
| 17 | app 4, web 4, worker 2, film 2 | 47 |
| 19 | app 4, web 4, worker 2, film 4 | 42 |
| 23 | app 4, web 4, worker 2, film 8 | 35 |

Facts the design rests on:

- **The entry** (`apps/api/index.ts`) mounts, in order: the three health routes, the version gate, favicons, the oauth
  discovery documents, the bot tracker, `/mcp`, the api tree (with the avatars, page heads, preview cards, podcast
  feeds and covers, and stored image routes inside it), the page guards, the release pages and the GitHub webhook,
  the blog, the documents, the docs build, the component browser, the ui's client files, and the page render. The
  render concurrency limit is a per-replica counter inside `renderUiPage` (`apps/api/uiServer.ts:99-123`).
- **Nothing has to be kept from running twice.** `app` already runs as 2 to 4 replicas: room streams fan out through
  Redis pub/sub, the MCP transport is stateless, the api runs no sweep, and every limit counts in Redis.
- **The process names itself with the literal `"api"`** (`index.ts:94`), typed `"api" | "worker"`
  (`packages/server/runtimeGauges.ts:22`), and the event loop warning fires for `"api"` alone (`:104-115`).
- **A server render sends no cookie, no `x-forwarded-for`, and no marker** (`webApiClient.ts:11-16`,
  `packages/client/apiClient.ts:216-231`), happens only without a session cookie (`_layout.tsx:10-12`), and reads
  **18 api routes**, each behind `apiRateLimiter` and four behind a limiter of their own, all of which skip it. One
  in-route counter does not: server-rendered visitor searches share one bucket of 20 query embeddings a minute
  (`apps/api/podcast/podcastEpisodeSearch.ts:35-36,234-241`).
- **The web app parses a response against its contract strictly** (`apiClient.ts:117-137`). A render that reads
  another service's api meets contract skew between `deploy-app` and the end of `deploy-web` on every release: a
  response that adds an enum value turns every affected page into a degraded 503 for those minutes.
- **Live probes:** on the origin's own hostname and through Cloudflare, a forged `X-Forwarded-For` of an internal or
  another address was counted under the sender's own key every time. The ingress appends the sender to whatever the
  sender wrote, so a visitor cannot pass as a render by forging the header.
- **`readRequestPlace`** (`apps/api/requestPlace.ts:20-52`) needs a `cf-ray` header and a trusted, external hop right of
  the resolved client, which only Cloudflare's edge is. A render's reads bring no `cf-ray` and count no view or
  play. Path routing is a route on the same ingress, so the header chain `/api` sees is unchanged.
- **`pageRenderRateLimiter`** keys by address alone and skips a session cookie or an address that is not external
  (`rateLimit.ts:208-220`). An address it cannot resolve is skipped, never pooled, so the failure to watch for is
  "not limited", which `checkTrustedProxies` logs once per process.
- **The release** (`infra/northflank/release-main.json`) runs build-image, run-migrate, deploy-app, run-edge-purge,
  deploy-worker, run-docs-sync in sequence, and is applied by hand with `northflank create workflow`. A Release
  step that names a service that does not exist fails every release there.
- **The readiness render is `/privacy`, which has no loader**, so a service stays ready while another is down.
- **Tests that exist:** the fake bundle in `apps/api/indexTestFixtures.ts:60-147`, `apps/api/uiServer.test.ts:64-75`
  (boots the real entry as a subprocess), `packages/db/index.test.ts:27-48` (pins 8 pools), and
  `packages/server/runtimeGauges.test.ts:49-79` (pins the warning to `"api"`). No test shows a quiet limiter skipping
  an uncounted request, and none names the private-network shape.

Found outside the items:

- **Low to medium: server-rendered visitor searches share one embedding bucket**, so the 21st new query in a minute
  loses its podcast episode meaning match, silently.
- **Low: a sender inside a trusted range can choose its address.** `TRUSTED_PROXIES` trusts every Cloudflare address,
  so a Worker fetching the site may write the entry the walk takes as the client. Unverified. Reads only.

### A.7 Films: the service, the queue, and the backfill (items 7, 8, 9), by reading

Claims that no longer match the code:

- **The still is 5120 by 2880, never "up to 2560 by 1440".** 2560 by 1440 is the largest stored Resource image
  (`packages/pipeline/resourceImages/resourceImageFilter.ts:16-17`). Every still ffmpeg reads is a PNG composed at four
  times the film, `COMPOSED_SCALE = 4` (`packages/pipeline/topicPodcastEpisodeVideo/videoFrames.ts:11-15`), so a zoom
  steps a quarter of a film pixel. "A smaller still" therefore means a smaller `COMPOSED_SCALE`.
- **The lower third is already bounded for most shots.** Since the montage a chapter's lower third is fed only to the
  shots that start before the segment's eighth second (`videoParts.ts:308-318`). What is left to bound is the tail of
  the one shot that the eighth second falls in. The intro and sign-off show it throughout (`videoImageParts.ts:144`).
- **A failed first render is never rendered again, even by a version bump.** Neither backfill listing finds a row at
  `failed` (`backfillTopicPodcastEpisodeVideosActivities.ts:46-52`, `:125`), and no route starts a render.
- **The backfill's remaining count undercounts.** It adds the current page's Topics, at most 100, to the films to
  re-render (`backfillTopicPodcastEpisodeVideosActivities.ts:72-73`).
- **Three places skip the platform's cost, not two:** the render (`renderTopicPodcastEpisodeVideo.ts:112` in the
  pipeline), the generated chapter images (`generatedChapterImages.ts:291-297`), and the film's own image
  (`topicPodcastEpisodeVideoImage.ts:89`).
- `README.md:74` says the worker hosts six Workers. It hosts 14.

Numbers:

| What | Value | Where |
|---|---|---|
| Workers in the one process | 14: 12 always, 2 film Workers if film concurrency is above 0 | `apps/worker/temporal.ts:122-227`, `:265-281` |
| Slots | scans 8, closing 8, screen 8, scan email 4, push 4, recording 16, dashboard 2, film 1, film backfill 1 | `temporal.ts:56-84`, `packages/server/podcastEpisodeSettings.ts:25-26` |
| Worker shutdown grace | 2 minutes, every Worker | `temporal.ts:53` |
| Film | 1280 by 720, 24 frames a second, x264 `veryfast` CRF 28 `stillimage`, maxrate 1500k | `videoFrames.ts:11-12`, `videoEncode.ts:18-45` |
| Shot | 5 to 8 seconds, planned to average 6, crossfade 10 frames, zoom 1.25 to 2 | `videoShots.ts:9-38` |
| ffmpeg runs a film | about 100 for 10 minutes, 300 for 30 | `videoParts.ts:236-243` |
| Shot timeout | 60 seconds plus 12 times its length; join 5 minutes; mux 10 minutes | `videoEncode.ts:52-58`, `:206-208` |
| Thread flags | none anywhere in the repo | `videoEncode.ts:18-45`, `packages/models/ffmpeg.ts:29` |
| Render activity | start-to-close 4 hours, heartbeat timeout 10 minutes, heartbeat every 30 seconds, 3 attempts, no schedule-to-start | `apps/worker/workflows/renderTopicPodcastEpisodeVideo.ts:10-14` |
| Failure mark | 2 minutes, 3 attempts, on its workflow's queue | `renderTopicPodcastEpisodeVideo.ts:17-29` |
| Upload grace before the sweep may delete a recorded key | 1 hour, shorter than a render | `packages/db/store.ts:17` |
| Render version | 3 | `topicPodcastEpisodeVideoRows.ts:24` |
| Backfill page | 100 Topics, then continue as new | `backfillTopicPodcastEpisodeVideos.ts:14` |
| Generated images | 40 a film, 12 a chapter, one per 30 seconds, 4 drawn at once | `podcastEpisodeSettings.ts:47`, `videoChapterImages.ts:27`, `generatedChapterImages.ts:36` |
| Cost of one generated image | $0.034; the film's own image at 2K $0.101; render $0.001 a film minute | `packages/models/budget.ts:84-98` |
| Most one platform-billed re-render costs | 40 x $0.034 + 30 x $0.001 = $1.39; a 10-minute film at most $0.69 | derived |
| Temporal SDK | every `@temporalio/*` at 1.25.0: priority keys, `cancellationDetails.workerShutdown`, `runReplayHistory` | `bun.lock` |
| Production Temporal server version | not recorded in the repo; dev runs `temporalio/admin-tools:1.31` | `docker-compose.yml:26-27` |
| Prod `temporal-worker` plan | 2 vCPU, 4096 MB, 2 instances, 2 GB disk (owner's note, 2026-11-11) | not in the repo |

Facts the design rests on:

- **No role switch exists.** The worker is the image with its command overridden to `bun run temporal`
  (`package.json:116`), and `apps/worker/temporal.ts` runs on import (`:305-307`). A role has to gate six things in
  that file: which Workers are created (`:120-229`), the backfill start (`:236-239`), the Personal sources email
  settings check (`:115`), the extra gauges (`:295-302`), the gauge line's process name (`:233`), and the pool sizing
  (`:116`). `isTopicPodcastEpisodeVideoEnabled` reads the film concurrency as on or off inside the recording Worker
  (`recordPodcastEpisodeActivities.ts:119-121`), so that setting stays above 0 on the main service after the split.
- **Both services start under one Doppler config, and a Doppler value wins over the service's own**
  (`.github/workflows/smoke.yml:95`). The role is set by a root script after `doppler run --`, under a name Doppler
  does not define.
- **A live film starts in one place:** `startChild("renderTopicPodcastEpisodeVideoWorkflow")` under
  `episode-video-<podcastEpisodeId>` on `episode-videos` with `ParentClosePolicy.ABANDON`
  (`apps/worker/workflows/recordPodcastEpisode.ts:200-214`). The row is written when the render activity starts, not
  when the workflow is queued (`topicPodcastEpisodeVideoRows.ts:72-80`).
- **The backfill renders by activity, with no workflow id of its own**
  (`backfillTopicPodcastEpisodeVideos.ts:74-76`, `:110-113`), so nothing ties it to `episode-video-<id>`. Two renders
  of one podcast episode write `chapters-v3.mp4` and `captions-v3.vtt` under the same keys, the last save wins, and a
  render that fails deletes what it uploaded (pipeline `renderTopicPodcastEpisodeVideo.ts:135-138`), which can be the
  files the other render's ready row plays.
- **A cancelled workflow cannot run its failure mark** unless the mark runs in a non-cancellable scope. The backfill
  rethrows a cancellation with no mark (`backfillTopicPodcastEpisodeVideos.ts:114-118`).
- **The film spend sum filters on the film row's `created_at`** (`packages/db/quotas.ts:331`), so a cost added today
  to a film created last week is outside today's total. `loadSpendSince` runs seven sums (`quotas.ts:276-349`):
  scans, chat turns, episodes, personal source distillation spends, topic image renders (user id nullable, null for
  a render on the platform key), Topic Post Discussions, and films joined to episodes. With a user it filters to that
  user, with a plan to the free users, and with neither it sums everything.
- **`describeScanQueue` is scan-specific only in the queue's name** (`packages/pipeline/scanWorkflowClient.ts:104-131`):
  it reads the activity side's poller count, `approximateBacklogCount`, and `approximateBacklogAge`.
- **A render checks its podcast episode once, at the start** (pipeline `renderTopicPodcastEpisodeVideo.ts:196`). Every
  ffmpeg run and still loop already honors the activity's cancellation signal.
- **A retry repeats** the audio download, the pause detection, every still's compose, every shot, the joins, and the
  mux. Shots are files in `os.tmpdir()` that the attempt removes.
- **Northflank autoscaling** (from its docs, fetched 2026-11-13, nothing in the repo configures it): a CPU threshold,
  a memory threshold, requests per second, or a custom metric read from a Prometheus endpoint in the deployment,
  averaged across instances, checked every 15 seconds, scale-up at once and scale-down over a 5-minute window.
  Northflank's default termination grace is 30 seconds, set per service; the `temporal-worker` service's value is not
  in the repo.

Found outside the items:

- **High: a deploy may kill activities with no notice.** If `temporal-worker`'s termination grace is Northflank's
  30-second default, the process dies before the SDK's two minutes end, nothing is reported, and each activity waits
  out its heartbeat timeout (10 minutes for a film, 2 for a scan stage) or its whole start-to-close (4 to 13 minutes
  for a chapter, 10 for a script or an encode), and spends an attempt.
- **High: a failed duplicate render can delete a playing film's files** (above).
- **Medium: the temp folder can fill a 2 GB disk.** One render holds a segment's stills, every chapter shot, the
  joined part, the film, and the audio. A 30-minute film's parts approach 340 MB each.
- **Medium: thread counts follow the node's cores, not the container's.** A laptop number with no `-threads` does not
  predict a 2 vCPU container.
- **Medium: film replicas are not in the pool count** (`packages/db/index.ts:46-48`, default 8).
- **Low:** removing a podcast episode removes its film's cost from the owner's month (`quotas.ts:329-331`). A still's
  PNG is written at sharp's default compression and then decoded by up to three ffmpeg runs.

### A.8 What one film render costs (item 7), measured with the project's own encode functions

Measured on an Apple M2 Pro (10 cores, 16 GB) with Homebrew ffmpeg 9.0.2, by calling the project's argument builders
and render functions from scratch scripts and running each ffmpeg command under `/usr/bin/time -l`. Each figure is
the median of three runs unless it says one run. The laptop was busy throughout, which moves wall time far more than
CPU seconds or peak memory. Not measured: a Northflank vCPU, Linux memory, the image's own ffmpeg, and the node's
core count. The exact commands and scripts are in `logs/launch-hardening/research/` (gitignored, on the machine
that ran them), in `film-measurements.md` and `scripts/`.

One shot (an 8-second shot is 182 frames in the file):

| Shot | CPU s | Wall s | Peak MB |
|---|---|---|---|
| 5 s, no lower third (a middle shot, crossfade from the still before) | 2.28 | 1.07 | 470 |
| 8 s, no lower third | 3.18 | 1.32 | 471 |
| 8 s, a chapter's second shot (the lower third fades out at the segment's 8th second) | 4.86 | 1.76 | 538 |
| 8 s, lower third throughout (an intro or sign-off shot) | 4.47 | 1.58 | 538 |
| 8 s, a chapter's first shot | 5.29 | 2.04 | 416 |

Thread counts, the 8-second shot (today no count is set, so x264 picks 1.5 threads a core and the filter graph and
each decoder one a core):

| Threads | Middle shot CPU s | Wall s | Peak MB | Second shot peak MB |
|---|---|---|---|---|
| none set, today, on 10 cores | 3.18 | 1.32 | 471 | 538 |
| encoder 1 | 2.63 | 1.88 | 341 | 410 |
| encoder 2 | 2.75 | 1.33 | 363 | 430 |
| encoder 4 | 2.70 | 1.34 | 380 | 442 |
| **every count at 2: each input, the filter graph, the encoder** | **2.71** | **1.37** | **336** | **366** |
| every count at 48, as a 32-core node picks | 3.33 | 1.31 | 827 | 1,066 |
| encoder 96, as a 64-core node picks | 3.41 | 1.29 | 1,049 | not run |

Wall time does not change from 2 threads up, because the zoom filter runs on one thread and sets the pace. With
every count at 2 the H.264 headers stay identical, so the join by stream copy still holds.

The lower third's input bounded to the seconds it shows, with its overlay passing through after it ends. Only a
chapter's second shot can gain. The output is identical in every case: the md5 of every decoded frame, SSIM 1, the
same frame count and duration.

| Shot | Unbounded CPU s | Bounded CPU s | Saved |
|---|---|---|---|
| 5 s second shot | 3.22 | 2.79 | 13% |
| 8 s second shot | 4.86 | 3.55 | 27% |
| 60 s of one still, as before the montage (the request's 38.1 to 25.1) | 36.79 | 24.72 | 33% |

About 1.3 CPU seconds a chapter, 20 of a full film's 770.

The still's size, an 8-second middle shot. "Shake" is how far a soft dot departs, frame to frame, from where an
exact zoom would put it, in the film's pixels (root mean square, then the largest step):

| Still ffmpeg reads | CPU s | Peak MB | SSIM before encode, against today | Shake, zoom |
|---|---|---|---|---|
| 5120 by 2880 (today) | 3.18 | 471 | 1 | 0.18, 0.33 |
| 3840 by 2160 | 2.93 | 375 | 0.976 | 0.23, 0.43 |
| 2560 by 1440 | 2.49 | 302 | 0.974 | 0.38, 0.65 |
| 2048 by 1152 | 2.44 | 264 | 0.945 | 0.41, 0.78 |
| 1920 by 1080 | 2.34 | 255 | 0.930 | 0.42, 0.75 |
| 2560 by 1440, enlarged to 5120 inside ffmpeg before the zoom | 2.91 | 347 | 0.983 | 0.18, 0.32 |

A plain 2560 still is as sharp as today's and shakes twice as much. 2048 and 1920 are softer and shake up to a full
pixel. The 2560 still enlarged inside ffmpeg keeps today's shake exactly, for 13% less CPU and 115 MB less. A frame
from each size at the zoom's tightest point, and clips to judge shake by eye, are in `logs/launch-hardening/research/`
under
`film/frames/` and `film/shots/`.

Whole films, one process standing in for the worker:

| Film | Settings | ffmpeg runs | ffmpeg CPU s | Wall s | ffmpeg peak MB | Process peak MB | Both at once MB | Temp folder MB |
|---|---|---|---|---|---|---|---|---|
| Short, 769 s, 5 chapters | today | 143 | 368 | 189 | 568 | 737 | 1,224 | 159 |
| Full, 1,729 s, 15 chapters, one run | today | 312 | 773 | 406 | 559 | 854 | 1,251 | 279 |
| Full, one run | encoder threads 2 | 313 | 717 | 415 | 457 | 795 | 1,170 | 284 |
| Short, one run | encoder threads 2, plain 2560 stills | 144 | 224 | 105 | 280 | 712 | 970 | 132 |

A full film is 827 CPU seconds in all, 0.48 per film second, about two cores wide, and 6.8 minutes of wall time on
the laptop. The intro (7 shots) is 25.2 CPU seconds and 568 MB, the sign-off (8 shots) 26.9 and 538. There are three
joins, a mux, and a pause detection pass, together 2.4% of a full film's CPU and never past 57 MB. **The worker
process itself holds 0.7 to 0.85 GB during a render, as much as ffmpeg**, and the dev worker reached 1,006 MB on a
real film. The dev backfill's 36 finished renders took 0.41 of the film's length where they generated images.

Renders at once in one process:

| Renders at once | Settings | Both at once MB |
|---|---|---|
| 1 | today, 10 cores | 1,313 |
| 2 | today | 1,921 |
| 3 | today | 2,658 |
| 1 | every thread count at 2 | 1,135 |
| 2 | every thread count at 2 | 1,677 |

What fits with a quarter of the limit free: 2 GB holds 1 render; 4 GB holds 3 today on a 10-core node, 1 on a
32-core node, and 4 with every thread count at 2; 8 GB holds 7, 3, and 9.

One film on Northflank, estimated, taking one vCPU second as half a laptop performance core second (the range is two
thirds to one third; the basis is thin and unverified): a full film takes 13 to 14 minutes on 2 vCPU (10 to 21), a
short film 7 minutes (5 to 10), and the longest full film seen 19 minutes. 4 vCPU does not shorten one render, because
one render is two cores wide. A first render also waits on image generation and uploads, about 0.13 of the film's
length. So **one live slot finishes about eight short films or three and a half full films an hour**. Calibrate with
one number from production: a recent render's `renderSeconds` in Temporal over that film's `duration_seconds`. The
same ratio on the laptop is 0.41.

Found outside the item:

- **High: a render's memory in production depends on how many cores the node has.** On a 32-core node the shared
  worker's live film and backfill film are two ffmpeg runs of about 1.07 GB beside a worker process past 1 GB, over
  3 GB of its 4 before any scan. Setting the thread counts fixes it in the shared worker too, before the film
  service exists.
- **Medium: the worker's own memory during a render is sized nowhere.** It is in sharp's composing of the stills or
  what follows it, and neither a forced collection nor a smaller still lowered it. It was measured on macOS alone.
- **Medium: the work folder's worst case passes half the worker's disk.** It peaks at about twice the film's bytes
  plus a segment's stills. The maximum bitrate allows a 40-minute film of 457 MB, so about 1 GB for one render.
  Whether the container's temp folder is on disk or in memory is unverified.
- **Low:** over a third of a shot's CPU is reading its two stills, a fixed 0.9 CPU seconds a shot. Two comments say a
  one-core worker encodes a run in about three times its length (`videoEncode.ts:50-51`), which nothing measured
  supports.

### A.11 The review's selection and filter (item 11), by reading and by dev rows

Claims that no longer match the code:

- **`filterTopicFindings` does not close every Scan.** A review stopped before its paid stage returns without
  filtering (`packages/pipeline/review/index.ts:50-52`, `:125-127`).
- **A removed Finding's daily view counts already leave Topic Specials.** The rows stay until the 400-day delete,
  but the Dashboard reads them through an inner join on `findings`
  (`apps/worker/dashboards/dashboardDailyCountRows.ts:104-111`). Nothing to build: this item must only not delete them.
- **The Topic page shows no placeholder for a Scan with no recap.** Only the Brew diary's recap popover and the
  Activity table do (`packages/core/lib/topicScanRecap.ts:42-43`). The Topic's notes card and the feed card read the
  latest succeeded Scan's summary even if it is empty (`apps/api/topic/helpers.ts:44-56`,
  `apps/api/topic/feedData.ts:191-209`), so they show the Findings with no note. The page's meta description already
  reads the newest succeeded Scan that wrote a summary (`apps/api/seo.ts:123`).
- **The selection has two more conditions than stated.** A match also needs the Finding's stored personal source
  bonus to be at least the bonus this Scan requires (`review/filter.ts:94`), and a url Source's own page is scored on
  every Scan even if it is rated thumbs down (`:103`).
- **The "page content hash" is sha256 of the Resource's title and snippet, never the fetched body**
  (`review/dedupe.ts:160-164`). Ingestion never changes a stored Resource, so inside one Topic it changes only after
  another Topic's Scan hashes the shared Resource again.
- **`max_results` is one of 5, 10, 15, 20**, never a range (`packages/contracts/enums.ts:195`). Exempt Findings do
  not count toward it, so a Topic holds `max_results` Findings plus every exempt one.
- **A Scan can pass 30 scored pages by `REVIEW_CONCURRENCY - 1`**, three (`review/score.ts:49`, `:164-169`).
- The November 11 measurement was not run again: the smoke writes to dev and calls models. Dev's rows agree with it.

Measured on the dev database, the last 30 days, read-only (100 Topics, 915 Findings, 94,179 Resources, 3,130 Scans):

| What | Value |
|---|---|
| Later succeeded Scans on a Topic that is full now | 452 Scans on 53 Topics |
| Pages those Scans scored | 11,918: 26.4 a Scan, median 30, p90 32, largest 33 |
| Scans that scored the whole paid section (30 or more) | 308 (68%) |
| Findings kept | 1,842, 4.1 a Scan |
| **Pages scored and not kept** | **10,076 (85%)**; 42 Scans kept nothing |
| Cost | $50.20, 11.1 cents a Scan; the paid section $38.74, 8.6 cents a Scan, 0.325 cents a scored page |
| New Findings that were a page deleted and written again | at least 114 of 635 |
| Chapters that have lost their Finding | 2,052 of 4,647; 22 hold a rating that waits for the next Finding |
| Later Scans that already scored nothing | 520 of 1,995 |
| Readers of `findings` | 59 query references in 46 production modules, 23 filtered by `isFindingShown`; 8 tables point at `findings.id` |

Facts the design rests on:

- **The selection** (`review/filter.ts:55-115`): the candidates are every url this Scan discovered plus every Resource
  the Topic holds a Finding for. A candidate is skipped if a Finding of the Topic for it matches the context hash,
  the content hash (`is not distinct from`), and the bonus, or is rated down. A url Source's own page is always kept.
- **The filter** (`review/index.ts:237-305`): `findingIdsToFilter` drops the exempt rows, sorts the rest by
  `relevance_score` then `created_at`, both descending, and returns everything past `max_results`. Exempt: bookmarked
  by someone who still has access, holds a Comment from a visible author, or rated up or down. A Reaction, a
  consumption, a view, and being narrated by a chapter do not exempt.
- **Deleted with a Finding by foreign key:** its reactions, comments, consumptions, bookmarks, feedback, views, and
  private annotations. A chapter's `finding_id` is set null and the chapter keeps its `resource_id`. The Resource, its
  content, embedding, and `resource_images` stay.
- **Every scored Resource gets a Finding at any score**, unless it is unsafe, has no text, or a private review left
  no public evidence. The limit alone decides what stays.
- **A tie goes to the newer Finding**, so a removed page scored again wins a tie against the Finding that displaced
  it and the two swap on every Scan, losing reactions and read state each time.
- **The rated chapter's path:** `upsertFinding` writes the waiting chapter rating as the new Finding's rating on the
  insert only (`review/saveFinding.ts:119`), then links the Topic's chapters of that Resource and clears their
  rating (`packages/pipeline/podcast/podcastEpisodeChapters.ts:14-59`). `episode_chapters_resource_id_idx` serves the
  subquery. No test covers this path today.
- **A Scan that reviews nothing** writes `scanSummary: ""` with kept count 0. A scheduled Scan still mails "nothing
  new" with no recap block and sends no push.
- **Nothing here touches a workflow, a contract, or an MCP tool.** Every change is inside the `reviewForScan`
  activity, and `ReviewSummary` crosses the activity boundary and must not gain a field. The review may run twice,
  so the filter's upsert and the selection's delete are safe to repeat.
- **Which Resources a Scan scored** is in the `reviewForScan` activity's result (`scoredResourceIds`), read in the
  Temporal UI. No row stores them. `bun run smoke:review` drives the same activities on a seeded Topic.

Found outside the item:

- **Low: a page judged unsafe or with no text leaves no Finding and no record**, so every Scan that rediscovers it
  pays again and it takes one of the 30 places first (`review/score.ts:174-199`).
- **Low: revalidation never succeeds.** `revalidated` is 0 on every succeeded Scan in dev, so stale stored content is
  always fetched again through the paid path (`review/fetch.ts:45-55`).
- **Low, not a traffic matter: closing an account deletes Findings from a Topic someone else owns.** A Finding is
  deleted with the Scan that last reviewed it, and a manual Scan's owner is the user who started it
  (`packages/db/schema/scans.ts:37-39`, `:183-185`). Unverified against a real close.

### A.25 Closing read: operations during a wave (findings no item covers)

Checked by reading, by read-only GETs of the public site's headers, and by one local Bun run under SIGTERM.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| O1 | **Threshold warnings and repeated errors notify nobody.** Eight conditions are sent as Sentry warnings under a fixed fingerprint tagged `alert: performance` (`pool-waiting`, `event-loop-delay`, `redis-down`, `redis-errors`, `redis-memory`, `scan-backlog`, `daily-spend`, `hourly-signups`). The guide's four alerts are the external monitor, a new issue, more than 50 errors in 5 minutes, and an uptime monitor. None filters on the tag, a fixed fingerprint is never a new issue, and one repeating error sends at most 20 events an hour (10 a process, two replicas) against a threshold of 50 in 5 minutes. `GLOBAL_DAILY_SPEND_ALERT_USD` unset sends no spend alert | `packages/server/monitoring.ts:42-43`, `:320-347`; `apps/docs/deployment.md:194-213`; `apps/worker/dailySpend.ts:12-13` | critical |
| O2 | **Scan capacity is fixed at about 236 Scans an hour.** 8 slots a replica over a 244-second mean Scan is 118 an hour, two replicas. A first Scan, a manual Scan, and a scheduled Scan share one first-in first-out queue with no priority. 3,000 first Scans take almost 13 hours, and past about 5,700 queued, Scans fail at the one-day bound | `apps/worker/temporal.ts:55-57`; `.env.example:84-86`; `packages/pipeline/stageTimeouts.ts:24`; `packages/pipeline/scanWorkflowClient.ts:50` | critical |
| O3 | **The api has no shutdown handling.** No signal handler exists in `apps/api`. A scratch server with the same export shape under Bun 1.4.3 cut a stream at chunk 2 of 6 on SIGTERM. Every deploy cuts each Carl reply mid-sentence, fails uploads and signups in progress, and loses buffered PostHog events and Langfuse spans. The web service inherits the gap | `apps/api/index.ts:330`; `Dockerfile:120` | high |
| O4 | **The origin answers directly at a hostname the public repo publishes.** The unapplied split design names the `app` service's public `code.run` hostname, the repo is public, and a GET of `/api/health` there returned 200 with no `cf-ray`. Requests there skip the edge cache and Cloudflare's protection, and each is a server render | the split design `:112`, `:117`; `apps/docs/runtime-architecture.md:195-196` | high |
| O5 | **Rollback has no runbook, and two things make it unsafe.** The guide never says "rollback". The release migrates before any deploy, so old code runs against the new schema (migration 0151 renamed two columns in place). `patched` lets old histories replay on new code, never new histories on old code, so a worker rolled back past a patch strands every workflow that recorded the marker. Every push to main releases, a docs commit included, and clearing the `NORTHFLANK_WORKFLOW_ID` repository variable is the unwritten deploy freeze | `README.md:407`; `infra/northflank/release-main.json:25-37`; `.github/workflows/ci.yml:74` | high |
| O6 | **The sweep has no heartbeat, one failed stage skips the rest, and its throttles reset every run.** Nothing reports a sweep that stops running, and the sweep is what reports a missing worker. A stage that throws skips the viewer counts, the daily count save, the deletion retries, the emails, and the spend report. "Once an hour per condition" starts from zero in every run, so a condition that holds sends a new warning on every run, four an hour in production | `apps/worker/schedule.ts:300-338`; `packages/db/jobLease.ts:54-59` | high |
| O7 | **`/api/home` is not cached at the edge, and items 13 and 17 inherit the gap.** Cloudflare's one cache rule makes only named `/api/` paths eligible, and `/api/home` is not among them: two GETs returned `cf-cache-status: DYNAMIC` beside the origin's `cdn-cache-control`. Every new shared path does nothing at the edge until the rule is edited by hand, the rule is recorded only in an archived design, and no check would say a path was missed | `apps/api/home/homeRoute.ts:22-23`; `apps/api/edgeCache.ts:68-72`; `openspec/specs/edge-caching/spec.md:52-60` | high |
| O8 | **A shed render is uncounted and shows a bare line of text.** Past 16 visitor renders a replica the response is a plain-text 503 with `Retry-After: 2`, no log, and no count, so the gauges read healthy while visitors are turned away | `apps/api/uiServer.ts:99-108` | medium |
| O9 | **The worker's two-minute grace rests on a platform setting the repo does not record**, and a review has two attempts, so two deploys inside one review fail that Scan for good | `apps/worker/temporal.ts:52-53`; `packages/pipeline/stageTimeouts.ts:16` | medium |
| O10 | **Sentry, PostHog, and Langfuse quotas are unrecorded.** Traces sample at 0.1 with a span per database statement. A quota cutoff drops errors too, and the alerts stop with them | `packages/server/monitoring.ts:28`, `:95`, `:209-220` | medium |
| O11 | **A verification, reset, or invite email is one attempt.** A 429 is reported and the email is never sent again, and the shared slot stops spacing calls after ten seconds, so a burst deeper than 50 goes out unspaced. `verifyTurnstileToken` has no time limit | `packages/emails/email.ts:84-121`; `packages/db/resendRateLimit.ts:5-17`; `apps/api/signupGate.ts:113` | medium |
| O12 | **Redis, LiteLLM, Temporal, and Neon sizes are unrecorded.** The Redis memory warning needs a `maxmemory` above zero, an eviction policy would silently drop a buffered count or a spend reservation, LiteLLM is one container in front of every model call with no health check on record, and dev runs LiteLLM v1.94.0 against production's v1.106.4 | `packages/db/redisGauges.ts:41-46`; `infra/litellm/Dockerfile:2`; `docker-compose.yml:6` | medium |
| O13 | **An edge purge has no retry, and its failure report holds the tag**, so every failure is a new key to the report limit. The nightly Dashboard build purges thousands of tags back to back | `packages/server/edgePurge.ts:39-80`; `buildDashboardSnapshotsActivities.ts:163-176` | low |
| O14 | **No status page, and the docs' Get the app page holds a placeholder** for the App Store link. `contracts/releases.json` is an empty list, so no build is recorded as released | `apps/docs/src/content/docs/get-the-app.md:11-12` | low |
| O15 | **Six per-recipient click ids are missing from the stripped list** (`_hsenc`, `_hsmi`, `mkt_tok`, `_bhlid`, `ck_subscriber_id`, `yclid`), so each such visit is a render, and a GET under `/assets/` that matches no file costs a full render and one of the 16 slots | `apps/api/index.ts:55-74`, `:206-216` | low |

Other stale statements found on the way: `apps/docs/deployment.md:208-210` says the spike alert catches a known error
made common (it cannot, above). `README.md:101` says a paid user is never slowed (the scan queue has no priority).

Checked and found sound: password hashing runs off the event loop; migrations from 0155 on open with a three-second
lock timeout, enforced by `packages/db/schema.test.ts:517-525`; the release stops before the purge and the worker if
the new `app` replicas never pass readiness; a signup survives a LiteLLM outage; the prompt registry has a time
limit, a cache, and a bundled fallback.

Owner checks that only a dashboard can answer are collected in the Launch runbook's task: Sentry alert rules and
quotas, Northflank termination grace periods and the cron's overlap policy, the Cloudflare cache rule, an IP policy
on the origin, Redis `maxmemory` and `noeviction`, provider allowances (Resend, Fireworks, Gemini speech and images,
Exa, Firecrawl, YouTube, Google Maps), and the store listings.

### A.26 Closing read: the worker and the data (findings no item covers)

Sized against 3,000 signups in one hour, each with one Topic, a first Scan, a short podcast episode, and a film, and
their 3,000 scheduled Scans on later days. Numbers measured in dev (101 topics, 3,132 scans, 114 users), selects only:

| What | Value |
|---|---|
| A manual Scan, pick-up to finish | p50 200 s, p90 417 s (66 Scans) |
| A scheduled or first Scan, pick-up to finish | p50 155 s, p90 920 s (779 Scans) |
| A manual Scan's wait for a slot today | p90 1 s |
| Resources a Scan finds | p50 45, manual average 183, p99 570, max 688 |
| A Scan's cost | manual average $0.098, p90 $0.144 |
| A short podcast episode | 4.9 chapters, $0.218, p50 697 s to publish |
| A full podcast episode | 13.4 chapters, $0.505 |
| A ready film's cost | average $0.240, max $1.525 |
| **A new free person's first day** | **about $0.56**: Scan $0.098, short podcast episode $0.218, film $0.240 |
| `resources` | 94,151 rows, 1,208 MB, 642 MB of it indexes, 12.8 KB a row, 0.9% hold a Finding, 30 new rows a Scan |
| Foreign keys no index leads with | 33 |
| `max_connections`, the role's `statement_timeout` | 901, 30 s |

One scan slot finishes about 18 first Scans an hour, so two replicas at 8 slots finish about 290 an hour and 7,000 to
9,000 Scans a day. (The operations read's 236 an hour uses `.env.example`'s 244-second mean.)

| # | Finding | Evidence | Severity |
|---|---|---|---|
| W1 | **At their defaults the daily cutoffs hold the wave's own first Scans and pause chat.** The defaults are $65 for podcast episodes, $100 for scheduled scans, $150 for chat, and 5 waiting scans started a sweep. They are thresholds in force, never "off by default". At $0.56 a signup the day's free-plan spend passes $100 after 180 to 1,000 signups. From then every free person's first and manual Scan waits and the sweep starts 20 an hour while 3,000 arrive, because production's sweep runs every 15 minutes (read from Northflank on 2026-11-13; an earlier reading of this row assumed a sweep every minute), so the last would wait days unless the first scan dispatch limit is raised, and chat pauses for every free user until midnight UTC. 3,000 signups would spend about $1,670 | `packages/db/dailySpendCutoffs.ts:66-75`, `:239-285`; `apps/worker/scanQueue.ts:69-73` | critical, the owner's decision |
| W2 | **A person's Scan waits behind the platform's scheduled Scans on one queue, twice.** Every trigger starts on `topic-scans`, and ingest and review are two activities that each wait on it. On day two the sweep keeps about 100 activities queued for about ten hours, so a Run now or a new Topic waits roughly ten minutes for ingest and again for review, against 1 s today. Every weekdays Topic comes due together at 00:00 UTC on Monday, and every Topic a cutoff held at 00:00 UTC the next day | `packages/pipeline/scanWorkflowClient.ts:12,48-53`; `apps/worker/workflows/runTopicScan.ts:47-61`; `apps/worker/scheduledTopicFilter.ts:22-32` | high |
| W3 | **A podcast episode fails for good after a short model rate limit.** The outline and each segment have 3 attempts one and two seconds apart, so a Fireworks rate limit of half a minute fails the podcast episode. A standard chapter has 5 attempts over about 7.5 minutes and is then left out. A scheduled Scan's flex chapter gets six hours for the same condition, and a Scan's own model calls wait up to a minute each inside 20 minutes. A failed first podcast episode is never recorded again | `apps/worker/workflows/recordPodcastEpisode.ts:34-46,73-82,159-188`; `packages/models/modelCallRetry.ts:10-15` | high |
| W4 | **A Firecrawl rate limit or spent credit scores the snippet instead, with no retry, and that verdict stays.** The scrape is one attempt, the catch scores the snippet and writes the Finding with the same content hash, and a Finding whose hashes match is never reviewed again. 3,000 first Scans ask for up to 81,000 scrapes on day one | `packages/pipeline/scrape.ts:16,107-121`; `packages/pipeline/review/fetch.ts:101-106`; `review/filter.ts:83-103` | high |
| W5 | **A deploy in the middle of a review ends the Scan as succeeded with part of its pages and no recap.** A worker shutdown aborts the same signal the owner's Stop does, with a `CancelledFailure` whose message is `WORKER_SHUTDOWN`. The review defers every Resource left, skips the recap, and returns, and an activity that returns is recorded as completed | `apps/worker/workflows/runTopicScanActivities.ts:345-347`; `packages/pipeline/review/index.ts:211-212`; `packages/models/budget.ts:271-277` | high |
| W6 | **The sweep reads every due Topic and every owner's limits each minute, in no order.** The query has no `order by` and no limit, then reads the daily topics count and the LiteLLM key budget (a database read and an HTTP call, cached nowhere) for each owner. With 2,700 Topics due that is about 2,700 LiteLLM calls and 10,000 queries a minute. Under a cutoff the table's order starves the same later Topics every day | `apps/worker/schedule.ts:73-75`, `:144-159`; `apps/worker/scheduledTopicLimits.ts:67-89`; `packages/models/litellm.ts:121-163` | medium |
| W7 | **A Scan carries every Resource it found through its workflow history three times.** Ingest returns each Resource with its snippet, which becomes the review's input and the finish's input. A manual Scan's 183 Resources are about 0.9 MB of history, 3,000 first Scans about 2.8 GB a day in the Temporal database, and the widest dev Scan (688 Resources, snippets up to 75,465 characters) nears Temporal's 2 MB payload limit, past which the activity fails for good. The review reads only the url, the credited Source, and two flags from that payload | `runTopicScanActivities.ts:84-92`; `runTopicScan.ts:94-105`; `packages/pipeline/ingest/feed.ts:84` | medium |
| W8 | **The review's duplicate check reads every Topic's Resources.** Neither `hasStoredHash` nor `hasNearDuplicate` names the Topic, so Topic B's page is dropped as a duplicate of a story Topic A stored from another outlet, though B never saw it. A dropped duplicate leaves no row, so the rate cannot be measured | `packages/pipeline/review/dedupe.ts:112-135` (confirmed by reading) | medium |
| W9 | **`resources` grows by about 13 KB a row with a vector index, and nothing deletes a row.** 3,000 scheduled Scans a day add about 90,000 rows and 1.15 GB a day | `packages/db/schema/scans.ts:93-144`; `packages/pipeline/ingest/index.ts:125-134` | medium |
| W10 | **An account email gets one attempt and shares one rate limit slot with every bulk send.** A scan email retries ten times under an idempotency key; a verification, reset, or invite email goes once | `packages/emails/email.ts:84-126`, `:170-229`; `packages/db/resendRateLimit.ts:4-21` | medium |
| W11 | The nightly Dashboard build is one sequential pass of 25 at a time on one slot | `apps/worker/workflows/buildDashboardSnapshots.ts:66-115` | low to medium |
| W12 | LiteLLM keeps a spend row for every model call with no retention setting | `litellm-config.yaml:125-139` | low |
| W13 | 33 foreign keys have no index that leads with them; none references `findings`, `scans`, or `resources` | catalog read | low |

Additions to items, from the same read:

- **Item 3.** `runSweep` awaits `runScheduledTopicScans()` with no catch (`apps/worker/schedule.ts:301`). With Temporal
  unreachable a failed start counts as failed, not started, so the sweep tries every due Topic at up to ten seconds
  each and reports each one: 500 due Topics is over an hour and 500 reports. `recoverPersonalSourcesWork` stops at the
  first transport failure (`packages/pipeline/personalSources/work.ts:33-45`), which is the pattern.
- **Item 7.** No Worker sets `maxCachedWorkflows`, and 13 Workers each bundle their workflows at boot.
- **Item 10.** `screenPendingSources` reads `sources` by `status = 'pending'` every sweep with no index on status
  (`packages/pipeline/screen.ts:20-24`).
- **Item 21, "every switch is off by default":** the cutoffs and the first scan dispatch limit are on (W1).
- **Item 5:** what a restart mid-review does is W5 if the worker gets its two-minute grace, and a heartbeat retry if
  it is killed sooner.

Checked and already guarded: two sweeps at once (the job lease); a scan email sent twice (the idempotency key);
orphaned objects (an upload records its key first); a queued Scan failed while it waits (a day, and 3,000 first
Scans drain in about ten hours); loops with no continue-as-new (every backfill continues as new); Expo push retries.

### A.27 Closing read: the api process (findings no item covers)

Read in the code; five were measured with scratch scripts, and production was probed with read-only GETs of public
files. No audio or film route was fetched.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| P1 | **A signed-in browser's image, avatar, favicon, and cover reads all skip the edge and stream through the api.** In production `/api/favicons/github.com` returned `cf-cache-status: HIT` with no cookie and `DYNAMIC` with a made-up session cookie, and a podcast episode image the same. The edge passes every request with a session cookie to the origin, files included. The visitor feed alone names 108 images in 468 files and 284 favicons, so 3,000 sign-ups send 300,000 to 900,000 file reads to the origin in the hour, each costing two Redis reads for the session, one limiter script, one or two queries, and a 20 to 150 KB stream through the event loop that holds every chat stream. The origin already decides what is shareable: a public file gets `CDN-Cache-Control` and a private Topic's file gets `Cache-Control: private` | `apps/api/api.ts:141-148`; `apps/api/topic/serveImageFile.ts:35-62`; `apps/api/edgeCache.ts:202-212` | high |
| P2 | **Podcast covers are drawn on the request path, one at a time, at 3000 pixels for every size.** Nothing draws a cover ahead of time; the first request does: the recording card, the Scan email, the player's lock screen artwork at both sizes, the podcast feed, and the page's structured data. The key includes the size and changes with the title, the detail line, and the image, so one new podcast episode is drawn two to four times. Measured on a laptop: a draw takes 0.8 to 1.4 s and stalls the event loop 170 to 300 ms (a share card: 0.2 s and 3 to 7 ms). Forty draws took resident memory from 119 MB to 1,820 MB, and it stayed at 1,574 MB after a forced collection | `apps/api/share/podcastCover.ts:37-100`; `packages/pipeline/cardElementPng.ts:35-39`; `apps/api/podcast/podcastFeeds.ts:229` | high |
| P3 | **Every process takes an equal share of the connection pool**, `floor(0.9 x max_connections / 8)`, and the sweep, the budget reset, and a release job each count as a full share. Each service this change adds shrinks the api's own pool: at `max_connections` 901 a pool is 101 of 8, 73 of 11, 57 of 14; at 112 it is 12, 9, 7. One site search takes six connections at once, the new-topic chat's open five | `packages/db/index.ts:44-61`, `:206-219`; `apps/api/search/search.ts:90` | high |
| P4 | **A chat post holds up to 26 MB of attachments in memory for the whole reply.** The body limit reads only `Content-Length`, the data urls are held until the reply ends, and the limiter is 30 a minute a user. Measured: ten held at once add 250 MB. One user's 30 posts at once hold 0.75 to 1.5 GB in one replica | `apps/api/chat/privateChat.ts:36`; `apps/api/chat/chatTurnStream.ts:95-107` | medium |
| P5 | A sign-up's verification email is sent once with no retry (the same finding as O11 and W10) | `apps/api/auth.ts:215-221`; `packages/emails/email.ts:84-123` | medium |
| P6 | **The search bar waits on an embedding call that may run 360 seconds.** The podcast episode search embeds the query whenever text matches do not fill 50, under `MODEL_TIMEOUT_MS`, and the search awaits every reader together, so Topics, Findings, and people wait on it. A chat turn awaits its retrieval's embedding before any header is sent | `apps/api/podcast/podcastEpisodeSearch.ts:98`, `:212`; `packages/models/models.ts:12`, `:100`; `packages/pipeline/chat/index.ts:51` | medium |
| P7 | **The sitemap and llms.txt read every public Topic, podcast episode, and Topic Post on each request with no origin cache** and no limiter. Production's sitemap is 55,994 bytes and costs about 115 ms of origin work; a read with a query string misses the edge every time | `apps/api/documents.ts:60-157`; `apps/api/seo.ts:104-127` | medium |
| P8 | **Callers with no token share 30 MCP requests a minute per address, handshake included.** `initialize`, `tools/list`, and each `resources/read` of an MCP view count the same as a tool call, and a hosted AI app calls from a few shared addresses. Measured: these messages cost 0.4 to 3.5 ms, so the limit protects no capacity on them | `apps/api/index.ts:165-169`; `apps/api/rateLimit.ts:14`, `:77-82`, `:195` | medium |
| P9 | One thread per process reads attached files, and a file that waits 90 seconds gets a 503 | `apps/api/chat/attachmentExtraction.ts:29-116` | low |
| P10 | Each open chat room stream sends three or four queries every 25 seconds | `apps/api/chat/roomEvents.ts:135-142` | low |
| P11 | The Topic Post search strips and scans every published body on each keystroke | `apps/api/search/topicPostSearch.ts:67-72` | low |
| P12 | The Turnstile check on password sign-up has no timeout | `apps/api/signupGate.ts:113` | low |
| P13 | A share card's key holds its counts, so each new count stores a new image and keeps the old one | `apps/api/share/topicImage.ts:47-50`; `apps/api/share/preview.ts:176-190` | low |

Additions to items, from the same read:

- **Item 4.** The split design routes only the preview and card images, covers, feeds, favicons, and avatars to `web`,
  so Topic, podcast episode, film, and Topic Post images would still stream through the process that holds the chat
  streams. The cover draw moves to `web` with its route, where it stalls page renders in place of chat streams.
- **Item 18.** `GET /api/rooms` runs on every signed-in page load for the chat panel: six queries and every member of
  every team the user belongs to (`apps/api/chat/rooms.ts:18-107`). The public visitor feed is 1,348,544 bytes in
  production, and `cacheJson` parses it from Redis and `context.json` writes it out again on every origin read
  (`packages/db/redis.ts:127-145`, `apps/api/api.ts:251`).
- **Item 21.** Readings the runbook can name: the pool's `waitingCount`, the cover chain's length, the render shed
  count, `attachmentBusy`, and the voice transcode shed (four at once a process, then a 503,
  `apps/api/chat/voiceRoute.ts:50`).

Checked and dropped: password hashing (52 ms off the event loop); audio and film bytes (both routes redirect to a
presigned storage url, so no media streams through the api); share cards; the MCP server's per-request build (0.4 to
1.4 ms); a chat turn holds no transaction across a model call; process maps are each bounded.

### A.28 Closing read: abuse and cost (findings no item covers)

Each finding was read to the route, its middleware chain, its limiter, and its budget gate. Two were measured with
scratch scripts. No request was sent to any server. What Cloudflare forwards for a Worker's request is from its docs
and was not tested.

| # | Finding | Evidence | Severity |
|---|---|---|---|
| S1 | **A small file unpacks to gigabytes in the api and the worker.** A workbook is loaded whole before any row limit applies (the text keeps 150 rows), and a Word file is handed whole to the extractor. Measured: a 9.5 MB workbook of 100,000 rows took the process from 54 MB to 1,540 MB in 3.7 s. The worker runs this on its main thread, 8 at once, with 3 attempts, and the upload route has no limiter of its own, so one upload from one free account kills a worker replica three times, with every Scan, podcast episode, and film activity in progress. The same file in a chat turn does it to an api replica. An avatar is stored as uploaded up to 2 MB with only its claimed type checked, and resvg decodes it at full size in a share card: a 137 KB PNG of 12,000 by 12,000 pixels added 582 MB that was not returned, on a route with no limiter | `packages/pipeline/attachTable.ts:11-19,83`; `packages/pipeline/attachText.ts:44-47`; `apps/api/chat/attachmentExtraction.ts:7,29`; `apps/worker/workflows/processAttachmentActivities.ts:24-38`; `apps/api/avatars.ts:21,47-71`; `apps/api/share/previewImage.ts:145-198` | critical |
| S2 | **The client address trusts Cloudflare's Workers range.** `TRUSTED_PROXIES` lists every Cloudflare range (production: 22 entries, one matching `2a06:98c0`, which holds the address a Worker's request to another zone arrives from). A request relayed through any Worker reaches the origin with every forwarded entry trusted, so it resolves to no client and is skipped by every limiter a page render's reads skip. If the Worker sets its own `x-forwarded-for`, the address it wrote may be taken as the client, a new key each request. That removes the per-address limit from sign-in attempts, sign-up, the verification resend, and MCP client registration | `apps/api/trustedProxies.ts:8-21`; `apps/api/rateLimit.ts:111-124,146,213-214`; `apps/api/auth.ts:189` | high, unverified against a live Worker |
| S3 | **Four paid calls have no budget gate and no spend row:** the Firecrawl scrape for a url attachment (bounded only by the general 1,800 a minute, $1.80 a minute), the scrape for each new url Source's screen, the Exa search for source suggestions (30 a day a user), and text moderation on the master key. A published Topic Post's edit classifies every changed paragraph in pieces of 8,000 characters, a body holds 66 pieces, and the save route allows 120 saves a minute that count toward no daily limit: up to 7,900 cheap-model calls a minute from one account, about $3.80 a minute, on a Topic that can be private. Long before the dollars matter the cheap model's rate limit is spent and everyone's moderation times out. None appears in the day's total | `apps/api/topic/attachments.ts:153-167`; `packages/pipeline/screen.ts:18-36`; `packages/pipeline/suggest.ts:218-232`; `apps/api/topicPost/topicPostModeration.ts:30-47`; `apps/api/topicPost/topicPostsRoute.ts:147-152,331` | high |
| S4 | **The public home fills from any brand-new account's public Topic, and nothing takes it off quickly.** The home's unpinned topics are every public shown Topic by viewer count, and its week's new podcast episodes, films, and Topic Posts are the newest 100 of each. Public and shown means public and three Findings: one Scan. Moderation has six categories and none is spam, a scam, or impersonation. An admin block hides a person's Comments and leaves their Topics, podcast episodes, films, and Topic Posts on the home | `apps/api/home/homeCardIds.ts:90-218`; `packages/db/index.ts:124-131`; `packages/contracts/moderation.ts:6`; `apps/api/adminBlocks.ts:1` | high |
| S5 | **Cards, covers, favicons, the sitemap, llms.txt, and feeds sit outside every limiter and every origin cache.** The edge caches these by their full url, so a changing query string reaches the origin each time. A card request reads the database (three queries at once for a topic card), asks storage whether the card exists, then reads its bytes. `GET /api/health/deep` runs a query on each request and returns the pool's counts to anyone. A query string never forces a redraw: every card and cover is stored under a key made from what it shows | `apps/api/rateLimit.ts:47-62`; `apps/api/share/preview.ts:41-96,176-190`; `apps/api/favicons.ts:99-125`; `apps/api/documents.ts:33,60,150`; `apps/api/index.ts:146,267-286` | high |
| S6 | **Text moderation fails open under load, reads only a note's first 8,000 characters, and has no spam category.** A failed, timed out, or skipped classification stores the text and reports | `apps/api/moderation.ts:30-44,72-91`; `packages/models/moderation.ts:17,20,99` | medium |
| S7 | **An unverified account sends verification mail to any address through change-email, 18 a minute.** The path's limit is Better Auth's default, 3 in 10 seconds per address, and every password account starts unverified after one Turnstile check: 25,000 "verify your address" emails a day to strangers from the sending domain in launch week | `apps/api/auth.ts:204-230` | medium |
| S8 | Account emails are sent once with no retry (the same finding as O11, W10, P5) | `packages/emails/email.ts:84-121` | medium |
| S9 | **The daily cutoffs are one shared amount that about 75 unverified accounts can spend for everyone.** A free account's monthly budget is $2, so 75 accounts that each spend it on chat pass the $150 chat cutoff and Carl stops answering every free person until midnight UTC; 33 pass the podcast episodes cutoff. Sign-up is Turnstile only. The unverified accounts switch exists and covers first Scans only | `packages/db/dailySpendCutoffs.ts:68-71,172-174`; `packages/contracts/plans.ts:100` | medium, the owner's call |
| S10 | **The MCP consent names only the name a client gave itself**, and registration is open, so anyone can register as "Claude" with their own redirect and post the authorize link | `apps/api/auth.ts:132-139`; `apps/web/src/pages/McpConsentPage.tsx:56,70`; `apps/api/mcp/server.ts:41-51` | medium |
| S11 | **A chat turn's 26 MB body is read and parsed before the budget and cutoff checks**, so an account whose budget is spent still has the api buffer 26 MB thirty times a minute | `apps/api/chat/privateChat.ts:36,94-112` | medium |
| S12 | **Each distinct search query stores a 20 KB vector in Redis for a day**, with no embedding limit for a signed-in user: 60 distinct queries a minute store about 1.7 GB a day | `apps/api/podcast/podcastEpisodeSearch.ts:32,193-215` | low |
| S13 | Client metadata fetches share 120 a minute per process, and registered clients are never pruned | `apps/api/auth.ts:198` | low |
| S14 | **"vienna" is not reserved**, nor "official", "staff", "moderator"; an unverified password account blocks its address's Google sign-in with Better Auth's error page | `packages/contracts/usernames.ts:14-46` | low |
| S15 | The runbook's watch list has no third-party quota: Resend, Firecrawl, Exa, YouTube (10,000 units a day by default), OpenAI moderation, Play Integrity. Each fails quietly | A.21's inventory | low |

Checked and already guarded: chat, team chat, new-topic chat, Topic Post questions, and voice (signed-in only, 30 a
minute a user, the budget and the chat cutoff checked before any model call, a reservation before the turn); a
visitor's paid calls (only embeddings, on a public key with its own budget, counted per address and cached); the
site search; the single-use sign-up token; every fetch of a user's url (through `fetchPublicUrl` with a timeout and
a byte limit); images decoded by sharp (all set `limitInputPixels`); stored html (`sanitize-html` with a tag and
scheme list); the edge cache (shared only on a 200 with no session cookie, no Authorization header, and no
Set-Cookie); redirects; errors and logs; invitations (6 a day for a free account in its first week) and reports.
