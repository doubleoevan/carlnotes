# seo Specification

## Purpose
TBD - created by archiving change close-seo-gaps. Update Purpose after archive.
## Requirements
### Requirement: Crawlers are welcomed and pointed at the sitemap

The app SHALL serve `robots.txt` allowing all crawlers and naming the sitemap's absolute URL.

#### Scenario: robots.txt allows crawling

- **WHEN** a crawler fetches `/robots.txt`
- **THEN** it is allowed to crawl and told where `/sitemap.xml` lives

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

### Requirement: Every server-rendered page declares its own canonical URL and title

The shell's hardcoded homepage canonical url and static title SHALL be the fallback only. Every route the sitemap lists SHALL replace both with its own absolute URL and its own title: `{topic name} — CarlNotes` for a Topic, `{username} — CarlNotes` for a profile, `{page name} — CarlNotes` for the SPA-drawn pages (plans, terms, privacy). A page the SPA draws entirely on its own still gets a server handler, because a title set client-side on mount is invisible to a crawler and leaves the shell's homepage canonical url in place, which is the duplicate-content bug this requirement exists to fix.

#### Scenario: A topic page is not a homepage duplicate

- **WHEN** a crawler fetches a public Topic's page
- **THEN** the canonical link names that Topic's own URL and the title names the Topic

#### Scenario: The fallback still stands

- **WHEN** a route without an injecting handler serves the shell
- **THEN** the shell's own canonical url and title answer, exactly one of each

#### Scenario: A listed SPA page is not a homepage duplicate

- **WHEN** a crawler fetches `/plans`, `/terms`, or `/privacy`
- **THEN** the canonical link names that page's own URL and the title names the page, with no script run

### Requirement: Structured data describes the app and its public topics

The homepage SHALL carry `Organization` and `SoftwareApplication` JSON-LD, the application's offers built from the pricing tiers. A public Topic's page SHALL carry `CreativeWork` JSON-LD with the Topic's name, description, URL, `dateModified` from its last succeeded Scan, the owner as `author`, and CarlNotes as `publisher` and `isPartOf`, so a crawler reads the Topic as a user's work hosted on the site rather than the site describing itself. The CreativeWork SHALL carry the last succeeded Scan's Findings as a ranked `hasPart` ItemList — each entry the finding's title, link, and relevance explanation, the same content the scan email shows — so a machine reader gets the page's substance, not just its label. The same list SHALL render as a `noscript` section in the page body — the Topic's name, its description, and the ranked linked Findings — so a crawler that runs no JavaScript reads real content where the SPA shell is otherwise empty; browsers render the SPA instead, so no person ever sees it. A private or invite Topic's page SHALL carry its card preview tags alone: no CreativeWork and no noscript body, since a non-public Topic's page never discloses its work. The persona credit SHALL carry `data-nosnippet`, so a search snippet never quotes it as if it described the site.

#### Scenario: The homepage describes the product

- **WHEN** a crawler fetches `/`
- **THEN** the head carries Organization and SoftwareApplication JSON-LD with offers matching the pricing tiers

#### Scenario: A topic page describes its work

- **WHEN** a crawler fetches a public Topic's page
- **THEN** the head carries CreativeWork JSON-LD dated to the last succeeded Scan

#### Scenario: A topic page lists its findings

- **WHEN** a crawler fetches a public Topic's page whose last succeeded Scan kept Findings
- **THEN** the CreativeWork carries a hasPart ItemList ranking each Finding with its title, link, and relevance explanation

#### Scenario: A script-less crawler reads the findings

- **WHEN** a crawler that runs no JavaScript fetches a public Topic's page
- **THEN** the body's noscript section gives it the Topic's name, description, and the ranked linked Findings

#### Scenario: A non-public topic discloses nothing

- **WHEN** a crawler fetches a private or invite Topic's page
- **THEN** the response carries the card preview tags only, with no CreativeWork and no noscript findings

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

