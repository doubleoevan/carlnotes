## Why

PostHog only ever hears from the server, and every event it receives is keyed to a signed-in user. Nothing a visitor
does before they sign up reaches it: landing, reading a public Topic, opening a shared Finding, leaving. The earliest
event that can exist is `signup_completed`, fired at the moment an account is made.

That leaves the product with the numerator and no denominator. We can say how many people signed up, which button
brought them, and what they did afterwards. We cannot say how many arrived, where they came from, which page lost
them, or what share of arrivals convert — and those are the questions that decide where to spend effort on the public
pages.

The current spec forbids exactly this on purpose, on the grounds that views are "high-volume and low-signal". That
reasoning held when every page was behind a sign-in. It stopped holding once public Topic pages, profiles,
share cards and the blog became the way people find the app.

## What Changes

The browser starts sending PostHog a page view for each page a visitor opens, and nothing else. Autocapture and
session recording stay off, so no click, keystroke, form value, or screen recording is ever collected — the addition
is the visit, not the behaviour inside it.

The client runs in PostHog's cookieless mode, so it sets no cookie and writes nothing to browser storage. Visitors are
counted by a daily-salted hash PostHog derives on its own servers and then discards. Nothing is stored on the device,
so nothing has to be consented to, and no banner is added.

That comes at a price worth stating plainly: cookieless mode drops identify, so a visit can never be joined to the
account it becomes. Visits and accounts stay separate populations. "How many arrive and where do they go" is
answerable; "which arrivals converted" stays answered only by the `cta` property already on `signup_completed`.

## Capabilities

### Modified Capabilities

- `monitoring-analytics`: a page view becomes an event, the exclusion of all browser-side analytics narrows to
  autocapture and session recording, and the self-host guarantee covers the browser key too

### Added Capabilities

- `monitoring-analytics`: visit analytics in the browser, the cookieless mode that keeps them off the device, and the
  separation of visits from accounts

## Impact

- `ui/src/lib/visitAnalytics.ts` — a new module: starting the client, the reported path, and the capture call
- `ui/src/main.tsx` — starts the client before the first render
- `ui/src/App.tsx` — a `VisitAnalytics` component inside the router captures a view on each route change
- `ui/src/pages/PrivacyPage.tsx` — the third-party table says PostHog also receives page views, and the cookie section
  says analytics set no cookie
- the PostHog project itself — cookieless server hash mode has to be on for the client setting to work
- `.env.example`, the Northflank build env, and the README — the browser-visible key
- no server change: `shared/analytics.ts` and its taxonomy are untouched
