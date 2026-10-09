# seo Specification

## Purpose
TBD - created by archiving change close-seo-gaps. Update Purpose after archive.
## Requirements
### Requirement: Crawlers are welcomed and pointed at the sitemap

The app SHALL serve `robots.txt` allowing all crawlers everywhere but the sign-in and sign-up paths, which it SHALL
disallow, and naming the sitemap's absolute URL. Those pages are `noindex` already, and disallowing them stops a
crawler from fetching the sign-in url that every page links with its own `next` param.

#### Scenario: robots.txt allows crawling

- **WHEN** a crawler fetches `/robots.txt`
- **THEN** it is allowed to crawl and told where `/sitemap.xml` lives

#### Scenario: robots.txt keeps crawlers off the sign-in pages

- **WHEN** a crawler fetches `/robots.txt`
- **THEN** it reads `Disallow: /login` and `Disallow: /signup`

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

### Requirement: Every page declares its own canonical URL and title

Every route the sitemap lists, and every profile with a public Topic, SHALL declare its own absolute canonical URL and its own title: `{topic name} — CarlNotes` for a Topic, `{team name} — CarlNotes` for a team, `{username} — CarlNotes` for a profile, `{page name} — CarlNotes` for the public topics, plans, terms, and privacy pages. The site-wide title in `__root.tsx` SHALL be the homepage's title and the fallback for a page with no subject of its own, and any page but the homepage that uses the fallback SHALL declare no canonical url.

#### Scenario: A topic page is not a homepage duplicate

- **WHEN** a crawler fetches a public Topic's page
- **THEN** the canonical link names that Topic's own URL and the title names the Topic

#### Scenario: A page with no subject keeps the site-wide head

- **WHEN** a crawler fetches a page other than the homepage whose route declares no head of its own
- **THEN** the site-wide title is in the HTML, exactly once, and no canonical link

#### Scenario: The plans, terms, and privacy pages are not homepage duplicates

- **WHEN** a crawler fetches `/plans`, `/terms`, or `/privacy`
- **THEN** the canonical link names that page's own URL, the title names the page, and the page's own description and card title and url are in the head, with no script run

Each page the sitemap lists, and every profile page, SHALL also declare its own meta description, written from that page's own subject instead of shared across the site. A public Topic's description SHALL come from the summary of its latest succeeded scan that kept a Finding, or from the Topic's prompt when no such scan has written one, or from its name when both are empty, as plain words with the markdown removed, clipped to 160 characters on a word boundary. The site-wide description SHALL remain only on the homepage and on pages that are left out of search results or have no subject of their own.

#### Scenario: A public topic describes itself

- **WHEN** a crawler reads a public Topic page
- **THEN** its meta description is written from that Topic's own text, and differs from the site-wide description

#### Scenario: A topic with no scan summary falls back to its prompt

- **WHEN** a public Topic has no succeeded scan to summarize
- **THEN** its meta description is written from the Topic's prompt

#### Scenario: A description has no markdown

- **WHEN** a scan summary includes links, emphasis, headings, or list marks
- **THEN** the meta description has the summary's words without the markdown

### Requirement: A finding's link is marked as user content

Every link to a finding's source SHALL open in a new tab and have `rel="noopener ugc"`. Anyone can create a public Topic and choose its Sources, so a finding's link is user content: it stays in the page, visible and crawlable, and search engines read it as a link the site does not vouch for. It SHALL NOT include `noreferrer`, so the linked site sees the visit come from CarlNotes. A link the site itself chose, such as the footer's, is not marked.

#### Scenario: A public topic's finding links are user content

- **WHEN** a client with no JavaScript loads a public Topic page
- **THEN** every finding link in the page has `rel="noopener ugc"` and opens in a new tab

### Requirement: A topic url includes a slug and redirects to the current slug

A Topic's url SHALL be its id followed by a url-safe form of its name, as `/topics/<id>/<slug>`, or its id alone when the name has no url-safe characters. The id SHALL remain what resolves the Topic, so a renamed Topic keeps working and the api's routes take the id alone.

A request by id alone or with a stale slug SHALL redirect permanently to the Topic's current url, and a request for the current url SHALL NOT redirect. The sitemap, the canonical, the card url, the emails, and every link a server-rendered page includes SHALL use the current url. A link built from an id alone, such as a navigation right after a Topic is created, SHALL reach the current url through the redirect.

#### Scenario: A url by id alone redirects to the slugged url

