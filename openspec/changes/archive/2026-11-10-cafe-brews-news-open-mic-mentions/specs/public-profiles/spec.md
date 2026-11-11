# Spec Delta

## ADDED Requirements

### Requirement: The profile page reads as the person's Café

Customer copy SHALL call the profile page the person's Café, with the accent, and SHALL never say profile: the page's
heading, its title in the head, its share image, the menus, links, tooltips, and emails. The heading SHALL be the
username followed by Café, as in "Evan Café". Identifiers, routes, and the page's url SHALL keep profile.

#### Scenario: The heading names the Café

- **WHEN** anyone opens the profile page of the user named Evan
- **THEN** its heading and its head title read "Evan Café", and its url is still the user-id profile route

#### Scenario: No customer string says profile

- **WHEN** the web app's and the mobile app's customer strings are searched
- **THEN** none says profile for the page, and the page's action that edits the account reads "Edit Café"

### Requirement: The Café's avatar is as tall as a Topic's image on the Topics page

The profile page's header SHALL show the person's avatar at the height the Topics page shows a Topic's image, on the
web and in the mobile app, scaling at phone width as that image does. The person's Café name SHALL sit beside the
avatar, with the summary line of the join month and the follower count under the name. The person SHALL still change
their avatar from it on their own page.

#### Scenario: The avatar matches the Topics page's image height

- **WHEN** a profile page and the Topics page render at the same width
- **THEN** the avatar's height equals a Topic image's height on the Topics page, and the summary line sits beside the
  avatar under the name

### Requirement: The Café lists its sections in a fixed order

The profile page SHALL show, top to bottom: the header, the person's news, Featured Topics, Featured Podcasts,
Featured Posts, the topics table, the teams table, and the Visitors line. A card section with nothing to show SHALL be
absent, and the order of the rest SHALL hold. Each table SHALL always show, an empty one with its line in a card. The
page SHALL show no Open Mic section, since Featured Posts lists every post, and no notice, warning, or guideline text.

#### Scenario: A full Café reads in order

- **WHEN** a visitor opens the profile of a person with public Topics, Podcast Episodes, Topic Posts, and a shown Team
- **THEN** the page shows the header, the news, Featured Topics, Featured Podcasts, Featured Posts, the two tables,
  and the Visitors line, in that order, with no Open Mic section

#### Scenario: A new person's Café is short

- **WHEN** a visitor opens the profile of a person with one public Topic and nothing else
- **THEN** the page shows the header, the news, Featured Topics, the topics table, the teams table with "No public
  teams." in a card, and the Visitors line

### Requirement: One header component serves the web and the mobile app

The profile page's header SHALL be one shared component that the web and the mobile app render through a platform
adapter, holding the avatar, the heading, and the summary line of the join month and the follower count.

#### Scenario: The header is the same on both apps

- **WHEN** a profile page opens on the web and in the mobile app
- **THEN** both show the avatar, the "Evan Café" heading, and the summary line from the one component

### Requirement: The Café's buttons sit in a row under the search bar

The profile page SHALL keep its header's identity row free of buttons, on the web and in the mobile app. A row under
the search bar, above the header, SHALL hold, at the left, New team on the person's own Café or Team Up on anyone else's, and New Topic at the right.

#### Scenario: The owner sees New team and New Topic

- **WHEN** a user opens their own Café
- **THEN** the row under the search bar reads New team at the left and New Topic at the right

#### Scenario: Another person sees Team Up and New Topic

- **WHEN** a user opens someone else's Café
- **THEN** the row under the search bar reads Team Up at the left and New Topic at the right

### Requirement: A Topic's and a Podcast Episode's page open the Home and Featured lists by name

On the page of a public Topic, or of a published Podcast Episode of one, the action menu SHALL offer Home topics or
Home podcasts to an admin, under the home icon, and Featured topics or Featured podcasts to the Topic's owner. Each
option SHALL open the dialog titled as the option reads: the home's pins for Home, and the owner's own profile pins
for Featured, with the page's item offered a place. The mobile app SHALL offer the Featured option the same way.

#### Scenario: An admin who owns the Topic gets both options

- **WHEN** an admin opens the action menu on their own public Topic
- **THEN** the menu lists Home topics under the home icon and Featured topics, and each opens the dialog of that name

#### Scenario: An owner who is no admin gets Featured alone

- **WHEN** a user opens the action menu on their own public Topic
- **THEN** the menu lists Featured topics and no Home topics, and Featured topics opens their own profile's pins

