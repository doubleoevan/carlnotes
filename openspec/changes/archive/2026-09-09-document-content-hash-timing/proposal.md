## Why

The content-hash requirement says the hash is SHA-256 over a Resource's normalized title and native snippet, and stops there. It never says when the hash is taken, so it reads as though the hash and the Resource's stored title always agree.

They stop agreeing the moment a fetched page's own title replaces a title read off the url. The hash is taken in the dedupe stage, the fetch runs after it, and the fetch does not recompute the hash. That is not an oversight to correct in code: it is what keeps a retitled Resource matching its Finding's `reviewed_content_hash`, so no later Scan pays to score a row again for a title that reads better. A reader who takes the requirement at face value would call the mismatch a bug and refresh the hash, and every retitled Resource would come back for a paid re-score.

## What Changes

- The content-hash requirement states when the hash is taken, and that a title replaced after that point leaves it as it is.
- A scenario covers a retitled Resource, which the requirement's scenarios do not reach today.

No code changes. The behavior is the behavior shipped with the fetched-title change; this states it where it can be read.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `curation`: the content-hash requirement says which stage takes the hash, and that a later retitle does not refresh it

## Impact

- `openspec/specs/curation/spec.md` — the content-hash requirement, through this change's delta
- No source, schema, or test changes. `worker/AGENTS.md` already carries the same invariant for anyone working in the module
