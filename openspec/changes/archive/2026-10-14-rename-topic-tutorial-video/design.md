## Context

Every place that shows the topic tutorial video's name reads it from `TOPIC_TUTORIAL_VIDEO.name` in
`shared/youtube.ts`.

## Goals / Non-Goals

**Goals:** show "Brew with Carl" everywhere the video is named.

**Non-Goals:** renaming the video on YouTube, which is done in YouTube Studio.

## Decisions

Change the one constant. No other file names the video.

## Risks / Trade-offs

None.