- **WHEN** a request arrives by id alone for a Topic whose name has url-safe characters
- **THEN** it redirects permanently to that Topic's current slugged url

#### Scenario: A renamed topic redirects from its old slug

- **WHEN** a request arrives with a slug that no longer matches the Topic's name
- **THEN** it redirects permanently to the current slugged url, and the Topic still resolves

#### Scenario: A name with no url-safe characters keeps the id url

- **WHEN** a request arrives by id alone for a Topic whose name has no url-safe characters
- **THEN** the page renders without a redirect, and `/topics/<id>` is its canonical url when the Topic is public and has at least `MINIMUM_SHOWN_FINDINGS` Findings

### Requirement: Search engines are told when a public topic changes

The app SHALL notify IndexNow when a Topic is created public, when an edit makes a Topic public, when a rename moves a public Topic's url, and when a Scan that runs to the end changes what a public Topic shows, and SHALL serve the key file that IndexNow verifies at the site root. A rename SHALL send the old url beside the new one, so the engine finds the redirect. An edit that makes a public Topic private or invite, and the deletion of a public Topic, SHALL send its old url, so the engine drops it. Every edit path SHALL notify alike: the topic editor, the chat, and the MCP tools.

A Scan SHALL count as changing a Topic when it added or removed at least one Finding on it. A Scan that only re-scored the Findings the Topic already had SHALL NOT notify.

A failed notification SHALL NOT fail the Scan.

#### Scenario: A scan that changed a public topic notifies

- **WHEN** a Scan adds or removes a Finding on a public Topic
- **THEN** IndexNow is notified of that Topic's url

#### Scenario: A scan that changed nothing stays quiet

- **WHEN** a Scan on a public Topic succeeds without adding or removing a Finding
- **THEN** IndexNow is not notified

#### Scenario: A failed notification does not fail the scan

- **WHEN** the IndexNow request is rejected or times out
- **THEN** the Scan finishes as it otherwise would

#### Scenario: A public topic that leaves the index notifies its old url

- **WHEN** an edit makes a public Topic private, or a public Topic is deleted
- **THEN** IndexNow is notified of the url the Topic had

#### Scenario: A renamed public topic notifies both urls

- **WHEN** an edit renames a public Topic so its slug changes
- **THEN** IndexNow is notified of the new url and the old one

### Requirement: A page that is not there responds as missing

A request for a Topic, profile, or team that does not exist SHALL respond with status 404, so a search engine drops the url instead of indexing an empty page, and SHALL render the page itself, so a browser shows the page's own missing message.

#### Scenario: A missing topic is a 404

- **WHEN** a client requests a Topic page for an id that resolves to no Topic
- **THEN** the response status is 404, and in a browser the page shows the missing-topic message

### Requirement: Pages with nothing to rank are kept out of search results

The sign-in, sign-up, and password reset pages, the pages behind the `_signedIn` layout (`/account`, `/activity`,
`/admin`, `/mcp/consent`), the teams list, a private team's page, and an invite link that does not resolve SHALL declare
`robots` `noindex, follow`, a live invite link and a Topic page that is not public SHALL declare `noindex, nofollow`,
and the sign-in, sign-up, password reset, and teams list pages SHALL also declare their own title. A public Topic with
fewer than `MINIMUM_SHOWN_FINDINGS` Findings SHALL be `noindex` and SHALL declare no canonical url until it has them. A
team or a profile with no public Topic SHALL be `noindex`, SHALL declare no canonical url, and SHALL be left out of the
sitemap, and a team's public Topic count SHALL include the public Topics shared with it. `llms.txt`, `llms-full.txt`,
and `security.txt` SHALL be served with an `X-Robots-Tag: noindex` header, and the sitemap SHALL list pages only. The
header's sign-in and sign-up links SHALL be `rel="nofollow"`, so a crawler does not discover one sign-in url per page.
The links SHALL keep their `next` param for the user.

#### Scenario: A sign-in page is not indexed

- **WHEN** a crawler fetches `/login`
- **THEN** the page declares `noindex, follow` and the title names the page

#### Scenario: A public topic below the findings minimum is not indexed

- **WHEN** a crawler fetches a public Topic with fewer than `MINIMUM_SHOWN_FINDINGS` Findings
- **THEN** the page declares `noindex` and no canonical url, and keeps its card and its feed link

#### Scenario: An empty profile is not indexed

- **WHEN** a crawler fetches the profile of a user with no public Topic
- **THEN** the page declares `noindex` and no canonical url, and the sitemap does not list it

