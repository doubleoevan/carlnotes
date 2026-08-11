## MODIFIED Requirements

### Requirement: The owner publishes a Topic by setting its visibility

The edit-topic modal's visibility field SHALL be the publish control: it sets `topics.visibility` (public, invite, or private) through the topic-update endpoint, authorized through the gate like every other Topic write, with no dedicated visibility endpoint. An invite Topic stays unlisted — off the homepage, its URL gated by the invited-email list. Demoting a public Topic to private SHALL leave its subscription rows in place: they simply stop resolving, since a private Topic rejects everyone but the owner, and nothing is deleted, so re-publishing restores the previous subscribers.

A new Topic SHALL start private, and MAY be made public at any time, including at creation while it still holds nothing. The Finding minimum SHALL sit on being shown rather than on the visibility flag: a public Topic holding fewer than three Findings SHALL be withheld from the Featured and Popular sections and from its owner's profile table, while its own URL still opens. This still stops an empty Topic being farmed to carry links, because what a link farm needs is to be shown, not the flag. Three clears on one successful Scan at the smallest max-results setting, so a real owner waits no longer than their first Scan.

The preview card and the feed SHALL serve every public Topic whatever it holds. Both are reached only by following the Topic's own link, so the minimum buys nothing there and costs the Topic its first impression: a platform caches whatever card it is served when a link is pasted, and a reader app that is refused a feed creates no subscription to retry with.

#### Scenario: Publishing opens the Topic
- **WHEN** the owner sets a private Topic's visibility to public
- **THEN** the Topic appears on the public read path and its findings are browsable

#### Scenario: Demoting keeps subscription rows inert
- **WHEN** the owner sets a public Topic with subscribers back to private and later re-publishes it
- **THEN** no subscription row is deleted, subscribers see nothing while private, and re-publishing restores their access

#### Scenario: A non-owner cannot change visibility
- **WHEN** a signed-in user who is neither the owner nor an admin submits a visibility change through the topic-update endpoint
- **THEN** the api rejects it

#### Scenario: A new Topic starts private
- **WHEN** a Topic is created without its visibility being changed
- **THEN** it is private

#### Scenario: A Topic may be made public while it holds nothing
- **WHEN** a Topic holding no Findings is set to public
- **THEN** the api accepts it, and the Topic is simply shown nowhere yet

#### Scenario: A public Topic below the minimum is not shown
- **GIVEN** a public Topic holding fewer than three Findings
- **WHEN** a stranger browses Featured or Popular, or opens the owner's profile
- **THEN** the Topic appears in none of them, while its own URL still opens

#### Scenario: The preview card and the feed ignore the minimum
- **GIVEN** a public Topic holding fewer than three Findings
- **WHEN** a platform fetches the Topic's preview card, or a reader app fetches its feed
- **THEN** both are served, the feed carrying a channel with no items

#### Scenario: One successful Scan shows the Topic
- **GIVEN** a public Topic whose first Scan kept at least three Findings
- **WHEN** the same places are read again
- **THEN** the Topic appears in them
