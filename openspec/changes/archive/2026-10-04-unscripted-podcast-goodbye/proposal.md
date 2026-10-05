## Why

Every Coffee Break episode ends on the same six-line goodbye, so the joke at its end is the same every time. The first
exchange is the part worth keeping: Carl has more reading to do, and Vienna says he always does. After that, a goodbye
that changes from episode to episode sounds like two people talking. And an episode's description reads best as a
summary of the show when it says who is talking: "Carl and Vienna talk about…".

## What Changes

- Every episode keeps Carl's "I've got more reading to do." and Vienna's "You always do." after the writer's sign-off,
  each said by its own host, and ends on a short goodbye that the writer adds after them, unscripted and different
  every episode.
- The segment writer returns that goodbye as its own field beside the sign-off, so the two fixed lines stay with their
  hosts. The last segment's draft is rejected without a goodbye, and a repaired third draft accepts a missing one.
- The outline call starts each description with "Carl and Vienna talk about".

## Capabilities

### New Capabilities

### Modified Capabilities

- `podcast-episode-rendering`: the goodbye keeps its two fixed lines and ends on the writer's own goodbye, and the
  description starts with "Carl and Vienna talk about"

## Impact

- `worker/podcast/podcastEpisodeScript.ts`: the segment schema, the sign-off assembly, and the last segment's check.
- `worker/prompts/write-podcast-episode-segment.md` (version 3) and `worker/prompts/outline-podcast-episode.md`
  (version 2). Both need `prompts:sync:prd` after the deploy.
- The stored script keeps its shape: the goodbye is part of the script's sign-off.
