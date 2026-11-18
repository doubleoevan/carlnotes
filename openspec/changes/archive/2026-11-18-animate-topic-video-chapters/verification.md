# Coffee Break Cinema render review

The reviewer preferred the original montage to the framed scenes. Keep the production film on the original renderer. A separate 16.5-second, full-frame animation study uses three existing illustrations and the recorded narration. Steam rises above the two mugs, mail falls from the sorting chute, and the harbor reflections ripple. The camera stays still so movement inside the pictures is easy to judge.

The updated local worker matches reviewed animation to the exact approved picture bytes. It uses the same FFmpeg shot encoder for moving and still inputs. The revised host loop animates only the steam above the two mugs. The Northflank measurements below used the earlier host loop with hand and mug movement.

## Review media

Private files are in the worktree's ignored `logs/animated-film-qa/` directory. The local preview serves selected MP4s and the dev canary's captions. The development fixtures and narration are excluded from Git and the Docker build.

| Review | Files under the QA directory |
| --- | --- |
| Looping steam close-up | `picture-motion/shimmer.mp4`, six seconds starting on both cups |
| New visual direction | `picture-motion/picture-motion.mp4` and `picture-motion/matching-stills.mp4`, same narration, 396 frames each |
| Complete dev episode, framed renderer | `final-canary/film.mp4`, `final-canary/captions.vtt` |
| Fetched-image chapter | `checked-fetched/v3.mp4` and `checked-fetched/v4.mp4` |
| Generated-only chapter | `generated/before.mp4` and `generated/after.mp4` |
| Upper-decile chapter | `long-public/before.mp4` and `long-public/after.mp4` |
| Source-rich comparison and timeline | `comparison/scene.mp4` and `timeline/scene.mp4`, 144 frames each |

Chrome played the three representative pairs at 1280 × 720 and 1×. The sample produced 33 staged shots and 15 annotations. Comparison and timeline each required a separate evidence-rich example. Repeating the title on a long chapter added little information. Smaller pictures made detail harder to see on a phone.

## Local scan QA for the revised visual treatment

The normal scan and film activity queues each reported one dev poller. The recording dispatch selected version 4.
A paired render through the montage encoder produced 1,340 frames in both versions. The opening 95 decoded frames
were byte-identical. The chapter included nine shots, four approved images and three matching animation loops.
The smoke run with drifting, shimmering steam took 14.94 seconds for the montage and 22.43 seconds with animation. Both encoded the same 55.84 seconds of narration.
The local outputs are `montage-with-shimmer/v3.mp4` and `montage-with-shimmer/v4.mp4`. All four camera moves
also have a regression check covering the continuation of the outgoing picture through a ten-frame dissolve.

In a 375-pixel browser, 549 pixels in Carl’s plume and 368 in Vienna’s changed by at least 25 green-channel levels one second apart. A separate decoded-frame check found one identical background across all 144 frames after masking the two steam regions. The six-second preview starts on the mugs and loops. The host illustration also uses the same steam clip during the opening, hot takes and sign-off. Paired opening and closing renders retained 72 frames each. In both pairs the first fade frame matched and the remaining 71 frames differed between the still and shimmer.

The preflight covering the steam and Journal updates passed 5,577 repository tests and 137 browser MCP checks with zero failures. A separate real
Postgres test held a poster rebuild open across two concurrent upgrade transactions. One upgrade won and charged
its cost once. The five live files were protected, the five losing uploads and stale poster remained pending
deletion, and the five previous files retained their deletion grace. The test used the application’s publication
functions and substituted local fixtures for media rendering, object storage and the episode inputs.

## Fresh pictures in a dev brew

The local comparison used the 15 Finding chapters and the original narration of Keeping Up with the Chens E25.
Of 49 distinct displayed pictures besides the hosts, the planner selected 10 in eight chapters. Eight of 24 generated
illustrations and two of 25 fetched pictures received an effect. Six selected pictures have a glint, three have
moving foliage, and one has water ripples. The other 39 keep their camera movement and fades. All 15 requests returned.
The requests used 29,765 input and 8,570 output tokens, approximately $0.15 at the app’s blended estimate.
The review reused all approved pictures and narration.

