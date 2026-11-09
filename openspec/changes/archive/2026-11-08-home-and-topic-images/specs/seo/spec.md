# Spec Delta

## MODIFIED Requirements

### Requirement: The old topics index redirects to the homepage

`GET /topics` SHALL render the Topics page, the public directory, and SHALL NOT redirect. `/topics/:id` and
`/topics/:id/:slug` SHALL be unaffected.

#### Scenario: The retired index reaches the homepage

- **WHEN** `/topics` is requested
- **THEN** the Topics page renders, with its Featured and Popular sections in the HTML

#### Scenario: A topic page is not redirected

- **WHEN** a public topic's slugged url is requested
- **THEN** the topic page renders as before

### Requirement: The homepage leads crawlers into the public topics

The Topics page SHALL render a visitor's Featured and Popular sections on the server with a row of page links under
each section whose urls name the section's page, so a crawler can follow them through every public Topic. A section
the accordion has closed SHALL still be in the HTML, shown without JavaScript and hidden with it until opened, so its
first page and its page links are reachable too. A browser SHALL show five topics a page, and the HTML SHALL hold up
to fifty, so a reader without JavaScript sees a section of fifty or fewer topics whole and its page links only past
that. Every section on the Topics page SHALL page the same way for a signed-in user. The home page SHALL link the
Topics page and each featured Topic's page in its server-rendered HTML, and the sitemap SHALL list each public Topic's
own page.

#### Scenario: A crawler reaches a topic without running JavaScript

- **WHEN** a client with no JavaScript loads the Topics page
- **THEN** it finds a link to every public Topic, on one page of each section when the section has fifty or fewer

#### Scenario: Paging is a navigation

- **WHEN** a user follows a section's page link
- **THEN** the section shows that page's five topics, the url records the section's page, and the page does not reload

#### Scenario: The home page leads to the directory

- **WHEN** a client with no JavaScript loads `/`
- **THEN** it finds a link to `/topics` and a link to each featured Topic's page

### Requirement: Structured data describes the site and its public topics

The homepage SHALL include `WebSite`, `Organization`, and `SoftwareApplication` JSON-LD, the application's offers built
from the pricing tiers, and an `ItemList` JSON-LD of the featured Topics with each one's position, name, and url. A
public Topic's page SHALL include `CreativeWork` JSON-LD with the Topic's name, description, URL, `dateModified` from
when the Topic last gained a Finding (or its creation time when it has none), the owner as `author`, and CarlNotes as
`publisher` and `isPartOf`, so a crawler reads the Topic as a user's work hosted on the site instead of the site
describing itself. The CreativeWork SHALL include the last succeeded Scan's Findings as a ranked `hasPart` ItemList,
each entry the finding's title and link, and its relevance explanation if it has one. A public Topic's CreativeWork
SHALL name its image. A private or invite Topic's page SHALL include its card preview tags alone, with no CreativeWork.
The persona credit SHALL have `data-nosnippet`, so a search snippet never quotes it as if it described the site.

#### Scenario: The homepage describes the site and the product

- **WHEN** a crawler fetches `/`
- **THEN** the head includes WebSite, Organization, and SoftwareApplication JSON-LD, with offers matching the pricing
  tiers, and an ItemList of the featured Topics

#### Scenario: A topic page describes its work

- **WHEN** a crawler fetches a public Topic's page
- **THEN** the head includes CreativeWork JSON-LD dated to when the Topic last gained a Finding

#### Scenario: A topic page lists its findings

- **WHEN** a crawler fetches a public Topic's page whose last succeeded Scan kept Findings
- **THEN** the CreativeWork includes a hasPart ItemList ranking each Finding with its title, link, and relevance
  explanation

#### Scenario: A finding without an explanation lists no description

- **WHEN** a crawler fetches a public Topic's page whose last succeeded Scan kept a Finding with an empty relevance
  explanation
- **THEN** that Finding's entry in the ItemList has its position, title, and link, and no description

#### Scenario: A non-public topic discloses nothing

- **WHEN** a crawler fetches a private or invite Topic's page
- **THEN** the response includes the card preview tags only, with no CreativeWork and no findings