#### Scenario: The sign-in link is not followed

- **WHEN** a crawler reads any page's header as a visitor
- **THEN** the sign-in and sign-up links have `rel="nofollow"` and still name the page in their `next` param

### Requirement: The sitemap and structured data date a topic by its content

A public Topic's sitemap `lastmod` and its structured data's `dateModified` SHALL be when the Topic last gained a Finding, or when it was created when it has none, so a follow or a settings edit does not announce a change.

#### Scenario: A settings edit leaves the date alone

- **WHEN** an owner edits a public Topic's frequency
- **THEN** the Topic's `lastmod` in the sitemap is unchanged

### Requirement: A page url never ends in a slash

A request for any page path longer than `/` that ends in a slash, other than a `/docs` path, SHALL redirect permanently to the same path without it, keeping the query. The docs site keeps its own trailing-slash urls.

#### Scenario: A trailing slash redirects

- **WHEN** a client requests `/topics/?popular=2`
- **THEN** it is redirected permanently to `/topics?popular=2`

### Requirement: Feeds and the site's name are discoverable

Every page the ui renders, and every blog and release page, SHALL link the site-wide feed as an RSS alternate, and a public Topic's page SHALL also link its own feed. The homepage SHALL declare `WebSite` structured data with the site's name and url.

#### Scenario: A topic page links its feed

- **WHEN** a crawler reads a public Topic page
- **THEN** the head links the site-wide feed and the Topic's own feed as RSS alternates

### Requirement: The sitemap lists every page worth ranking from live data

`GET /sitemap.xml` SHALL be generated from a live query, never a committed file, and SHALL list pages only: the static
routes (`/`, `/topics`, `/plans`, `/terms`, `/privacy`), the releases index and every published release's own page, the
blog index and every post, every public shown Topic's page at its slugged url, the page of every published Podcast
Episode of a public shown Topic, and every public team with at least one public Topic, owned or shared with it. A
Podcast Episode page's `lastmod` SHALL be when the Podcast Episode published. A Topic that stops qualifying SHALL leave
the sitemap on the next request, and its Podcast Episode pages SHALL leave with it. Profile pages SHALL NOT be listed: a
profile with a public Topic keeps its canonical url, every profile keeps its preview tags for anyone who shares a link,
and a page of a username and two counts is too thin to promote to a crawler.

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

### Requirement: Structured data describes the site and its public topics

The homepage SHALL include `WebSite`, `Organization`, and `SoftwareApplication` JSON-LD, the application's offers built from the pricing tiers. A public Topic's page SHALL include `CreativeWork` JSON-LD with the Topic's name, description, URL, `dateModified` from when the Topic last gained a Finding (or its creation time when it has none), the owner as `author`, and CarlNotes as `publisher` and `isPartOf`, so a crawler reads the Topic as a user's work hosted on the site instead of the site describing itself. The CreativeWork SHALL include the last succeeded Scan's Findings as a ranked `hasPart` ItemList, each entry the finding's title and link, and its relevance explanation if it has one. A private or invite Topic's page SHALL include its card preview tags alone, with no CreativeWork. The persona credit SHALL have `data-nosnippet`, so a search snippet never quotes it as if it described the site.

#### Scenario: The homepage describes the site and the product

- **WHEN** a crawler fetches `/`
- **THEN** the head includes WebSite, Organization, and SoftwareApplication JSON-LD, with offers matching the pricing tiers

#### Scenario: A topic page describes its work

- **WHEN** a crawler fetches a public Topic's page
- **THEN** the head includes CreativeWork JSON-LD dated to when the Topic last gained a Finding

#### Scenario: A topic page lists its findings

- **WHEN** a crawler fetches a public Topic's page whose last succeeded Scan kept Findings
- **THEN** the CreativeWork includes a hasPart ItemList ranking each Finding with its title, link, and relevance explanation

#### Scenario: A finding without an explanation lists no description

- **WHEN** a crawler fetches a public Topic's page whose last succeeded Scan kept a Finding with an empty relevance explanation
- **THEN** that Finding's entry in the ItemList has its position, title, and link, and no description

#### Scenario: A non-public topic discloses nothing

- **WHEN** a crawler fetches a private or invite Topic's page
- **THEN** the response includes the card preview tags only, with no CreativeWork and no findings

### Requirement: A public Topic's page declares its podcast series and links its podcast feed

