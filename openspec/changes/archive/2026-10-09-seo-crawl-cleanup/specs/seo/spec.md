## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: The public topics page and the homepage lead crawlers into the public topics

**Reason**: Nothing linked to `/topics`, and the homepage's paged sections, the sitemap, and llms.txt already lead a
crawler to every public Topic.

**Migration**: See "The homepage leads crawlers into the public topics" and "The old topics index redirects to the
homepage".
