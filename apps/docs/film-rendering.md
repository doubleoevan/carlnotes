# Animated film chapters

A version 4 chapter uses the original FFmpeg shot encoder. Its input is an approved still or a silent, reviewed
animation of that same artwork. Use `TOPIC_VIDEO_REVIEWED_ANIMATION_DIR` for additional operator-reviewed WebM loops.
Name the file after the SHA-256 of the original source bytes. In the bundled host illustration only the steam moves.
For eligible public Finding pictures without a loop, the worker sends up to ten thumbnails with numbered close-ups
in one vision request per chapter. Selection has a 75-second model deadline. A failed request keeps the original
montage. The private video scene plan saves confirmed regions for retries. These requests add model usage beyond the
reviewed-loop benchmark below. The worker screens frames from each second before caching a generated animation.
The Three.js software-graphics smoke checks the tools used to review reusable scenes.

## Animation pilot limits

These settings apply as of November 18, 2026. When changing a limit, update its code and this guide together.

| What is limited | Current setting | What counts |
| --- | --- | --- |
| Omni generation per account | Free 1, Plus 3, Premium 7 per UTC calendar month | Each distinct illustration counts across all the owner’s Topics. Reusing its cached animation costs no additional slot. CarlNotes pays for Free’s generation. [Plan settings](../../packages/contracts/plans.ts) · [Monthly reservations](../../packages/db/topicVideoAnimationQuota.ts) |
| Omni generation per film | Up to one five-second animation | A submitted request keeps its slot even if the response is lost. A retry can reuse a completed clip. [Film reservation](../../packages/pipeline/topicVideo/generatedAnimationStorage.ts) · [Provider request](../../packages/models/chapterPictureVideo.ts) |
| Kimi-selected effects | Up to eight distinct pictures per film | Kimi can inspect up to ten candidate pictures per chapter. The renderer applies the selected effects locally and stops requesting selections once it reaches eight. [Effect limits](../../packages/pipeline/topicVideo/pictureAnimation.ts) · [Chapter selection](../../packages/pipeline/topicVideo/renderVideoScene.ts) |
| Host steam | Available on every plan | The renderer reuses the bundled loop for the matching studio illustration. It uses neither allowance. [Host animation](../../packages/pipeline/topicVideo/reviewedAnimation.ts) |

## Worker operation

Use `TOPIC_VIDEO_ANIMATED_CHAPTERS=true` on the recording worker to admit new episodes after the isolation and
playback checks pass. The workflow records the version at dispatch. To pause new version 4 admissions, remove the
setting and restart the recording worker. Keep compatible film workers polling until the admitted attempts drain.
The existing backfill continues to target montage versions below 3. Each animated attempt uploads distinct keys.
The current ready film serves until the replacement and captions are ready together. To resume, restore the setting
on the recording worker after verifying the captured frames and queue latency in QA. A dedicated film worker with zero concurrency stays idle until restarted with a positive value.

A poster rebuild checks that the published chapter video came from the same scene plans and approved artwork it
can read now. If the record is missing, the artwork changed, or the previous poster appeared in a chapter, the worker
re-encodes the chapters with the currently approved pictures and any cached animation. The replacement keeps the
published narration and captions. Only the intro and sign-off count toward the owner’s render cost. If a newer full render publishes during a rebuild, its film wins and the superseded rebuild
records no publication event.

The isolated Northflank US West benchmark rendered a 623.88-second recording on 4 vCPU and 8 GiB. The montage
took 202.10 seconds. Adding reviewed animation took 214.22 seconds. Both films contained 14,973 video frames, AAC
narration and embedded captions. At $0.133 per allocated hour, the active compute was $0.00747 and $0.00791.
The render reused the audio and images and made zero provider calls. The animated render reached 398.5 MiB of
sampled anonymous memory and 251.6 MiB of workspace. One continuously allocated worker costs $95.76
per 720-hour month at this rate, including idle time. Film length, shot count and animated shot count affect render time.

New film renders and poster rebuilds check resident memory across the worker process tree and allocated space in the attempt directory every second, and again before upload. The defaults are 6 GiB of memory and 1 GiB of temporary disk. Set `TOPIC_VIDEO_MEMORY_LIMIT_MIB` or `TOPIC_VIDEO_DISK_LIMIT_MIB` to lower either limit. An exhausted attempt aborts its downloads and encodes and removes its workspace before Temporal retries.

Provision `temporal-films` on `nf-compute-400` with one replica, at least 2 GB temporary disk, 256 MiB shared
memory and termination grace above two minutes. Use the same image, environment group and Temporal namespace
as the main worker. Start it with `bun run temporal:films`. Confirm both film queues show its poller before switching
`temporal-worker` to `bun run temporal:main` and registering the updated release pipeline. Each release brings up
the compatible film worker before the main worker can dispatch the new version. Keep the compatible image
available until outstanding version 4 tasks have drained. Removing the admission setting rolls new episodes
back to the montage. Ready films continue playing.

After checking new-film demand, `bun run films:backfill --episode <published-episode-uuid>` requests one ready
episode upgrade. An occupied live queue, a missing episode or a film already at version 4 yields a skip.
The backfill has no automatic list of animation upgrades. Recheck the long-film and scan/audio tests at any new
worker size before enabling admissions there. Launch-hardening row 67.6 retains autoscaling, broader scheduling,
general shot checkpoints and platform spend accounting.
