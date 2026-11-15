# Tasks

## 1. Code

- [x] 1.1 Rename every `topicPodcastEpisodeVideo` identifier, file, and folder to `topicVideo` on web, mobile, the
  api, the worker, and the packages, and `TopicPodcastEpisodeVideoSection` to `TopicVideoSection`
- [x] 1.2 Keep the nine contract fields and four route keys that `contracts/0.1.0.json` names, with a comment at each
- [x] 1.3 Keep the seven Temporal workflow and activity names and the `topic-podcast-episode-video` patch id, with a
  comment at each
- [x] 1.4 Keep the `/api/topic-podcast-episode-video-images/` url path
- [x] 1.5 Rename the worker settings to `TOPIC_VIDEO_*`, the prompt to `topic-video-image-style`, and the Sentry stage
  to `topic-video`

## 2. Database

- [x] 2.1 Write migration 0171: rename the two tables, their keys, indexes, foreign keys, and not-null constraints,
  and add the two old-name views
- [x] 2.2 Keep the two columns and the enum value that the previous release reads, mapped to the new names in code
- [x] 2.3 Rehearse the migration on a Neon branch of production and record the result in design.md

## 3. Words

- [x] 3.1 Replace Topic Cinema with the topic video section, and topic podcast episode video with topic video, in
  comments, docs, AGENTS files, and open change docs
- [x] 3.2 Update the domain-model skill: code says topic video, customer copy says Coffee Break Cinema and film, and
  Topic Cinema is rejected
- [x] 3.3 Move the three film specs to `topic-video-player`, `topic-video-rendering`, and `topic-video-featuring`
- [x] 3.4 Add the old names to the drift list in `.agents/commands/audit-structure.md`

## 4. Checks

- [x] 4.1 Add a web test and a mobile test that fail if the app's source shows Topic Cinema
- [x] 4.2 Run preflight