The comparison files in the local QA folder `fresh-picture-motion/` contain 776 frames each at 1280 × 720 and
24 fps. Their AAC streams have the same SHA-256. Both animated excerpts, 382 and 394 frames, passed the chapter
publication check. The encoder converts the RGB effect to video range before applying its camera move. A regression
test encodes a moving first shot with attribution and checks its stream with FFprobe. At 375 CSS pixels wide, Chrome played both versions, retained the
playhead when switching at 2.75 and 24 seconds, and continued playback. The opening illustration has moving foliage
at the left edge. The waterfront shot opens at 21.8 seconds. Look at the lower right as its camera pulls back.
These are excerpts rendered from the dev brew. The full-episode count measures selected regions.

### Pictures per planning request

The worker considers ten pictures in one request. E25’s largest chapter had seven eligible pictures. To exercise
longer chapters, the dev benchmark combined approved E25 pictures into one ordered set of six fetched photos and
twelve generated illustrations. Each smaller batch used the beginning of the same set. Timing includes thumbnail
preparation and the model response. Costs use the returned token counts and the app’s blended rate.

| Pictures sent | Requests measured | Planning time | Estimated model cost per request |
| --- | ---: | ---: | ---: |
| 8 | 2 | 22.1–27.3 s | 1.82–1.87¢ |
| 10 | 3 | 26.7–36.2 s | 2.15–2.32¢ |
| 12 | 1 | 46.0 s | 2.78¢ |
| 18 | 1 | 53.2 s | 3.77¢ |

At the final limit, an input of eighteen pictures sent ten. The first ten offered two or three confirmed regions
across the measured requests. Encoding five seconds of selected foliage added 3.7 seconds on the dev machine.
Water added 4.0 seconds for the same duration. Each comparison used the same camera move and approved image.
Repeated appearances can add this work again. These timings exclude queue waits.

## Northflank measurements for the montage with reviewed animation

Northflank ran the final shot encoder arguments on the frozen dev fixtures in an isolated 4 vCPU, 8 GiB job.
Each cell gives the original montage followed by the montage with reviewed animation. The chapter values are medians
of three paired runs per condition, 36 encodes in total. Cold means first use in that run. Memory is sampled
anonymous memory. Disk includes the fixture workspace and preceding output. The chapter sampler ran every
1.5 seconds, and the complete-film sampler ran every second. Both can miss a short peak.

| Chapter | Run | Wall seconds | CPU core-seconds | Memory MiB | Disk MiB | Silent output bytes |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Generated, 1,005 frames | cold | 14.31 / 15.47 | 28.37 / 31.42 | 376.06 / 395.82 | 30.29 / 32.56 | 2,463,472 / 2,381,172 |
| Generated, 1,005 frames | warm | 14.65 / 15.36 | 28.11 / 31.44 | 377.02 / 396.46 | 34.57 / 34.75 | 2,463,472 / 2,381,172 |
| Fetched, 1,340 frames | cold | 19.01 / 25.55 | 36.77 / 53.82 | 394.29 / 422.48 | 71.20 / 75.08 | 3,928,935 / 4,066,720 |
| Fetched, 1,340 frames | warm | 19.20 / 25.78 | 36.84 / 54.26 | 394.27 / 423.42 | 78.58 / 78.71 | 3,928,539 / 4,066,720 |
| Long, 4,219 frames | cold | 53.87 / 54.92 | 102.50 / 107.26 | 373.93 / 379.01 | 97.95 / 108.16 | 10,771,173 / 10,699,417 |
| Long, 4,219 frames | warm | 53.74 / 54.98 | 101.78 / 105.77 | 374.06 / 375.18 | 118.14 / 118.08 | 10,772,095 / 10,697,614 |

The generated, fetched and long fixtures had reviewed animation in 6 of 7, 8 of 9 and 10 of 31 shot encodes respectively, counting the outgoing side of a dissolve. Each chapter used its approved images and original timings. All encodes finished on the first attempt. Planner, source-fetch, image-generation and speech calls were zero.

### Paired complete film

The same five-chapter, 623.88-second recording had 14,973 frames in each file, with the original audio and caption durations. This fixture used the recurring host illustration in all 113 shot encodes. Other films vary with the share and complexity of reviewed pictures. The figures below exclude provisioning, image pulls, fixture download, existing assets, storage and delivery.

