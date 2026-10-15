## Why

Google Search Console flagged the homepage's `VideoObject`: "uploadDate" is missing a timezone and is an invalid
datetime. The block gave `2026-10-13`, a date with no time or time zone, and Google reads a video's upload date only as
a full ISO 8601 datetime with a time zone.

## What Changes

- The topic tutorial video's `uploadDate` is YouTube's own upload time, `2026-10-13T17:40:17-07:00`.
- A test checks that the video's upload time has a time and a time zone offset.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `seo`: the `VideoObject` upload date is a full datetime with a time zone offset.

## Impact

- `shared/youtube.ts`: `TOPIC_TUTORIAL_VIDEO.uploadDate` and the `PageYoutubeVideo` comment.
- `shared/seo.test.ts`: the `toVideoObjectLd` test and the upload time format test.
