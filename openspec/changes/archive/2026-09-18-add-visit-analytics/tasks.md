## 1. The browser client

- [x] 1.1 Add the PostHog browser package
- [x] 1.2 Add `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to Doppler, copying the values already in `POSTHOG_API_KEY` and `POSTHOG_HOST`. PostHog uses one project key for the server and the browser, so there is no second key to fetch
- [x] 1.3 Add both as `ARG` lines in the Dockerfile beside `VITE_TURNSTILE_SITE_KEY`, and set them as build args in Northflank. Vite inlines a `VITE_` value at build time and the image build has no Doppler token, so Doppler alone reaches dev but never production
- [x] 1.4 Document both in `.env.example`
- [x] 1.5 Start the client once at app startup, only when the key is set
- [x] 1.6 Turn autocapture off and session recording off explicitly, rather than relying on a default
- [x] 1.7 Turn the client's own automatic page view off, since the router drives capture instead
- [x] 1.8 Set `cookieless_mode: "always"` in the client
- [x] 1.9 Set `person_profiles: 'never'`, since cookieless mode does not by itself stop a visitor being identified
- [x] 1.10 Turn on cookieless server hash mode in the PostHog project, which the client setting depends on

## 2. Page views

- [x] 2.1 Capture one page view per route change, driven from the router's location
- [x] 2.2 Capture `$pageleave`, which is what gives a session its exit page and its duration
- [x] 2.3 Replace each id segment with its route's shape, covering `/topics/`, `/profiles/`, the invite routes, and any other route holding an id
- [x] 2.5 Run that rewrite on every event as it is sent, over both the path and the url, since the client captures the page leave itself
- [x] 2.4 Assert in a test that a path holding an id reports the shape and never the id

## 3. Nothing on the device

- [ ] 3.1 Confirm in a browser that no cookie is set and no analytics entry appears in `localStorage` or `sessionStorage`
- [x] 3.2 Call neither identify nor alias anywhere, and rely on person profiles never as the backstop
- [x] 3.3 Assert in a test that the client is configured cookieless and that no identify call exists in the ui

## 4. Privacy copy

- [x] 4.1 Update the third-party table on the privacy page: PostHog receives page views as well as product events
- [x] 4.2 Rewrite the cookie section: analytics set no cookie, so there is nothing to decline

## 5. Verify

- [x] 5.1 With the browser key unset, confirm no client starts and no request leaves the browser, so self-host is unchanged
- [ ] 5.2 Confirm in PostHog that visits, referrers, and top pages report, and that visitors stay unidentified
- [x] 5.3 `bun run check`, the repo gate: Biome, `tsc -b`, the Temporal workflow bundle check, and the test suite
- [x] 5.4 `openspec validate add-visit-analytics`
