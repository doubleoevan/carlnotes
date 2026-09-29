## Why

The visit analytics report every path and url a PostHog event includes by its route's shape, but each url keeps its query string and its fragment. A password reset link's `?token=…`, an unsubscribe token, or a consent code in the page's address reaches PostHog in `$current_url`, and the same can happen in `$referrer`, `$session_entry_url`, and the urls inside each web vitals metric. A local run confirmed it: a page opened with `?token=…` sent the token in the page view's `$current_url`.

## What Changes

- Every url a PostHog event includes is reported as its origin and its route-shaped path, with no query string and no fragment, at the top level and inside each web vitals metric.
- No allowlist is kept. posthog-js already records the campaign parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) and click ids such as `gclid` and `fbclid` as properties of their own, read from the page's address, so attribution is unchanged. The same local run showed `utm_source` and `gclid` arriving as their own properties.
- The test that asserted a url keeps `?ref=x` asserts the opposite.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `monitoring-analytics`: the visit analytics requirement says no url PostHog receives includes a query string or a fragment, while the campaign properties posthog-js records on its own stay.

## Impact

- `ui/src/lib/visitAnalytics.ts` (`toReportedEvent`) and its tests.
- The visit analytics requirement in `openspec/specs/monitoring-analytics/spec.md`. The open `add-performance-telemetry` change modifies the same requirement, so this change's delta is written against that version and is archived after it.
- No api, worker, or dependency change.
