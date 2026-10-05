## Context

The code appends a fixed six-line goodbye after the writer's sign-off, because a writer left to word the goodbye once
shifted every line to the other host.

## Goals / Non-Goals

**Goals:**
- Keep the first exchange word for word with its speakers, and let the rest of the goodbye vary.

**Non-Goals:**
- No change to the stored script's shape, the transcript, or the chapters.

## Decisions

- The segment payload gains an optional `goodbye` list of turns beside `signOff`. The script's sign-off is the closing
  turns, then the two fixed lines, then the goodbye, so the fixed lines sit between two parts that the writer writes
  separately and can never shift.
- The prompt names the two fixed lines and tells the writer never to write them, so the goodbye follows them instead of
  repeating them.

## Risks / Trade-offs

- A repaired third draft with no goodbye ends on Vienna's "You always do.", which still closes the episode.
