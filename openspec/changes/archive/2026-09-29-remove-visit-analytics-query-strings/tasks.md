## 1. The rewrite

- [x] 1.1 In `ui/src/lib/visitAnalytics.ts`, report every absolute url an event includes as its origin and its route-shaped path, so its query string and its fragment are gone, at the top level and inside each web vitals metric
- [x] 1.2 Flip the test that kept `?ref=x`, and test a reset token in `$current_url`, a referrer's query string, a fragment, and a web vitals metric's urls

## 2. Verification

- [x] 2.1 Run `bash scripts/preflight.sh`
- [x] 2.2 In a browser, open a page with `?utm_source=…&gclid=…&token=…` in its address, and confirm the token appears nowhere in the events PostHog receives while `utm_source` and `gclid` arrive as properties
- [x] 2.3 Confirm this change archives after `add-performance-telemetry` with a dry run on a copy of `openspec/`
