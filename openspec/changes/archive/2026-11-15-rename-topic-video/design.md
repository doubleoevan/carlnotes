# Design

## Context

A film is a `topicPodcastEpisodeVideo` in code, a `topic_podcast_episode_videos` row in Postgres, and Topic Cinema on
the topic page in comments and specs. Customer copy calls the section Coffee Break Cinema and the films films. The
rename touches code that four outside readers depend on: the released mobile app's api contract, Temporal workflow
histories, links already shared, and analytics history. Each needs its own rule.

## Goals / Non-Goals

**Goals:**

- One name in code, comments, docs, and specs: topic video, and the topic video section.
- A database migration that renames in place, with no table copy, no downtime, and a safe rollback of one release.
- No change any person or client can see.

**Non-Goals:**

- Versioning the mobile contract. The kept fields read the same, so the 0.1.0 snapshot stays valid.
- Dropping `topic_video_sections`, which nothing reads now. That is a product decision outside a rename.

## Decisions

### The mobile contract keeps its field names

`contracts/0.1.0.json` names nine response fields and four route keys with the old name. Renaming them breaks a
released app, or needs a new contract version that every app version still has to read. The fields keep their names,
and the code renames its locals around them: `homeTopicVideos` is returned as `homeTopicPodcastEpisodeVideos`. Each
contract module says why beside the field. `bun scripts/check-contract-freeze.ts` passes with no new snapshot.

### Temporal keeps its type names

A workflow's type is its exported function name, and an activity's type is its export name. A workflow under way
replays its history against the new code after the deploy, and a renamed type fails that replay. The seven workflow
and activity exports and the `topic-podcast-episode-video` patch id keep their names, with a comment at each.

### The url path stays

`/api/topic-podcast-episode-video-images/` is in the film feed and in pages people already shared. The route module
moved to `topicVideoImagesRoute.ts`, and the path it serves did not change.

### The migration renames the two tables, and two views keep the old names

Migration 0171 is hand-written. `drizzle-kit generate` wrote drops and adds of the foreign keys, which validate every
row under an exclusive lock. The hand-written SQL uses `RENAME` for each table, foreign key, and index, which only
changes the catalog. It opens with the 3 second lock timeout that every migration since 0155 sets, and adds a 60 second
statement timeout. A second `drizzle-kit generate` reports no schema changes.

Postgres 18 names not-null constraints. A `DO` block renames every not-null constraint of the two tables that starts
with the old prefix.

A service rolled back one release still runs against the schema, and so does the old code for the minutes between the
migration and the new replicas. Both query `topic_podcast_episode_videos`. Two `SELECT *` views keep the old table
names. Postgres updates a simple view in place, so the old code's insert with `ON CONFLICT ... RETURNING`, its updates,
and its deletes all reach the table, with the table's defaults. The migration's first comment says so, as the schema
test requires of every migration that renames. A later migration drops both views once the previous release no longer
reads them.

### Three stored names keep the old name

A view covers a renamed table, but nothing covers a renamed column or enum value. So the previous release reads these
three as they are, and the code maps its new names onto them:

- `topic_image_renders.topic_podcast_episode_video_id`, which Drizzle reads as `topicVideoId`
- `spend_control_settings.is_topic_podcast_episode_video_rendering_paused`, read as `isTopicVideoRenderingPaused`
- the `unchecked_image_subject_kind` value `topicPodcastEpisodeVideoImage`, which code writes as stored

A rename of each is safe once the release before it reads the new name: that release adds the new column or value and
writes both, and the next one drops the old. That takes two deploys, so it is left out of this change.

### Settings and names outside the code

The worker's three settings become `TOPIC_VIDEO_*`. None is set in Doppler dev, Doppler prd, or a Northflank service,
so every environment keeps its default and no secret moves. The prompt `topic-video-image-style` needs a
`prompts:sync` in dev and prd after the deploy. The PostHog events (`episode_video_*`), the storage keys
(`episodes/<id>/video/`), the task queues, the backfill workflow id, and the feed urls never had the old name.

### The specs move to new capabilities

The three film capabilities move with every requirement, renamed: ADDED in `topic-video-*`, REMOVED in
`topic-podcast-episode-video-*`, and `retire_capabilities` removes the old folders on archive. The open
`launch-hardening` changes target the new capabilities, so this change archives before them.

## Rehearsal

Run on 2026-11-15 on the Neon branch `rehearsal-topic-videos-2`, created from production that day. The branch expires
on 2026-11-17.

- Production had 171 migration rows, through 0170. Migration 0171 applied in under 2 seconds, leaving 172.
- `topic_videos` has the 91 films, and `topic_video_sections` the 4 sections. Both old-name views return the same
  counts.
- No index keeps the old name. The two constraints that still say it name a kept column: the film image render's
  foreign key, now `topic_image_renders_topic_podcast_episode_video_id_topic_videos`, and the spend switch's not-null
  constraint. The enum still lists `topicPodcastEpisodeVideoImage`.
- Through the old-name view, in a transaction rolled back after: an insert with `ON CONFLICT ... RETURNING` applied
  the defaults (cost 0, render version 1, a created time), and an update and a delete reached the table.
- The renamed Drizzle schema read the branch: 91 films, 90 ready, and 13 film image renders. Production has no saved
  spend settings row.

## Risks / Trade-offs

- [The views must be dropped later] → Their comments say so, and the drop waits one release after this deploy.
- [25 kept names still say topic podcast episode video] → Each has a comment, and the domain-model skill lists them as
  the only exceptions.
- [Another worktree on the shared dev database runs old code] → The views keep its film reads working until it
  rebases.
