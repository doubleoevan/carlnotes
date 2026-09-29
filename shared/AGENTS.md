# shared/

What every module may import, and the reason the boundary holds: `contracts.ts` is the zod request
and response shapes the api validates with and the ui parses against, `enums.ts` and `plans.ts` hold
the values both sides compare, `sources.ts` defines the Sources an ingester reads, `seo.ts` builds topic
slugs and paths, meta descriptions, and the site's structured data, and `appUrl.ts` reads the app's base url
from `BETTER_AUTH_URL` for server code: `appUrl()` falls back to the local dev server, and `appBaseUrl()` is
undefined when unset, for the emails and notifications that skip without a link.

- This module imports nothing app-level. It may not reach into `ui`, `api`, `worker`, or `db`, which
  is what lets all four depend on it.
- A shape both sides need lives here once. A shape only one module reads stays in that module.
- `contracts.ts` exports each payload's zod schema; the api validates with it through `zValidator`
  and the ui parses responses with it, so a drifted field fails at the boundary instead of silently.
- Nothing here touches the database, the network, or the DOM: these are values and their shapes.
- Tests: `bun test shared`.