A public Topic's page SHALL, if the Topic has a published Podcast Episode, include `PodcastSeries` JSON-LD with the
series name, description, url, image, and its podcast feed as `webFeed`, and SHALL link the podcast feed in its head as
an RSS alternate beside the Topic's own feed. A private or invite Topic's page SHALL include neither.

#### Scenario: A public topic with podcast episodes declares its series

- **WHEN** a crawler reads a public Topic page whose Topic has a published Podcast Episode
- **THEN** the head includes PodcastSeries JSON-LD naming the podcast feed, and links that feed as an RSS alternate

#### Scenario: A public topic without podcast episodes declares none

- **WHEN** a crawler reads a public Topic page whose Topic has no published Podcast Episode
- **THEN** the head has no PodcastSeries JSON-LD and no podcast feed link

#### Scenario: A private topic declares none

- **WHEN** anyone reads a private or invite Topic's page
- **THEN** the head has no PodcastSeries JSON-LD and no podcast feed link

### Requirement: llms.txt lists the newest public Podcast Episodes

`GET /llms.txt` SHALL list the newest published Podcast Episodes of public shown Topics, 50 at most, newest first, in a
section headed "Coffee Break podcast with Carl and Vienna" after the Topics section. Each line SHALL link the Podcast
Episode's title to its own page and SHALL give its description. A Podcast Episode of a private or invite Topic SHALL
never be listed, and the section SHALL be left out if no public Podcast Episode has published.

#### Scenario: A public Podcast Episode is listed

- **WHEN** a public Topic's Podcast Episode has published and llms.txt is fetched
- **THEN** the "Coffee Break podcast with Carl and Vienna" section has a line that links the Podcast Episode's title to
  its page, with its description

#### Scenario: No Podcast Episode, no section

- **WHEN** no public Topic has a published Podcast Episode and llms.txt is fetched
- **THEN** it has no "Coffee Break podcast with Carl and Vienna" section

### Requirement: The old topics index redirects to the homepage

`GET /topics` SHALL respond with a permanent redirect to `/`, so a link or a search result written against the retired
index reaches the homepage, whose Featured and Popular sections list the public topics. `/topics/:id` and
`/topics/:id/:slug` SHALL be unaffected.

#### Scenario: The retired index reaches the homepage

- **WHEN** `/topics` is requested
- **THEN** the response is a permanent redirect to `/`

#### Scenario: A topic page is not redirected

- **WHEN** a public topic's slugged url is requested
- **THEN** the topic page renders as before

### Requirement: The homepage leads crawlers into the public topics

The homepage SHALL render a visitor's Featured and Popular sections on the server with a row of page links under each
section whose urls name the section's page, so a crawler can follow them through every public Topic. A section the
accordion has closed SHALL still be in the HTML, shown without JavaScript and hidden with it until opened, so its
first page and its page links are reachable too. A browser SHALL show five topics a page, and the HTML SHALL hold up
to fifty, so a reader without JavaScript sees a section of fifty or fewer topics whole and its page links only past
that. Every section on the homepage SHALL page the same way for a signed-in user. No page SHALL list the public
topics on their own, and the sitemap SHALL list each public Topic's own page instead.

#### Scenario: A crawler reaches a topic without running JavaScript

- **WHEN** a client with no JavaScript loads the homepage
- **THEN** it finds a link to every public Topic, on one page of each section when the section has fifty or fewer

#### Scenario: Paging is a navigation

- **WHEN** a user follows a section's page link
- **THEN** the section shows that page's five topics, the url records the section's page, and the page does not reload

### Requirement: A paged list holds up to fifty rows for a reader without JavaScript

A server-rendered public page SHALL hold up to fifty rows of each of its paged tables and lists in its HTML, and show a
browser the page size the component chooses, hiding the rest with JavaScript: the homepage's Featured and Popular
sections, a public topic page's findings, scan history, and podcast episodes, the topic table of a public team page and
of a profile page, a team page's members, and a page's notes. The server and the browser SHALL render the same markup,
so the page a crawler indexes is the page a visitor sees, and no reader SHALL be told apart by its user agent.

#### Scenario: A reader without JavaScript sees a topic's findings whole

- **GIVEN** a public Topic with twenty Findings
- **WHEN** a client with no JavaScript fetches its page
- **THEN** all twenty Findings are in the HTML, and a browser sees five with an expander

#### Scenario: A browser keeps its page sizes

- **WHEN** a browser fetches the same page
- **THEN** each table shows the component's own page size, with page links for the rest

