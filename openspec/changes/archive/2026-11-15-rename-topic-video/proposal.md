# Proposal

## Why

The film code says `topicPodcastEpisodeVideo` in 2,674 places across 285 files, and the topic page's film section has
a third name, Topic Cinema, that no person ever sees. This change renames the code to `topicVideo` and the section to
the topic video section. Customer copy does not change: the section is still Coffee Break Cinema, and the films are
still films and Coffee Break films.

## What Changes

- **Identifiers and files.** Every `topicPodcastEpisodeVideo*`, `TopicPodcastEpisodeVideo*`, and
  `TOPIC_PODCAST_EPISODE_VIDEO_*` name becomes `topicVideo*`, `TopicVideo*`, and `TOPIC_VIDEO_*` on web, mobile, the
  api, the worker, and the packages. `TopicPodcastEpisodeVideoSection` becomes `TopicVideoSection`. 91 files move,
  among them `packages/pipeline/topicPodcastEpisodeVideo/` to `packages/pipeline/topicVideo/`.
- **Database.** Migration 0171 renames `topic_podcast_episode_videos` to `topic_videos` and
  `topic_podcast_episode_video_sections` to `topic_video_sections`, with their keys, indexes, foreign keys, and
  not-null constraints. Two views keep the old table names for the previous release.
- **Settings and names outside the code.** The worker's settings become `TOPIC_VIDEO_CONCURRENCY`,
  `TOPIC_VIDEO_BACKFILL_CONCURRENCY`, and `TOPIC_VIDEO_GENERATED_CHAPTER_IMAGE_LIMIT`. None is set in Doppler or
  Northflank today. The film image style prompt becomes `topic-video-image-style`, and the Sentry stage becomes
  `topic-video`.
- **Comments, docs, and specs.** Topic Cinema becomes the topic video section, and topic podcast episode video
  becomes topic video. The three film specs move to `topic-video-player`, `topic-video-rendering`, and
  `topic-video-featuring` with their text renamed, and the domain-model skill rejects Topic Cinema everywhere.
- **Tests.** A test on web and one on mobile fail if any of the app's source shows Topic Cinema.

Kept on purpose, each because something outside this repository reads it:

- the nine api fields and four route keys that the frozen 0.1.0 mobile contract names
- the seven Temporal workflow and activity names, and the `topic-podcast-episode-video` patch id, that a workflow
  under way replays
- the `/api/topic-podcast-episode-video-images/` url path, which the film feed and shared pages link to
- two columns and one enum value that the previous release reads:
  `topic_image_renders.topic_podcast_episode_video_id`,
  `spend_control_settings.is_topic_podcast_episode_video_rendering_paused`, and `topicPodcastEpisodeVideoImage`
- the PostHog events, the storage keys, the task queues, and the feed urls, which never had the old name

## Capabilities

### New Capabilities

- `topic-video-player`: the film player, moved from `topic-podcast-episode-video-player` with its text renamed
- `topic-video-rendering`: the film render, moved from `topic-podcast-episode-video-rendering`
- `topic-video-featuring`: the film shelves, moved from `topic-podcast-episode-video-featuring`

### Modified Capabilities

- `topic-podcast-episode-video-player`, `topic-podcast-episode-video-rendering`,
  `topic-podcast-episode-video-featuring`: every requirement moves out, and the capability retires
- `emergency-switches`: the film backfill setting is `TOPIC_VIDEO_BACKFILL_CONCURRENCY`
- `monitoring-analytics`: the film section's collapse event names the topic video section

## Impact

- **Behavior:** none. Every page, payload, feed, and event a person or a client sees stays the same.
- **Deploy:** the old code reads and writes films through the views for the minutes between the migration and the new
  `app` and `temporal-worker` replicas, and a rollback of one release does too. Nothing fails in that window.
- **Open changes:** the deltas of `launch-hardening`, `launch-hardening-page-reads`, and
  `launch-hardening-browser-load` now target the new film capabilities, so this change archives first.
