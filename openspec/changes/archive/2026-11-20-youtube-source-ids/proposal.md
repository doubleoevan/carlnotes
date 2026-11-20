# Proposal

## Why

Production's YouTube Sources were mostly unreadable. A read-only query on 2026-11-20 found 27 of 48 storing a
handle, a `/@` or `/c/` url, or a plain name in `config.channelId` instead of a `UC…` id. The ingester turned each
one into a bad uploads playlist id, `playlistItems.list` returned 404, and the Source failed every Scan. An
auto-generated YouTube Topic channel such as "Homeboy Sandman - Topic" fails the same way with a real id, because the
API does not serve its uploads playlist. Every one of them still read as ready, so no owner learned why.

## What Changes

- **Resolve on every save.** The editor's create and update, Carl's draft and add-source tools, and the MCP tools
  resolve a YouTube value to a YouTube channel or playlist id before it is written. `/c/` and `/user/` urls and a
  video url played from a playlist join the forms already resolved. A value that names nothing is rejected with a
  message that says what to paste instead.
- **Atom after a missing playlist.** A `playlistItems` 404 or 400 reads the YouTube channel or playlist Atom feed,
  tagged `youtube-atom`. This also covers YouTube Topic channels.
- **A Source YouTube does not have is failed.** If the Atom feed is missing too, the Source row is marked failed
  with a reason its owner reads, so it stops reading ready. A quota error, a 5xx, or a timeout leaves it ready.
- **A one-time backfill** resolved the existing rows in dev and production and listed the plain names it could not
  resolve. It is a gitignored local script, so it adds nothing to the repository.

## Impact

`packages/pipeline/ingest/youtube.ts`, `apps/api/topic/saveHelpers.ts`, `saveTopic.ts`, `topicsRoute.ts`,
`apps/api/tool/topicSourceTools.ts`, `newTopicChatTools.ts`, and `chatTools.ts`. No schema change.
