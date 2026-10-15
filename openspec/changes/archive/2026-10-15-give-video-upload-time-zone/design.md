## Context

`toVideoObjectLd` copies `TOPIC_TUTORIAL_VIDEO.uploadDate` into the homepage's `VideoObject` as it is.

## Goals / Non-Goals

**Goals:** an `uploadDate` that Google accepts.

**Non-Goals:** reading the time from YouTube at runtime.

## Decisions

- The value is the `uploadDate` that the video's YouTube page publishes, `2026-10-13T17:40:17-07:00`, so the homepage
  and YouTube agree.
- The constant keeps a plain string, and a test checks its shape.

## Risks / Trade-offs

None.
