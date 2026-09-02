## 1. The invite preview

- [x] 1.1 Add a token-to-target read that returns the Team or Topic a live token opens, and nothing for a dead one
- [x] 1.2 Add `GET /invite/:token` to `api/pages.ts`, serving the target's existing preview card
- [x] 1.3 Fall through to the site's own tags for an unknown, revoked, expired, or exhausted token
- [x] 1.4 Test: a team invitation titles itself Join and a topic invitation Follow, each no-index with the invite
      URL as its `og:url`. Resolving a token to its target reads the database, so which target a live token opens
      is covered by the existing `toInviteRefusal` tests for liveness and by the walkthrough in 3.2

## 2. The share sheet

- [x] 2.1 Name the page option and the invite option apart in the team sheet and the topic sheet
- [x] 2.2 Offer the invite option to anyone who may invite, not only where a native share sheet exists
- [x] 2.3 Fall back to the clipboard when no native sheet is available, and open a sheet only where one is worth
      offering, so the option copies as its label promises on a desktop browser that supports `navigator.share`
- [ ] 2.4 Test: the labels differ, and inviting copies with no native sheet. The repo has no component tests for
      the share menus, so this is unverified by the suite and is left to the walkthrough in 3.2

## 3. Ship

- [x] 3.1 Run `bun run check`
- [ ] 3.2 Confirm an invite URL previews as its team and is still acceptable afterwards (verify on prod after deploy)
