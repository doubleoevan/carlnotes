## Why

Closing an invite link was removed in `remove-unnecessary-guards`: the control, the route, the handler,
the `revoked` rejection reason, and the `revoked_at` column all went, and migration 0084 dropped the
column. That change's delta only covered the one requirement in `invite-links` that owned the control.

Eight requirements across five other specs still describe revocation as behavior the system has. The
worst is `domain-schema`, which documents `revoked_at` as a column of the `invites` table. That column
does not exist. A reader working from these specs would implement a feature that was deliberately
removed, or expect a rejection reason nothing can produce.

## What Changes

Nothing in the code. This corrects the specs to describe the system as it is.

- `invite-links` stops listing `revoked` among the ways a token fails, stops offering revocation as the
  allowlist's advantage over a bearer token, and stops naming a revoked token among those whose preview
  falls through to the site's own tags.
- `invite-share-sheet` stops promising that a shared token carries the same revoke control as any other,
  and stops describing revocation reaching a token that left through the sheet.
- `teams` stops naming a revoked invitation among those that vouch for nobody through an open link.
- `topic-editing` stops describing a revoke button beside each live link.
- `domain-schema` stops recording `revoked_at` as a column, and stops naming it as a way a link invite
  stops being acceptable.

Expiry and the use limit stay exactly as they are. They are the two ways a link ends now, and both
already have their own requirements and scenarios.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `invite-links`: the rejection reasons, the allowlist comparison, and the preview fallthrough stop
  naming revocation.
- `invite-share-sheet`: the shared token's limits stop including a revoke control.
- `teams`: the open-link liveness check stops naming a revoked invitation.
- `topic-editing`: the invite section stops listing a revoke button.
- `domain-schema`: the `invites` table stops recording `revoked_at`.

## Impact

Specs only. No code, no migration, no test. `openspec validate` is the check that the deltas apply
cleanly, and a grep for the word across `openspec/specs/` is the check that nothing was missed.
