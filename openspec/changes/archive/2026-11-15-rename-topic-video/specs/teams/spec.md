## REMOVED Requirements

### Requirement: The team page features its Topics and their Podcast Episodes as cards

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "The team page shows its Topics and their Podcast Episodes as cards"

### Requirement: The team page features its Topics' Topic Posts as cards

**Reason**: the requirement says feature, never pin, for an item featured on the home or a profile
**Migration**: replaced by "The team page shows its Topics' Topic Posts as cards"

## ADDED Requirements

### Requirement: The team page shows its Topics and their Podcast Episodes as cards

Above its members, the team page SHALL show the Topics the reader may open as cards under Featured Topics, and those
Topics' published Podcast Episodes under Featured Podcasts, as a Café does. The ones their owners featured SHALL lead by
their profile order, the newer first where two share a position, and the rest SHALL follow in the home's fallback
order. A section with no card SHALL be hidden.

#### Scenario: Two owners' featured items share one order

- **WHEN** a team holds one member's Topic featured first on their Café and another member's Topic featured first on
  theirs
- **THEN** both lead the Featured Topics cards, the newer Topic first, ahead of every Topic that no owner featured

#### Scenario: A visitor sees the public Topics' cards alone

- **WHEN** a visitor opens a public team that holds one public Topic and one private Topic
- **THEN** Featured Topics shows the public Topic's card alone, and Featured Podcasts shows only its Podcast Episodes

#### Scenario: A pending invitee sees the public Topics' cards alone

- **WHEN** a user with a pending invite opens a team that holds one public Topic and one private Topic
- **THEN** the topics table lists both, and the cards show the public Topic's alone

### Requirement: The team page shows its Topics' Topic Posts as cards

Directly below Featured Podcasts, the team page SHALL show every published Topic Post of the Topics the reader may open
as cards under Featured Posts, on the web and in the mobile app, six a page under the whole count. The ones their
authors featured on their Cafés SHALL lead by their profile order, the newer first where two share a position, and every
other post SHALL follow, newest first. A team SHALL hold no featured items of its own, and a section with no card SHALL
be hidden.

#### Scenario: An author's featured item leads the team's posts

- **WHEN** a team holds a Topic with two published Topic Posts, and the author of the older one featured it on their
  Café
- **THEN** Featured Posts leads with the featured post, and the newer post of that Topic follows it

#### Scenario: A team lists more than twelve posts

- **WHEN** a member opens a team whose Topics hold fourteen published Topic Posts
- **THEN** Featured Posts reads "14 posts" and pages through all fourteen, six a page

#### Scenario: A visitor sees the public Topics' posts alone

- **WHEN** a visitor opens a public team that holds a public Topic and a private Topic, each with a published Topic Post
- **THEN** Featured Posts shows the public Topic's post alone

#### Scenario: A team with no post shows no section

- **WHEN** none of a team's Topics that the reader may open has a published Topic Post
- **THEN** the team page shows no Featured Posts section, and its action menu holds no posts option
