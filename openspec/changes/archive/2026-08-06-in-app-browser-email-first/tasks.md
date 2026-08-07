## 1. Detection

- [x] 1.1 Add `ui/src/lib/userAgent.ts` with `isInAppBrowser()` and a platform reader, both from `navigator.userAgent`. Cover the apps that send us traffic: LinkedIn, Instagram, Facebook's `FBAN`/`FBAV`, and the generic Android `wv` token.
- [x] 1.2 Unit-test the matching in `ui/src/lib/userAgent.test.ts` against real user-agent strings: each named app matches, desktop Chrome and mobile Safari do not, and the platform reader tells Android from iOS.

## 2. The reordered form

- [x] 2.1 In `SessionLayout`, read the detection once and use it to decide the order: in an in-app browser the email form renders open and above the provider buttons, and everywhere else the current order stands.
- [x] 2.2 Keep the provider buttons rendered, enabled, and wired to the same `onOAuth` handler in both orders.
- [x] 2.3 Leave the email form itself, its submit, and `extraFields` untouched, so signup's Turnstile widget keeps working exactly as it does now.

## 3. The notice

- [x] 3.1 Add the notice, shown only when an in-app browser is detected, saying in Carl's voice why email is on top.
- [x] 3.2 On Android, include a link that rebuilds the current url as an `intent://` with a browser fallback so it reopens in Chrome.
- [x] 3.3 On iOS, replace that link with a sentence naming the in-app browser's own menu, since no equivalent link exists.

## 4. Verification

- [x] 4.1 `bunx biome check .`, `bunx tsc -b`, `bun test`.
- [x] 4.2 Live: load `/login` and `/signup` with a spoofed in-app user agent and confirm the email fields are open and above the provider buttons on both, with the notice showing.
- [x] 4.3 Live: confirm an ordinary browser is unchanged — providers first, email behind its reveal, no notice.
- [x] 4.4 Live: with an Android in-app user agent, confirm the notice offers the `intent://` link; with an iOS one, confirm it offers the menu sentence and no link.
- [x] 4.5 Live: complete an email signup from the reordered form, confirming the Turnstile check still passes and a session is established. Runs against carlnotes.com once deployed, since a real in-app browser cannot reach a local dev server.
