## Why

The note that discloses Carl and Vienna as AI says "AI voices". They write and host each podcast episode, so "AI hosts"
describes them better.

## What Changes

- The note reads "Carl and Vienna are AI hosts" on the player's details line, the podcast feeds, the transcripts, and a
  film's sign-off. Films rendered before the change keep "AI voices" in their video.
- The terms page and the Coffee Break docs page say Carl and Vienna are AI hosts.
- `AI_VOICES_NOTE` is renamed `AI_HOSTS_NOTE`.

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-feeds`: the feeds say Carl and Vienna are AI hosts.
- `podcast-episode-player`, `podcast-episode-pages`, `related-topics-and-episodes`, `scan-history`: the details line's
  note says AI hosts.
- `topic-podcast-episode-video-rendering`: the sign-off says AI hosts.

## Impact

- `packages/contracts/podcastEpisodes.ts` and the modules that import its note
- `apps/web/src/pages/TermsPage.tsx`, `apps/docs/src/content/docs/feed/coffee-break.md`
