## Context

`AnalyticsProperties` is `{ plan, platform }`, built in `api/currentUser.ts` from the session and the request's user-agent header. `platform` is `mobile` or `desktop`.

`ui/src/lib/userAgent.ts` reads the same kind of string in the browser for a different question: whether the page is inside an app's embedded webview, and whether the device is Android, iOS, or neither. The session forms use it to lead with email where OAuth cannot finish, and to offer Android an intent url out.

Neither PostHog nor Sentry has a browser client — `posthog-node` and `@sentry/bun` only — so the ui cannot report anything directly, and `ui/src/lib/topicClient.ts` still carries a TODO to add a ui Sentry client.

## Goals / Non-Goals

**Goals:**

- Make the webview share of signups answerable.
- Parse the user agent in one place.

**Non-Goals:**

- Client-side analytics. The server has the same string and does not have to trust a claim the browser computed.
- Sentry enrichment. Webview failures are client-side, and the ui has no Sentry client, so tagging server errors with a device would not reach the errors worth tagging. That TODO is the prerequisite.
- New events. This adds properties to the fifteen that exist.

## Decisions

**Read the header, not the browser.** The ui functions are pure functions of a user-agent string, and the server already holds that string for every request. So the server calls them itself. Sending the browser's verdict up would add a field to every request and make a device property client-controlled.

**Keep `platform` rather than replace it.** `browserPlatform` is finer, but it is not a superset: `other` covers desktop and any mobile device that is neither Android nor iOS, so `mobile`/`desktop` is not derivable from it. More importantly the spec's own rule is that event history cannot be backfilled, so changing what an existing property's values mean would split every chart at the deploy date.

**Put the parsers in `shared/userAgent.ts`, not in `shared/analytics.ts`.** `analytics.ts` imports `posthog-node`, which cannot be bundled into the browser. A separate dependency-free file is what lets ui and api share it.

**Drop the `navigator.userAgent` defaults.** The ui functions defaulted their argument, which cannot work in `shared` where there is no `navigator`. Call sites pass `navigator.userAgent` instead of the module wrapping it, so there is one definition rather than a shared one plus a browser wrapper.

## Risks / Trade-offs

**Three device properties where there were one.** `platform` is now partly redundant with `browserPlatform`. That is the cost of not breaking existing history, and it can be dropped later once the old charts no longer matter.

**Detection stays a guess.** The token list misses any webview that does not announce itself and can be spoofed. This is the same guess the session forms already make — the properties describe what the forms decided, which is what makes them worth recording.

**A missing header is reported, not omitted.** A request with no user agent yields `desktop`, `other`, and false. Those are indistinguishable from a real desktop visit. The alternative, omitting the properties, would make the events harder to aggregate for a case that is rare and not interesting.
