## 1. Read the user agent in one place

- [x] 1.1 Add `shared/userAgent.ts` holding the in-app browser tokens, `isInAppBrowser`, `toBrowserPlatform`, and `toPlatform`, with no default argument since `shared` has no `navigator`
- [x] 1.2 Remove `toPlatform` and its pattern from `shared/analytics.ts`, and point `api/currentUser.ts` and `api/auth.ts` at the new module
- [x] 1.3 Reduce `ui/src/lib/userAgent.ts` to `toChromeIntentUrl`, and have `SessionLayout.tsx` call the shared parsers with `navigator.userAgent`
- [x] 1.4 Move the user-agent cases to `shared/userAgent.test.ts`, leaving the intent-url cases in the ui test

## 2. Report the webview on every browser event

- [x] 2.1 Add `browserPlatform` and `isInAppBrowser` to `AnalyticsProperties`, read from one header lookup
- [x] 2.2 Give `signup_completed` the same two, since it builds its properties by hand outside `toAnalyticsProperties`
- [x] 2.3 Cover a missing user agent, so every property still has a value

## 3. Verify

- [x] 3.1 `bash scripts/preflight.sh` is green
- [x] 3.2 Confirm the properties a webview user agent produces. A LinkedIn agent reads as `mobile`, `ios`, and in-app; an Android webview as `android` and in-app; Android Chrome as `android` and not in-app

Whether PostHog receives them is a post-deploy observation rather than a check that can run here, since the events are only emitted for a real signup.
