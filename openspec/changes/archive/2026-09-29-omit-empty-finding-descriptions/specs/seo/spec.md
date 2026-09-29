## MODIFIED Requirements

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