| Complete film | Original | With picture animation |
| --- | ---: | ---: |
| Wall seconds | 202.10 | 214.22 |
| CPU core-seconds | 379.64 | 429.13 |
| Peak anonymous memory, MiB | 397.36 | 398.53 |
| Peak workspace, MiB | 146.42 | 251.57 |
| Output bytes | 60,231,318 | 59,199,458 |
| Active compute at $0.133/hour | $0.00747 | $0.00791 |

This run added $0.00045 in active compute. It used 19.4 and 20.6 wall seconds per narrated minute.

| Similar films per month | Original active cost | With animation | Increment | Motion worker active / idle hours |
| ---: | ---: | ---: | ---: | ---: |
| 10 | $0.07 | $0.08 | $0.00 | 0.6 / 719.4 |
| 100 | $0.75 | $0.79 | $0.04 | 6.0 / 714.0 |
| 1,000 | $7.47 | $7.91 | $0.45 | 59.5 / 660.5 |

A continuously allocated 720-hour worker at this rate costs $95.76 including idle time. Active compute is the portion attributable to rendering. The QA project ran manual jobs. The full-film job was `e659adbc-0f30-4712-ae3e-e0d30ccbaaba`.

## Northflank measurements for the framed renderer

The three fixtures used frozen approved images, the same chapter boundaries, the same narration and matched encoder settings. Each fixture ran three times cold and three times warm with each renderer, for 36 successful chapter encodes. Cold means first use in that fixture run. Allocation was 4 vCPU and 8 GiB with software WebGL. The rate used for this run was $0.133 per active hour.

Each cell shows the original montage followed by the framed renderer. CPU is aggregate core-seconds. Memory is the sampled cgroup anonymous-memory peak. Disk includes the frozen inputs and preceding outputs in the workspace. Sampling every 1.5 seconds can miss a short peak.

| Chapter and frames | Run | Wall seconds | CPU seconds | Memory MiB | Disk MiB |
| --- | --- | ---: | ---: | ---: | ---: |
| Generated, 1,005 | Cold | 13.97 / 43.35 | 27.17 / 153.55 | 380 / 398 | 31 / 32 |
| Generated, 1,005 | Warm | 13.34 / 43.77 | 26.27 / 158.57 | 377 / 399 | 34 / 32 |
| Fetched, 1,340 | Cold | 18.11 / 55.95 | 34.86 / 201.92 | 396 / 420 | 73 / 74 |
| Fetched, 1,340 | Warm | 17.45 / 56.15 | 33.49 / 203.02 | 397 / 426 | 77 / 74 |
| Long, 4,219 | Cold | 50.18 / 171.06 | 93.80 / 624.38 | 381 / 434 | 99 / 103 |
| Long, 4,219 | Warm | 51.21 / 172.44 | 95.20 / 631.52 | 381 / 434 | 114 / 103 |

Cold example silent outputs in bytes were 2,463,472 / 1,101,706 for generated, 3,929,039 / 1,776,566 for fetched and 10,771,133 / 4,660,110 for long. Both modes used zero planner tokens, extra image generations, speech generations and source calls. The final chapter runs needed zero retries.

### Complete 10-minute, 24-second film

| Metric | Original montage | Framed scenes |
| --- | ---: | ---: |
| Wall time | 201.36 s | 585.99 s |
| CPU | 377.32 core-s | 2,124.15 core-s |
| Sampled peak anonymous memory | 394.6 MiB | 427.8 MiB |
| Sampled peak workspace | 149.4 MiB | 194.4 MiB |
| Output | 60,232,817 bytes | 27,672,083 bytes |
| Video at 24 fps | 14,973 frames | 14,973 frames |
| Audio and caption duration | 623.880 s | 623.880 s |
| Active compute | $0.00744 | $0.02165 |

The increment was $0.01421 per film. The framed renderer spent about 56 seconds per narrated minute versus 19 seconds for the original. Its measured 9:46 render came in below the 30–120 minutes used for the earlier estimate. These compute figures for the framed renderer exclude the original assets and narration, platform overhead, storage and delivery. A ten-minute film with many short chapters can spend more on browser startup.

