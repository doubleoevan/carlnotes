## 1. The authoring convention

- [ ] 1.1 Add `.github/release.yml` categorizing the generated pull request list into features, fixes, and dependencies by label, with dependency-bot authors excluded
- [ ] 1.2 Document the release body convention in the repo: summary, `<!-- more -->` sentinel, generated list inside a `<details>` block, and images referenced by absolute R2 URL
- [ ] 1.3 Confirm the labels the categories key on exist in the repository, adding any that do not

## 2. Storage

- [ ] 2.1 Add the `releases` table to `db/schema.ts`: tag as the unique key, name, body markdown, published date, GitHub URL, and prerelease flag
- [ ] 2.2 Generate the migration with `bun run db:generate`
- [ ] 2.3 Add the upsert-by-tag write the webhook and the sync script both call, so there is one write path

## 3. The webhook

- [ ] 3.1 Add the webhook signing secret to `.env.example` and to Doppler
- [ ] 3.2 Add the `release` webhook route to the api, verifying the HMAC signature before reading the payload
- [ ] 3.3 Reject the request when no signing secret is configured, rather than skipping verification
- [ ] 3.4 Act only on `action: "published"`, acknowledging and ignoring every other action
- [ ] 3.5 Log each upsert so a gap between the page and GitHub is visible in the platform logs
- [ ] 3.6 Test the route: rejected without a signature, rejected with no secret configured, ignored on `edited`, upserted on `published`, and idempotent on a re-delivery

## 4. The page

- [ ] 4.1 Add the `/releases` route to `api/pages.ts`, rendering stored rows through `api/content.ts`'s markdown renderer and page style
- [ ] 4.2 Split each body on `<!-- more -->` and render only the part above it, rendering the whole body when the sentinel is absent
- [ ] 4.3 List published, non-prerelease releases newest first, each linking to its own page
- [ ] 4.4 Add the `/releases/:tag` route rendering one release whole, answering 404 for an unknown tag
- [ ] 4.5 Give both pages their canonical URL and title, matching what the blog pages declare
- [ ] 4.6 Test both: no GitHub API call on a pageview, the summary shown without the generated list, a sentinel-less body rendered whole, a prerelease withheld, and an unknown tag 404ing

## 5. Sync and repair

- [ ] 5.1 Add the sync script reading the GitHub releases API and upserting by tag through the same write path, skipping drafts
- [ ] 5.2 Add it to the package.json scripts and to the README's Development section in the same change
- [ ] 5.3 Document it as the repair path for a missed webhook delivery, not only as a one-time backfill
- [ ] 5.4 Test that a second run changes nothing and creates no duplicates

## 6. Discovery surfaces

- [ ] 6.1 Add `/releases` and every published release's own page to the sitemap in `api/seo.ts`
- [ ] 6.2 Add an item per published, non-prerelease release to `/feed.xml`, ordered among the blog items by date
- [ ] 6.3 Add the permanent redirect from `/changelog` to `/releases`
- [ ] 6.4 Test the three: `/releases` in the sitemap, releases in the feed with prereleases withheld, and `/changelog` redirecting permanently

## 7. Ship

- [ ] 7.1 Deploy the table and migration first, leaving the empty table in place
- [ ] 7.2 Register the webhook in the repository settings against the Doppler secret
- [ ] 7.3 Run the sync script once to seed the releases that already exist
- [ ] 7.4 Deploy the page, the sitemap entry, the feed items, and the redirect together
- [ ] 7.5 Run `bun run check` and confirm `/releases` matches what GitHub shows
