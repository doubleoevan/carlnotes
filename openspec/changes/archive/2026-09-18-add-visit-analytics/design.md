## Context

Analytics here has always been server-side: `trackEvent(event, userId, properties)` in `shared/analytics.ts`, sent
through `posthog-node`, with `userId` a required string. That shape makes an anonymous event impossible to express,
which is why no visitor has ever been counted. This change adds a second channel rather than reworking the first.

## Decisions

### Page views only, not autocapture

PostHog's browser client can capture every click, input and page structure by default, and can record sessions. Both
stay off. The question this change answers is how many people arrive and where they go next, which a page view alone
answers. Autocapture would multiply event volume by an order of magnitude for a question nobody has asked, and would
start collecting the contents of elements a visitor interacts with — a materially different privacy posture that the
current policy does not describe.

The existing ban on session recording and autocapture therefore survives this change unchanged. Only the sentence
forbidding a page view is reversed.

### Nothing is stored on the visitor's device, so nothing is consented to

PostHog's `cookieless_mode: "always"` sets no cookie and writes nothing to `localStorage` or `sessionStorage`.
Visitors are counted from a hash PostHog computes on its own servers over the team, a daily salt, the address, the
user agent and the hostname, and the salt is discarded, so the hash is not an identifier anyone can hold.

This is the decision that keeps a consent banner out of the app. The mode drops alias outright, but it does not stop
identify on its own, so person profiles is set to never as well, which makes any identify call a no-op. A visit can
never be joined to the account it becomes, and no later change can quietly reconnect them without turning that setting
off first.

The alternative was a cookie plus the consent the privacy policy already promises, which would buy the arrival to
signup funnel. That funnel is worth something, but not a banner on the first screen of every public page, which is
what this change exists to measure in the first place.

### Route changes are captured explicitly

The app is a single page under `BrowserRouter`, so the browser fires one navigation for the whole session. The
client's automatic page view would report one view per visit no matter how far someone read. Capture is therefore
driven from the router's own location, which is also what lets a path carrying an id be reported without it.

### Ids in paths are not reported

`/topics/<id>`, `/profiles/<id>` and the invite routes put an identifier in the path. Reporting them raw would fill
the page report with thousands of single-visit rows and would attach a Topic id to a visitor who never signed in. The
captured path replaces each id segment with its route's own shape, so a report reads by page rather than by row.

### The privacy policy's cookie sentence changes meaning

It currently says analytics cookies "can be declined where the law requires a choice", which describes a choice the
app never implemented. Under this change there is no analytics cookie at all, so the sentence is replaced rather than
implemented: analytics set nothing on the device, and there is nothing to decline.

## Risks / Trade-offs

- **Event volume and cost.** Page views on public pages will exceed the current server events by a wide margin, and
  PostHog bills on volume. Accepted because the questions are worth it, and bounded by capturing views only. If volume
  becomes the problem, the lever is sampling on the public pages, not autocapture.
- **The arrival to signup funnel is given up.** Person profiles set to never makes identify a no-op, so views and accounts are separate
  populations and `signup_completed`'s `cta` stays the only attribution. Accepted deliberately, to keep a consent
  banner off the public pages. Reversing it later means adding a cookie and the consent that comes with it.
- **A returning visitor counts as new the next day**, since the salt rotates. Daily uniques are sound; a week-long
  retention curve for signed-out visitors is not available.
- **Bounce rate will be approximate.** PostHog counts a bounce as one page view, no autocapture, and under ten
  seconds, and recommends autocapture for accuracy. With autocapture off the number still computes from page views and
  page leaves, but it is not the number PostHog's own dashboard is tuned for. Visits, uniques, referrers, entry and
  exit pages, and top pages are unaffected.
- **No GeoIP and no IP-based bot filtering.** Cookieless mode hashes the address into the distinct id and strips it
  before transformations run, so visits carry no country or region, and crawlers are not filtered out by address.
  Expect visit counts to read higher than real people. Accepted with the rest of the cookieless trade: the address is
  the thing not being kept, and enrichment is what keeping it would buy.
- **A browser key is public.** Anyone can read it and post events to the project. That is true of every browser
  analytics key; PostHog project keys are write-only and cannot read data back. Noted so nobody treats it as a secret.

## Migration Plan

Additive. No schema change, no server change, and no existing event changes shape. With the browser key unset the
client never starts, which is both the self-host path and the rollback: unset the key and the app returns to
server-only analytics with no code change.

Event history cannot be backfilled, so visits are counted from the day this ships and no earlier traffic appears.

## Open Questions

- Whether a signed-in user's page views should be identified, which cookieless mode forbids globally. Left out: a
  second mode for signed-in sessions would set storage for them and reintroduce the consent question.
