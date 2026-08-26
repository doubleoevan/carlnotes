## 1. The share sheet helper

- [x] 1.1 Add `ui/src/lib/shareSheet.ts` with one function that takes a title, a text, and a url, checks `navigator.share` is present, calls it, and answers `shared`, `dismissed`, or `unavailable`. An `AbortError` is a dismissal, a `NotAllowedError` and a missing API are both unavailable. Nothing about Topics, invites, or tokens goes in this file
- [x] 1.2 Route the public topic share's sheet call through the same helper in `ui/src/components/topic/ShareTopic.tsx`, so the helper has two callers — the public share broadcasting the Topic's own url and the invite share handing out a token — and no `navigator.share` call is written twice
- [x] 1.3 Cover the helper in `ui/src/lib/shareSheet.test.ts`: a missing `navigator.share` answers unavailable without calling anything, a rejected `AbortError` answers dismissed, and a rejected `NotAllowedError` answers unavailable

## 2. The share menu's row

- [x] 2.1 Add the share-sheet row to the share menu in `ui/src/components/topic/ShareTopic.tsx`, beside the destinations already there, rendered only when `navigator.share` is present and the pointer is coarse. No disabled row, no user-agent check, and no control outside the menu
- [x] 2.2 Create an invite token inside the click handler through the same route the menu's other invite destinations use, awaited there instead of ahead of the tap, so no token is written by rendering or opening the menu
- [x] 2.3 Build the payload from the Topic's name and the absolute `/invite/:token` url for the token that activation created, and hand it to the helper
- [x] 2.4 Handle the helper's three answers: a share closes the menu, a dismissal is quiet, and unavailable copies the invite URL and says the link was copied instead of that the invite was shared, reusing the menu's existing copy feedback
- [x] 2.5 Label the row as sending the invite, distinct from the public topic share's label, so a bearer token is never handed out under a row that reads as posting the Topic

## 3. Logging

- [x] 3.1 Log one `invite_created` event from the create route, naming which of our controls asked for it and no destination, application name, or recipient. PostHog here is `posthog-node` with no browser client, so a separate sheet-opening event would mean a browser SDK or a ping endpoint for one signal that the create already stands in for
- [x] 3.2 Leave acceptance as the only attribution path, and add no analytics that reads the sheet event as a per-platform share count

## 4. Tests

- [x] 4.1 Feature detection: with `navigator.share` deleted, the share menu renders no share-sheet row, and the copy row keeps copying the Topic's page url
- [ ] 4.2 The payload: activating the row creates a token and calls the sheet with the invite URL for that token, not the Topic's page url. Not automated: it lives in the menu's click handler, and the repo has no DOM harness for component behavior. Covered by the device pass in 5.2
- [ ] 4.3 A token is created once per share and never per render: rendering, opening the menu, hovering, and focusing create nothing, and two activations create exactly two tokens. Not automated for the same reason as 4.2. Structurally the only call sits in the click handler, with none in render or an effect
- [x] 4.4 A rejected share answers unavailable, which is the row's cue to copy the invite URL and report copied, while a dismissal answers dismissed and copies nothing

## 5. Verification

- [x] 5.1 `bunx biome check .`, `bunx tsc -b`, and `bun test` all clean
- [x] 5.2 On real devices, share an invite from the share menu into a messaging application on both iOS Safari and Android Chrome, accept the invite URL from a second account, and confirm the Topic opens and the token's use count moved (confirmed by the owner's phone passes, 2026-08-20)
- [ ] 5.3 Open the share menu on desktop Firefox, where `navigator.share` is absent, and confirm the menu is the one it has today with its copy row working
- [ ] 5.4 Confirm the invite share row and the public topic share read as different actions instead of one duplicated button, since they call the same API with different payloads
- [ ] 5.5 After it ships, watch the PostHog ratio of `invite_created` events with source "share-sheet" to acceptances. A wide gap is a copy problem in the row's label, not a fault in the plumbing
