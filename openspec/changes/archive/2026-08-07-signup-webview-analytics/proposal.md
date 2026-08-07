## Why

The session forms lead with email inside an embedded webview, because Google answers OAuth from one with `403 disallowed_useragent`. Nothing records how often that happens. There is no way to ask how many signups start inside the LinkedIn or Instagram browser, or how many of those were on Android and could be handed an intent url out of it.

The request already carries the answer. `toAnalyticsProperties` reads the user-agent header on every user-triggered event and keeps only `mobile` or `desktop` from it, throwing away the part that says which app is hosting the page.

The same string is parsed twice, in two places, for different facts. `shared/analytics.ts` reads it server-side for `mobile`/`desktop`; `ui/src/lib/userAgent.ts` reads it in the browser for the webview tokens and `android`/`ios`/`other`. A token that changes in the wild has to be fixed in both.

## What Changes

- The user-agent tokens and parsers move to `shared/userAgent.ts`, so the api and the ui read one set.
- Every browser-triggered event gains `browserPlatform` and `isInAppBrowser` alongside the existing `platform`.
- `platform` stays as it is. Event history cannot be backfilled, so redefining its values would make old and new events incomparable.
- The ui keeps only `toChromeIntentUrl`, which builds an escape url rather than reading a user agent.
- No client-side analytics. The properties are read from the request's own header, not sent up by the browser.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `monitoring-analytics`: browser-triggered events carry two more device properties, and the user agent behind them is specified as the request's own header.

## Impact

- `shared/userAgent.ts` — new, holding the tokens, `isInAppBrowser`, `toBrowserPlatform`, and `toPlatform`.
- `shared/analytics.ts` — `toPlatform` and its pattern move out.
- `api/currentUser.ts` — `AnalyticsProperties` gains two fields, read from one header lookup.
- `api/auth.ts` — `signup_completed` builds its properties by hand, so it gains the same two.
- `ui/src/lib/userAgent.ts` — reduced to `toChromeIntentUrl`; `ui/src/components/session/SessionLayout.tsx` reads the parsers from `@shared/userAgent`.
- No schema or route changes. PostHog gains properties on existing events rather than new events.
