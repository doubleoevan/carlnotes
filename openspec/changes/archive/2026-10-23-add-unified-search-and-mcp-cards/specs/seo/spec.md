## MODIFIED Requirements

### Requirement: Pages with nothing to rank are kept out of search results

The sign-in, sign-up, and password reset pages, the pages behind the `_signedIn` layout (`/account`, `/activity`,
`/admin`, `/mcp/consent`), the teams list, the search page `/search`, a private team's page, and an invite link that
does not resolve SHALL declare `robots` `noindex, follow`, a live invite link and a Topic page that is not public SHALL
declare `noindex, nofollow`, and the sign-in, sign-up, password reset, teams list, and search pages SHALL also declare
their own title. The search page SHALL NOT be listed in the sitemap, `llms.txt`, or `llms-full.txt`, with any query. A
public Topic with fewer than `MINIMUM_SHOWN_FINDINGS` Findings SHALL be `noindex` and SHALL declare no canonical url
until it has them. A team or a profile with no public Topic SHALL be `noindex`, SHALL declare no canonical url, and
SHALL be left out of the sitemap, and a team's public Topic count SHALL include the public Topics shared with it.
`llms.txt`, `llms-full.txt`, and `security.txt` SHALL be served with an `X-Robots-Tag: noindex` header, and the
sitemap SHALL list pages only. The header's sign-in and sign-up links SHALL be `rel="nofollow"`, so a crawler does not
discover one sign-in url per page. The links SHALL keep their `next` param for the user.

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

#### Scenario: A search page is not indexed

- **WHEN** a crawler fetches `/search?q=orbit`
- **THEN** the page declares `noindex, follow` and the title "Search", and no sitemap or llms file names a `/search`
  url
