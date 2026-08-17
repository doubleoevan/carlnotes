## MODIFIED Requirements

### Requirement: The sitemap lists every public page from live data

`GET /sitemap.xml` SHALL be generated from a live query, never a committed file: the static routes (`/`, `/plans`, `/terms`, `/privacy`), the blog index and every post, and every public shown Topic's page. A Topic that stops qualifying SHALL leave the sitemap on the next request. Profile pages SHALL NOT be listed: they keep their canonical url and preview tags for anyone who shares a link, but a page of a username and two counts is too thin to promote to a crawler.

Documentation pages SHALL NOT be listed. They are built files in the docs site rather than content this route can read, and the docs site emits its own sitemap covering them. Both sitemaps are reachable at the origin, and `robots.txt` continues to point at this one.

#### Scenario: A public topic is listed

- **WHEN** a Topic is public and shown
- **THEN** the sitemap lists its page URL

#### Scenario: No profile is listed

- **WHEN** the sitemap is fetched
- **THEN** no profile URL appears in it

#### Scenario: No docs page is listed

- **WHEN** the sitemap is fetched
- **THEN** no `/docs` URL appears in it, and the blog index and its posts are still listed

#### Scenario: The docs site publishes its own sitemap

- **WHEN** a crawler looks for the documentation pages
- **THEN** it finds them in the sitemap the docs site emits, with absolute URLs against the production origin
