## Why

A podcast app shows each Coffee Break episode with its one-sentence description. The scan email names the episode only
by its title. The description says what the episode covers in a sentence, which is the reason to press play.

## What Changes

- The scan email's podcast episode section shows the episode's description under the cover, beneath an "Episode
  summary" heading.
- Both scan emails get it: a scheduled scan's digest and a manual scan's report.
- An episode with no description yet shows the section as it does today.

## Capabilities

### New Capabilities

### Modified Capabilities

- `topic-scan-email`: the podcast episode section adds the episode's summary

## Impact

- `worker/notify.ts` reads the episode's description beside its title.
- `emails/topic-scan-email.tsx` shows it in the podcast episode section, and the manual report reuses that section.
- No schema, api, or prompt change. The outline call already writes the description before the email sends.
