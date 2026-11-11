# Spec Delta

## ADDED Requirements

### Requirement: The team page's header reads as the team's Franchise

The team page SHALL draw the team's avatar as tall as a Topic's image on the Topics page, on the web and in the mobile
app. Beside the avatar it SHALL show the team's name followed by Franchise as its heading, then how many members and
Topics the team has, then its description. The page's head title SHALL read the same heading. Identifiers, routes, and
the page's url SHALL keep team.

#### Scenario: The heading names the Franchise

- **WHEN** a visitor opens the public team Design Guild, which has four members, two public Topics, and a description
- **THEN** the heading reads "Design Guild Franchise", with "4 members · 2 topics" and the description beside the avatar

### Requirement: The team page features its Topics and their Podcast Episodes as cards

Above its members, the team page SHALL show the Topics the reader may open as cards under Featured Topics, and those
Topics' published Podcast Episodes under Featured Podcasts, as a Café does. The ones their owners pinned SHALL lead by
their profile order, the newer first where two share a position, and the rest SHALL follow in the home's fallback
order. A section with no card SHALL be hidden.

#### Scenario: Two owners' pins share one order

- **WHEN** a team holds one member's Topic pinned first on their Café and another member's Topic pinned first on theirs
- **THEN** both lead the Featured Topics cards, the newer Topic first, ahead of every Topic that no owner pinned

#### Scenario: A visitor sees the public Topics' cards alone

- **WHEN** a visitor opens a public team that holds one public Topic and one private Topic
- **THEN** Featured Topics shows the public Topic's card alone, and Featured Podcasts shows only its Podcast Episodes

#### Scenario: A pending invitee sees the public Topics' cards alone

- **WHEN** a user with a pending invite opens a team that holds one public Topic and one private Topic
- **THEN** the topics table lists both, and the cards show the public Topic's alone

### Requirement: The team page's buttons sit in a row under the search bar

The team page SHALL keep its header's identity row free of buttons, on the web and in the mobile app. A row under the
search bar, above the header, SHALL hold Add Member at the left for a member, or Join Team for anyone else, and at the right Add Topic for a leader,
or New Topic for anyone else. The All Topics title SHALL hold no button.

#### Scenario: A leader sees Add Member and Add Topic

- **WHEN** a leader opens their team's page
- **THEN** the row under the search bar reads Add Member at the left and Add Topic at the right

#### Scenario: A visitor sees Join Team and New Topic

- **WHEN** someone who is not on the team opens its public page
- **THEN** the row under the search bar reads Join Team at the left and New Topic at the right

### Requirement: The team page features its Topics' Topic Posts as cards

Directly below Featured Podcasts, the team page SHALL show every published Topic Post of the Topics the reader may
open as cards under Featured Posts, on the web and in the mobile app, six a page under the whole count. The ones their
authors pinned on their Cafés SHALL lead by their profile order, the newer first where two share a position, and every
other post SHALL follow, newest first. A team SHALL hold no pins of its own, and a section with no card SHALL be
hidden.

#### Scenario: An author's pin leads the team's posts

- **WHEN** a team holds a Topic with two published Topic Posts, and the author of the older one pinned it on their Café
- **THEN** Featured Posts leads with the pinned post, and the newer post of that Topic follows it

#### Scenario: A team lists more than twelve posts

- **WHEN** a member opens a team whose Topics hold fourteen published Topic Posts
- **THEN** Featured Posts reads "14 posts" and pages through all fourteen, six a page

#### Scenario: A visitor sees the public Topics' posts alone

- **WHEN** a visitor opens a public team that holds a public Topic and a private Topic, each with a published Topic Post
- **THEN** Featured Posts shows the public Topic's post alone

#### Scenario: A team with no post shows no section

- **WHEN** none of a team's Topics that the reader may open has a published Topic Post
- **THEN** the team page shows no Featured Posts section, and its action menu holds no posts option

### Requirement: The team page's summary line counts its podcast episodes and notes

After its members and topics, the team page's summary line SHALL show how many podcast episodes its Featured
Podcasts section lists and how many notes its Team notes section lists for the reader, each left out at zero, on the
web and in the mobile app. The note count SHALL join the line once the notes load.

#### Scenario: The line counts the podcast episodes and the notes

- **WHEN** a member opens a team page with three members, one topic, four Featured Podcasts cards, and two notes
- **THEN** the summary line reads "3 members · 1 topic · 4 podcast episodes · 2 notes"

#### Scenario: A team with no note shows no note count

- **WHEN** a visitor opens a public team's page that lists one podcast episode and no note the visitor may read
- **THEN** the summary line ends with "1 podcast episode"

## MODIFIED Requirements

### Requirement: The team page is the profile template pointed at a Team

The team page SHALL reuse the profile page's layout, topic table, and follower count, adding the members and, for a leader, membership and role management, attach and detach, and the public toggle. The topic table SHALL be the profile page's own component over the same row contract — Topic, Created, Updated, Visibility, Followers, and Kept / reviewed, with the mention badges and totals — so the two pages never drift, and no creator's plan name appears anywhere on it. For a leader alone it adds an Active column: its header's tooltip reads "Active team topics", its toggle detaches the topic with a "Deactivate <topic>" tooltip, and the X beside it detaches the same way. The members table's Active column includes the matching tooltips — "Active team members" on the header, and "Activate <member>" or "Deactivate <member>" on the toggle by its state. Its sections SHALL be titled Team members, All Topics, and Team notes, each with its count at the far right as every page section's is.

#### Scenario: The topic table matches the profile page

- **WHEN** a member views the team page's topic table
- **THEN** it shows the profile page's columns and totals over the same rows contract, with the Active column added only for a leader

#### Scenario: Leader controls are leader-only

- **WHEN** a member who is not a leader views the team page
- **THEN** the members and Topics render without membership, attach, detach, or visibility controls
