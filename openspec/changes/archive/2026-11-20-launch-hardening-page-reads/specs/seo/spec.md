## MODIFIED Requirements

### Requirement: The sitemap lists every page worth ranking from live data

`GET /sitemap.xml` SHALL be generated from a live query, never a committed file, read through the Redis store's
read-through cache with a short time to live, so a request inside it sends no query whatever its query string. It SHALL
list pages only: the static routes (`/`, `/topics`, `/plans`, `/terms`, `/privacy`), the releases index and every
published release's own page, the blog index and every post, every public shown Topic's page at its slugged url, the
page of every published Podcast Episode of a public shown Topic, and every public team with at least one public Topic,
owned or shared with it. A Podcast Episode page's `lastmod` SHALL be when the Podcast Episode published. A Topic that
stops qualifying SHALL leave the sitemap once the cached copy ends, and its Podcast Episode pages SHALL leave with it.
Profile pages SHALL NOT be listed: a profile with a public Topic keeps its canonical url, every profile keeps its
preview tags for anyone who shares a link, and a page of a username and two counts is too thin to promote to a crawler.

Documentation pages SHALL NOT be listed. They are built files in the docs site instead of content this route can read,
and the docs site emits its own sitemap covering them. Both sitemaps are reachable at the origin, and `robots.txt`
continues to point at this one.

#### Scenario: A public topic is listed

- **WHEN** a Topic is public and shown
- **THEN** the sitemap lists its page URL

#### Scenario: A public topic's podcast episode pages are listed

- **WHEN** a public shown Topic has a published Podcast Episode
- **THEN** the sitemap lists the Podcast Episode's page URL with the publish time as its `lastmod`

#### Scenario: A private topic's podcast episodes are not listed

- **WHEN** a private or invite Topic has published Podcast Episodes
- **THEN** the sitemap lists none of them

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

#### Scenario: A repeated request reads the cache

- **WHEN** the sitemap is requested twice inside the cache's time to live, the second time with a new query string
- **THEN** the second request sends no query and returns the same list

#### Scenario: A Topic made private leaves when the copy ends

- **WHEN** an owner makes a listed Topic private
- **THEN** the sitemap built after the cached copy ends lists neither its page nor its Podcast Episode pages

### Requirement: llms.txt lists the newest public Podcast Episodes

`GET /llms.txt` SHALL list the newest published Podcast Episodes of public shown Topics, 50 at most, newest first, in a
section headed "Coffee Break podcast with Carl and Vienna" after the Topics section. Each line SHALL link the Podcast
Episode's title to its own page and SHALL give its description. A Podcast Episode of a private or invite Topic SHALL
never be listed, and the section SHALL be left out if no public Podcast Episode has published. The file's Topics and
Podcast Episodes SHALL be read through the Redis store's read-through cache with a short time to live, as the sitemap's
are, so a request inside it sends no query.

#### Scenario: A public Podcast Episode is listed

- **WHEN** a public Topic's Podcast Episode has published and llms.txt is fetched
- **THEN** the "Coffee Break podcast with Carl and Vienna" section has a line that links the Podcast Episode's title to
  its page, with its description

#### Scenario: No Podcast Episode, no section

- **WHEN** no public Topic has a published Podcast Episode and llms.txt is fetched
- **THEN** it has no "Coffee Break podcast with Carl and Vienna" section

#### Scenario: A repeated llms.txt request reads the cache

- **WHEN** llms.txt is requested twice inside the cache's time to live
- **THEN** the second request sends no query
