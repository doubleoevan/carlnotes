## MODIFIED Requirements

### Requirement: The sitemap lists every public page from live data

`GET /sitemap.xml` SHALL be generated from a live query, never a committed file: the static routes (`/`, `/plans`, `/terms`, `/privacy`), the releases index and every published release's own page, the blog index and every post, and every public shown Topic's page. A Topic that stops qualifying SHALL leave the sitemap on the next request. Profile pages SHALL NOT be listed: they keep their canonical url and preview tags for anyone who shares a link, but a page of a username and two counts is too thin to promote to a crawler.

Documentation pages SHALL NOT be listed. They are built files in the docs site rather than content this route can read, and the docs site emits its own sitemap covering them. Both sitemaps are reachable at the origin, and `robots.txt` continues to point at this one.

#### Scenario: A public topic is listed

- **WHEN** a Topic is public and shown
- **THEN** the sitemap lists its page URL

#### Scenario: The releases index and each release are listed

- **WHEN** the sitemap is fetched
- **THEN** `/releases` appears in it, and so does a `/releases/<tag>` entry for every published, non-prerelease release

#### Scenario: No profile is listed

- **WHEN** the sitemap is fetched
- **THEN** no profile URL appears in it

#### Scenario: No docs page is listed

- **WHEN** the sitemap is fetched
- **THEN** no `/docs` URL appears in it, and the blog index and its posts are still listed

#### Scenario: The docs site publishes its own sitemap

- **WHEN** a crawler looks for the documentation pages
- **THEN** it finds them in the sitemap the docs site emits, with absolute URLs against the production origin

## ADDED Requirements

### Requirement: The site feed carries releases alongside the blog

`GET /feed.xml` SHALL include an item per published, non-prerelease release beside the blog posts it
already carries, ordered newest first across both. Each release item SHALL link to that release's own
page and SHALL be dated by its publication date.

#### Scenario: A published release appears in the feed

- **WHEN** a release has been published and is not a prerelease
- **THEN** `/feed.xml` includes an item for it, ordered by its publication date among the blog items

#### Scenario: A prerelease is withheld from the feed

- **WHEN** a stored release is flagged as a prerelease
- **THEN** no item for it appears in `/feed.xml`

### Requirement: The changelog path redirects to the releases page

`GET /changelog` SHALL respond with a permanent redirect to `/releases`, so that a link written
against the conventional path reaches the page instead of a 404.

#### Scenario: The conventional path reaches the page

- **WHEN** `/changelog` is requested
- **THEN** the response is a permanent redirect to `/releases`
