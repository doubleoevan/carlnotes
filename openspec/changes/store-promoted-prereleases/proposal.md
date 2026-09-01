## Why

Promoting a prerelease to a full release makes it readable, and the page never learns. GitHub fires
`released` for a promotion, not `published`, so the stored row keeps `is_prerelease` true and the read
filter goes on hiding it. Nothing surfaces the gap: the release looks published on GitHub and simply
is not on the site until somebody happens to run the sync.

## What Changes

- The release webhook acts on `released` as well as `published`. Every other action stays ignored, so
correcting a typo in a published release still re-fires nothing.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `release-notes`: the webhook's action filter admits `released` beside `published`.

## Impact

- **Modified**: `api/releases.ts` for the action filter, `api/releases.test.ts` for the promotion and
the unchanged edit behavior.
