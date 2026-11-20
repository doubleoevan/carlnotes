# Tasks

## 1. Resolve YouTube values on every save

- [x] 1.1 Extend `toYoutubeSourceId` to `/c/` and `/user/` urls through the YouTube channel page's canonical link, and
      to a video url's `list` param. Verify: tests for each value form
- [x] 1.2 Add `toResolvedYoutubeSourceConfig`, which puts the id under the field its kind reads and keeps a value
      that was not the id as the name. Verify: tests for a handle, a `/c/` url, an id, a playlist saved as a YouTube
      channel, and a plain name
- [x] 1.3 Resolve new YouTube Sources in `createTopic`, `updateTopic`, and `addTopicSource`, and reject a value
      that names nothing with a 422 and Carl's create text, and a lookup YouTube did not respond to with a 503. Verify:
      `saveHelpers.test.ts`

## 2. Read the Atom feed after a missing playlist

- [x] 2.1 Throw a status error for a `playlistItems` 404 or 400 and read the Atom feed after it, tagged
      `youtube-atom`. Verify: an ingester test
- [x] 2.2 Mark the Source failed with a reason if the API and the feed both say it is missing, and leave it ready
      on a quota error, a rejected key, or a feed miss without a key. Verify: four ingester tests
- [x] 2.3 Send the API key in a header and read the YouTube channel page only until its canonical link. Verify: tests
      for the header and a link split across chunks

## 3. Backfill

- [x] 3.1 Resolve the existing rows with a gitignored local script, dry first, in dev and production. Verify: the
      resolved and unresolved counts, with each unresolved row listed