| Similar films per month | Original active compute | Framed active compute | Increment | Framed active / idle hours on one always-on worker |
| ---: | ---: | ---: | ---: | ---: |
| 10 | $0.07 | $0.22 | $0.14 | 1.6 / 718.4 |
| 100 | $0.74 | $2.16 | $1.42 | 16.3 / 703.7 |
| 1,000 | $7.44 | $21.65 | $14.21 | 162.8 / 557.2 |

A continuously allocated worker at this rate costs about $96 per 720-hour month, including idle capacity. The QA project used manual jobs. Final full-film job ID was `22539a0c-3eb9-4fd9-aa6c-4b0d0de63d37`.

### Workload isolation

Two matched runs exercised Temporal scan and audio activities on the same allocation as rendering. Median p95 scan queue wait rose from 2,532 to 4,182 ms and audio wait rose from 2,986 to 4,403 ms. Scan work increased from 9 to 15.5 ms and audio work from 828 to 1,200 ms. Event-loop delay rose from 6.80 to 14.27 ms. Sharing the allocation failed the 10% interference gate.

Separate film and main jobs with independent resource allocations held median p95 scan work at 10 ms and audio work at 795 ms during film rendering. Matched main-worker windows measured 10 and 779 ms. An additional control run after all film jobs exited varied substantially by host. It measured 14.5 ms for scans and 1,184 ms for audio. These were repeatable synthetic workloads using RSS parsing and real narrated audio encoding. Production load has its own distribution.

### Playback and recovery

The selected dev backfill completed one full episode and generated zero chapter images. Replaying the same selection skipped the ready film. The previous file stayed readable. The selected upgrade yielded to a queued new film. The normal dev episode page and the sandboxed MCP view played the 1280 × 720 finished file, loaded all 73 caption cues and passed three seeks. The iOS simulator's native AVPlayer played the same file at 1× with embedded captions and passed three seeks. The native check exercised the player rather than the full Expo screen.

The Linux software-renderer smoke exercised deterministic frame seeks, a textured portrait, labels, 96 encoded frames, cancellation during startup, and cancellation while a stalled encoder filled the pipe. Repository preflight passed 5,578 tests and 137 browser MCP checks. Strict OpenSpec validation passed. This gate covered the framed renderer. The hand-authored animation study was verified separately in a phone-width browser with three playback seeks.

To reproduce the frozen chapter comparison, run `bun run films:benchmark <frozen-fixture-dir> <new-output-dir>`. Each fixture supplies its recorded MP3, WebVTT, original film, approved image files and a hash manifest. The benchmark writes local media and never starts a production backfill.

### Dev mixed-animation trial

The E26 meadow test used the original generated picture from “Melanie builds a reading app.” Gemini Omni 1.2 Flash returned 120 frames at 1280 × 720 in 43.19 seconds. The direct comparison uses the same five seconds of the episode’s original AAC in both videos. At Google’s published rates, 1,213 input tokens, 843 thinking tokens and 28,960 video tokens cost an estimated $0.357. The hosts use a separate six-second local loop drawn over the supplied steam-free JPEG.

### Account allowances and a full dev brew

E27 of *Keeping Up with the Chens* published a 25:07 film with 15 chapters. The five-second Omni harbor illustration first appears at 5:31 and returns four times. Its motorboat leaves a wake along the lower-right edge. The pilot also chose nine local effects and reused the host steam. The nine local effects predate the film-wide cap. The finished 121,843,914-byte MP4 contains 1280 × 720 H.264, AAC narration and embedded captions. Its dev playback URL returned HTTP 206 for a byte-range request.

Concurrent reservations against dev Postgres admitted 1 unique picture on Free, 3 on Plus and 7 on Premium. Each plan declined four excess requests. Checks covered reuse at capacity, account isolation, prior-month usage, release on failed generation and episode deletion. The synthetic accounts were removed. A chapter replay used the platform key for Free, recorded zero owner charges, made zero planner calls after eight local effects, and used one mocked Omni response over two 120-frame renders. Both renders decoded identically.

### Live FFmpeg resource limits

New films and poster rebuilds share the same pre-upload resource check. Every second it measures the worker and its descendant processes and the allocated blocks in the full attempt directory. The maxima are 6 GiB resident memory and 1 GiB temporary disk. The worker aborts the encode and waits for its writer before removing the attempt directory. A final check covers short encodes between samples. The renderer tests run real FFmpeg under reduced allowances and verify cleanup before any upload or replacement.
