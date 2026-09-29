## Context

`toReportedEvent` is the `before_send` hook of the browser's PostHog client, so every event passes through it on its way out. Once the `add-performance-telemetry` change is in, it rewrites every property named for a pathname and every absolute url, at the top level and inside each `$web_vitals_<metric>_event`, replacing an id and a topic's slug with its route's shape. Each url keeps its query string and its fragment.

Several pages read a secret or a user's state from the query string: the reset password page's `token`, the MCP consent page's `consent_code`, the login page's `next`, and the homepage's section page numbers. posthog-js sends the page's address as `$current_url` on every event, the previous site's address as `$referrer`, the session's first address as `$session_entry_url`, and the address again inside each web vitals metric.

## Goals / Non-Goals

**Goals:**

- No url PostHog receives includes a query string or a fragment.
- Attribution stays as it is: the campaign parameters and click ids PostHog records.

**Non-Goals:**

- Changing which events are sent, the cookieless setup, or the route shapes.
- The Sentry scrub, which already removes every query string in `shared/monitoring.ts`.
- The query strings of the api's own requests, which PostHog never sees.

## Decisions

**A url is reported as its origin and its route-shaped path.** The rewrite that already visits every absolute url builds the reported url from the url's origin and `toReportedPath` of its path, so the query string and the fragment are both gone, in the same pass that removes the ids. One rule covers the top level and each web vitals metric, and a url property posthog-js adds later is covered without a list to keep. Cutting at `?` the way Sentry's `withoutQueryStrings` does was the model, but the url is already parsed here to rewrite its path, so the parsed origin and path are the simpler form.

**No allowlist.** posthog-js reads the campaign parameters and the ad click ids from the page's address itself (`save_campaign_params`, on by default) and sends each as its own property: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `fbclid`, and the others in its list. A local run with `?utm_source=…&gclid=…&token=…` showed `utm_source` and `gclid` arriving as their own properties and the token only in `$current_url`. Keeping the `utm_` parameters in the url would repeat what PostHog records anyway, at the cost of a list to maintain. Those properties never include a token, since posthog-js reads only the parameters it names.

**The fragment goes too.** A fragment never reaches a server, but PostHog's client sends it in `$current_url`. Nothing the analytics count depends on one, so the rule stays one sentence: a url is its origin and its path.

**Paths stay as they are.** `$pathname` and `$prev_pageview_pathname` never include a query string, so their rewrite is unchanged.

## Risks / Trade-offs

- [Page views of one page with different query strings merge, such as the homepage's section pages] → The analytics count pages, and a section's page number is a state of the homepage, not a page of its own.
- [A referrer from another site loses its query string, such as a search engine's query] → The referring site's domain stays in `$referring_domain`, and the campaign properties stay.