### Requirement: The Café's summary line counts its topics, podcast episodes, and teams

After the join month and the follower count, the profile page's summary line SHALL show how many topics its All
Topics section lists, how many podcast episodes its Featured Podcasts section lists, and how many teams its All Teams
section lists, in that order, each as the reader may see it and each left out at zero. The person's own topic count
SHALL join the line once their topics load. Blocked SHALL stay last.

#### Scenario: The line counts what the page lists

- **WHEN** a visitor opens the Café of a person with five public topics, nine Featured Podcasts cards, and two public
  teams
- **THEN** the summary line reads the join month and the followers, then "5 topics · 9 podcast episodes · 2 teams"

#### Scenario: A count of zero is left out

- **WHEN** a visitor opens the Café of a person on no public team and with no published podcast episode
- **THEN** the summary line ends with the person's topic count

#### Scenario: A blocked person's line still ends with Blocked

- **WHEN** a user opens the Café of a person they blocked
- **THEN** the counts come before the Blocked link

## MODIFIED Requirements

### Requirement: The avatar is the header's account menu, and sign out is its last item

Signed in on desktop, the user's avatar SHALL sit at the far right of the header and SHALL be the trigger for a dropdown. The dropdown SHALL hold a row reading the user's name followed by Café, with the user's own avatar as its icon, linking to the user's own profile page, followed by activity, then account, then the admin console for an admin, and sign out SHALL be its last item.

The account items SHALL leave the primary navigation. Sign out in particular SHALL NOT remain a top-level header control: it is the rarest action in the header and the most costly to hit by accident, so it belongs at the end of a menu the reader has deliberately opened.

On mobile the same items SHALL form one block at the bottom of the existing drawer, below a divider and below the primary navigation, in the same order and ending in sign out. Navigation is used every session and account items rarely are, and the bottom of the drawer is the easiest thumb reach, so the ordering favours the frequent item without burying the rare one.

#### Scenario: The avatar opens the account menu

- **WHEN** a signed-in user views the header on desktop
- **THEN** their avatar sits at the far right and opens a dropdown whose Café row, reading their name and Café beside their avatar, links to their profile page

#### Scenario: Sign out is last

- **WHEN** the dropdown opens
- **THEN** its items read Café, activity, account, admin for an admin, and sign out last

#### Scenario: Sign out leaves the primary navigation

- **WHEN** the header renders for a signed-in user
- **THEN** no top-level sign-out control remains beside the primary navigation

#### Scenario: The drawer carries the same block at the bottom

- **WHEN** a signed-in user opens the mobile drawer
- **THEN** the same items appear as one block below a divider and below the primary navigation, in the same order and ending in sign out

### Requirement: A profile holds the person's topics and their teams

A profile page SHALL show two table sections after its news and Featured sections: the person's Topics, then the
Teams they belong to. The sections SHALL be titled "All Topics" and "All Teams" on every profile, each with its
count at the far right of its title, "N topics" and "N teams", as the card sections show theirs.

The topics section SHALL show the owner's own table on the user's own profile, the one the Activity
page used to hold, with its email and active controls intact. Everyone else SHALL see the
read-only profile table instead, over the Topics they may see.

The teams section SHALL reuse the teams index table. On the user's own profile it SHALL list every
Team they are an active member of, with the index's own controls. Everyone else SHALL see a
read-only table of that person's public Teams where their membership is shown, dropping the columns
that belong to the user's own membership: who invited them, the spend, the chat badge, and the
join and leave controls. A Team the person hid their membership on, and a private Team, SHALL appear
on their own profile alone.

The members and topics subtables a read-only row opens SHALL be read-only too, whatever the person's role in the Team:
no role select, no admit toggle, no remove button, and no Topic removal, since the user is reading someone else's
membership. On the user's own profile the subtables keep the controls their own role grants.

#### Scenario: A visitor reads someone else's profile

- **WHEN** a signed-in user opens another person's profile
- **THEN** the topics section shows the read-only profile table, and the teams section lists only that
  person's public Teams where their membership is shown, with no spend, invited-by, or membership controls

#### Scenario: A hidden membership stays off the public profile

- **WHEN** a member who set their membership hidden on a public Team is viewed by anyone else
- **THEN** that Team is absent from their profile's teams section, and present on their own profile

#### Scenario: A leader's team reads plain on their public profile

- **WHEN** anyone else opens the members or topics subtable of a Team the profile's person leads
- **THEN** the subtable lists the members and Topics with no role select, admit toggle, remove button, or Topic removal
