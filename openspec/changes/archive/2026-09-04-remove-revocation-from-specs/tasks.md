## 1. Correct the specs that still describe revocation

- [x] 1.1 `invite-links`: drop `revoked` from the rejection reasons and its scenario, drop revocation
      as the allowlist's advantage, and drop it from the preview fallthrough
- [x] 1.2 `invite-share-sheet`: drop the revoke control from the shared token's limits, and drop the
      scenario about revocation reaching a token that left through the sheet
- [x] 1.3 `teams`: drop `revoked` from the open-link liveness check and rename its scenario. Keep the
      separate sentence about removing a member revoking their access, which is a different thing
- [x] 1.4 `topic-editing`: drop the revoke button from the invite section's live-link list
- [x] 1.5 `domain-schema`: drop `revoked_at` from the `invites` columns and from the ways a link
      invite stops being acceptable

## 2. Prove nothing was missed

- [x] 2.1 `openspec validate --all` passes, so every delta applies to its live spec
- [x] 2.2 Archiving leaves no mention of link revocation under `openspec/specs/`, checked by grep,
      with the member-access sentence in `teams` the one deliberate survivor
