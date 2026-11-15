# Proposal

## Why

An admin QAs a person's news in the user view, and Carl's opener is the part worth checking. The profile opener shows
only an opener the person's home already wrote today, so most profiles show none.

## What Changes

- `GET /api/profiles/:userId/opener` returns the opener the person's home shows today. If the day has none yet, Carl
  writes it the way the home does: on the person's budget, stored for the person's home, with no Finding marked read.
- The person's home reuses that opener the same day, so the day still has one model call per person.
- A person who owns a private Topic whose Personal sources text is not converted still gets null.

## Capabilities

### New Capabilities

### Modified Capabilities

- `updates`: the admin's opener read writes the day's opener if the person has none.

## Impact

- `apps/api/topic/updates.ts` gains `readProfileUpdatesOpener`, and `updatesOpener.ts` loses `readStoredUpdatesOpener`.
- `apps/api/topic/updatesRoute.ts`, the api client's `fetchProfileUpdatesOpener`, and `useProfileUpdatesOpener` keep
  their shape. Their comments and the AGENTS docs drop "stored".
