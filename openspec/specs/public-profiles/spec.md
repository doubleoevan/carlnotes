# public-profiles Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.

## Requirements

### Requirement: Reader-facing copy says follow; code and schema say subscribe

Reader-facing copy SHALL say follow and follower everywhere. The code and schema SHALL keep subscribe, subscription, and subscriber.

This SHALL be a one-way seam. The tables SHALL NOT be renamed, and `follow` SHALL NOT appear in an identifier, column, route, or type name. Translation happens at the rendering edge only.

#### Scenario: Copy follows, code subscribes

- **WHEN** a follower count renders on a profile
- **THEN** the reader sees "followers" and the value comes from a subscriber count in the schema

#### Scenario: The seam does not leak inward

- **WHEN** an identifier is introduced for this feature
- **THEN** it uses subscribe/subscription/subscriber, never follow

### Requirement: A public profile page lives at a user-id route

A user's profile SHALL be public and served at a route keyed by their user id, the same way a Topic's page is keyed by its Topic id. It SHALL show the user's avatar, username, join month, and follower count, followed by a table of that user's public Topics.

Keying on the id rather than the username is what makes a username display-only: no link points at a name, so a name MAY be changed as often as its owner likes, with no history, no hold, and no limit. It also keeps usernames out of the root namespace, so a new top-level route SHALL NOT need any reservation before it ships.

#### Scenario: Renaming moves nothing

- **WHEN** a user changes their username, repeatedly
- **THEN** every existing link to their profile still resolves and shows the name they hold now

#### Scenario: A profile is readable signed out

- **WHEN** a signed-out visitor opens a user's profile route
- **THEN** the profile renders with the avatar, username, join month, follower count, and the user's public Topics

#### Scenario: Only public Topics are listed

- **WHEN** a user owns private and invite Topics alongside public ones
- **THEN** only the public Topics holding the Finding minimum appear on their profile

### Requirement: The header counts distinct people and the footer counts subscriptions

The profile header's follower count SHALL be the number of **distinct people** following the user's Topics. A person following three of that user's Topics SHALL count once. The owner's own implicit subscription to their own Topics SHALL be excluded.

The Topic table SHALL carry the columns: topic, created, updated, followers, and findings kept over findings reviewed. Its footer row SHALL sum the columns.

The two follower figures legitimately disagree: the footer sums rows, so a reader adding the column themselves gets it, while the header counts people and will be the smaller number whenever anyone follows more than one of the user's Topics. The header is the one that names what it counts.

#### Scenario: One person following three Topics counts once in the header

- **GIVEN** an owner with three public Topics and one person following all three
- **WHEN** their profile renders
- **THEN** the header shows one follower

#### Scenario: The footer sums what the column shows

- **WHEN** the same profile's table footer renders
- **THEN** it shows the sum of the follower column, which a reader adding the column themselves arrives at

#### Scenario: The owner's own subscription never counts

- **WHEN** an owner's follower count is computed
- **THEN** their own subscription to their own Topic is excluded from both the header figure and the column

### Requirement: Follower counts are shown as they are

A follower count SHALL render as its number, including zero. A public Topic's follower count is not sensitive, and a
reader who can add a column themselves is owed the figure that column sums to. The header's count SHALL carry its noun
in the number's form: `1 follower`, and `followers` for zero and for two or more.

#### Scenario: A zero count renders as zero

- **WHEN** a profile's table renders a Topic nobody follows yet
- **THEN** that row's follower cell reads 0, and the column and its footer cell render like any other

#### Scenario: One follower reads singular

- **WHEN** a profile whose Topics exactly one person follows renders its header
- **THEN** the header reads `1 follower`, and a profile with none or with two reads `followers`

### Requirement: A profile shows aggregates only, and never what its owner follows

No surface SHALL show a list of who follows what. Follower information SHALL be exposed as aggregate counts only.

A profile SHALL NOT list the Topics its owner follows. That leaks reading habits and duplicates the activity page.

#### Scenario: No follower list anywhere

- **WHEN** any profile or Topic surface renders follower information
- **THEN** it renders a count, and never the identities behind it

#### Scenario: No followed-Topics table

- **WHEN** a profile renders
- **THEN** it lists the Topics its owner owns and nothing about the Topics its owner follows

### Requirement: The subscriber count is denormalised and moved transactionally

Each Topic SHALL have a denormalised subscriber count, so a profile listing many Topics does not run a count query per row.

The count SHALL be incremented and decremented in the same transaction as the write that changes who subscribes — a subscribe, an unsubscribe, a team join or removal writing membership Subscriptions — and the owner's own subscription SHALL NOT count. A subscription is one row per user and Topic whatever the number of holding teams: a join that reaches a Topic the user already subscribes to reuses that row through the unique-index upsert and moves no count, and a removal leaves the row active while any of the member's other teams still reaches the Topic. Any write path that changes who follows a Topic SHALL move the count in the same transaction, so the stored number cannot drift from the rows it summarises.

#### Scenario: Subscribing moves the count atomically

- **WHEN** a user subscribes to a public Topic
- **THEN** the subscription row and the Topic's count change in one transaction

#### Scenario: A team join moves every count it touches

- **WHEN** a user joins a Team holding Topics
- **THEN** each Topic's count reflects the join in the same transaction — one new muted row and one count move where the user was not subscribed, and no double count where an existing row was reused

#### Scenario: The owner is not counted

- **WHEN** a Topic's count is computed or moved
- **THEN** the owner's own subscription is excluded

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

### Requirement: A public Topic credits its owner with a byline

A public Topic SHALL show a byline reading `Brewed by <name>` with the label muted and the name holding the link. The credit is derived at read time: when the Topic's owning Team is public or the viewer is one of its members, the byline SHALL show the Team's avatar and name; otherwise it SHALL show the creator's avatar and username. Flipping a Team public moves every attached public Topic's credit with no data written to the Topic, and a member who opted out of the members stays hidden under team attribution.

The byline SHALL link to the team page only when the viewer can reach it — the Team is public, or the viewer is a member — and to the creator's profile otherwise, so an outsider is never linked to a team page that refuses them. On the topic page the byline SHALL sit under the title. On a homepage Topic card it SHALL appear in a smaller, secondary position, so the Topic stays the hero and the credit reads as the credit line.

The byline SHALL render on every Topic card, whatever section it sits in and whether or not a visitor is signed in. Withholding it on a signed-in visitor's own Topics was considered and dropped: a public Topic's credit is already public, so hiding it anywhere buys no privacy and only makes one card disagree with another.

#### Scenario: The topic page credits its owner

- **WHEN** a public Topic with no Team renders its page
- **THEN** the creator's avatar and username appear under the title and link to their profile

#### Scenario: Every Topic card shows the same byline

- **WHEN** the homepage renders a Topic card in any section, signed in or signed out
- **THEN** the card shows the same derived byline in a smaller, secondary position beneath the Topic title

#### Scenario: A public Team takes the credit

- **WHEN** a public Topic belongs to a public Team
- **THEN** the byline shows the Team and links to the team page

#### Scenario: A private Team leaves the credit with the creator

- **WHEN** an outsider views a public Topic whose Team is private
- **THEN** the byline shows the creator and links to their profile, and no link points at the gated team page

#### Scenario: Every Topic card carries the same byline

- **WHEN** the homepage renders a Topic card in any section, signed in or signed out
- **THEN** the card carries the same owner byline in a smaller, secondary position beneath the Topic title

### Requirement: The Topic roast opens with a Carl's Barista section naming the owner

The Topic roast SHALL carry a section labelled `Carl's Barista` as its first section, above the prompt. It SHALL hold the owner's avatar and username, and the username SHALL link to that owner's profile page.

It comes first because the roast explains what a Topic is and how it was tuned, and who tuned it is the first thing that frames the rest. The label follows the roast's own vocabulary, where the sections are already named for the people and things in Carl's shop rather than for the data they hold.

The section SHALL render in both surfaces the roast has — the homepage popover and the topic page's card — since both are built from the same content and an owner credited in one and not the other reads as a bug. Its heading already names the relationship, so the byline there SHALL drop the `Brewed by` label and show the avatar and username alone.

#### Scenario: The Carl's Barista section leads the roast

- **WHEN** the Topic roast renders
- **THEN** a `Carl's Barista` section appears above the prompt, holding the owner's avatar and username

#### Scenario: The username reaches the profile

- **WHEN** a reader activates the username in the Carl's Barista section
- **THEN** they arrive at that owner's profile page

#### Scenario: Both roast surfaces carry it

- **WHEN** the roast renders as the homepage popover and as the topic page card
- **THEN** the Carl's Barista section appears in both

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

### Requirement: A visitor sees every public topic

The profile owner reading their own page SHALL see every topic they have — private and invite rows
shown muted — under a Visibility column only they get, whose total reads `N/M public`. A visitor or
another user SHALL see all of the owner's public topics, with no Visibility column. Every public
topic is a linkable page already, so the profile filtering out the ones with few findings hid
nothing a stranger could not open by URL while making new users' profiles read emptier than they
are. The findings-count quality bar remains where it promotes: Featured, Popular, and the sitemap.

The topics table's totals SHALL carry their nouns like the rest of the app's tables — `N followers`
and `kept / seen findings` — and the kept cell's tooltip SHALL read `Kept N out of M findings`.

The profile preview card's and team preview card's public-topic counts SHALL count the same set the
profile table shows.

#### Scenario: The owner sees their non-public topics muted

- **WHEN** the profile's owner opens their own profile
- **THEN** their private and invite topics list muted with a Visibility column, its total reading N/M public

#### Scenario: A visitor sees public topics only

- **WHEN** anyone else opens the profile
- **THEN** only public topics list, and no Visibility column renders

#### Scenario: A new public topic lists immediately

- **WHEN** a visitor opens the profile of an owner whose public topic has no findings yet
- **THEN** the topic is in the table, and the preview card counts it

### Requirement: The menus play the topic tutorial video in a dialog
The signed-in user's account menu, on desktop and in the mobile drawer, and a visitor's mobile drawer SHALL each offer
an option named "Brew with Carl", marked with YouTube's red play button lined up with the icons around it, right above
"What CarlNotes Is". Choosing it SHALL close the menu and open a dialog titled "Brew with Carl ☕" that shows the topic
tutorial video's thumbnail with YouTube's play button, which plays the video in place from `www.youtube-nocookie.com`.
The Escape key SHALL close the dialog, and closing it SHALL stop the video. One dialog SHALL serve every menu and the
hero's button.

#### Scenario: A user plays the video from the account menu
- **WHEN** a signed-in user opens the account menu and chooses "Brew with Carl"
- **THEN** the menu closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: A visitor plays the video from the mobile drawer
- **WHEN** a visitor opens the mobile drawer and chooses "Brew with Carl"
- **THEN** the drawer closes and a dialog shows the topic tutorial video's thumbnail with YouTube's play button

#### Scenario: Pressing play plays the video in the dialog
- **WHEN** the user presses the dialog's play button
- **THEN** the thumbnail is replaced by the video playing from `www.youtube-nocookie.com`

#### Scenario: Escape closes the dialog and stops the video
- **WHEN** the dialog is open and the user presses Escape
- **THEN** the dialog closes and the video's player is removed from the page

### Requirement: The header opens the topic tutorial video beside the logo

The header SHALL show YouTube's red play button right after the "CarlNotes" logo on every page that has no hero, for
a visitor and a signed-in user alike, with a tooltip reading "Watch Brew with Carl" that is also its accessible name.
A primary click with no modifier key SHALL open the topic tutorial video's dialog. The button SHALL be a link to the
video's YouTube page, so a click with a modifier key opens the video on YouTube instead. On the home page a visitor
SHALL see the hero's button and no button beside the logo. A page load that brings a session cookie SHALL show the
button before the session request finishes.

#### Scenario: A signed-in user opens the video from the header

- **WHEN** a signed-in user presses the button beside the logo
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor opens the video from a topic page

- **WHEN** a visitor presses the button beside the logo on a topic page
- **THEN** the video's dialog opens on its thumbnail, and the page stays where it is

#### Scenario: A visitor on the home page sees the hero's button alone

- **WHEN** a visitor opens the home page
- **THEN** the hero shows the video's button, and the header shows no video button beside the logo

### Requirement: A missing profile gives way to the next loaded profile

The profile page SHALL show its missing message, "No one here by that name.", only for the user id whose load found
nobody. A navigation to another profile id SHALL clear that state if its profile loads, so the page shows the new
profile instead of the missing message it showed for the last id.

#### Scenario: A real profile follows a missing one

- **WHEN** a visitor opens a profile id that matches nobody, then follows a link to a profile that exists
- **THEN** the first shows the missing message and the second shows that profile

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
avatar on a wide screen and below it at phone width, with the summary line of the join month and the follower count
under the name. The person SHALL still change their avatar from it on their own page.

#### Scenario: The avatar matches the Topics page's image height

- **WHEN** a profile page and the Topics page render at the same width
- **THEN** the avatar's height equals a Topic image's height on the Topics page, and the summary line sits beside the
  avatar under the name

#### Scenario: A phone puts the name under the avatar

- **WHEN** a visitor opens a Café on a phone
- **THEN** the avatar sits on its own line, and the name and the summary line take the whole width below it

### Requirement: The Café lists its sections in a fixed order

The profile page SHALL show, top to bottom: the header, the person's news, Featured Topics, Featured Films, Featured
Podcasts, Featured Posts, the topics table, the teams table, and the Visitors line. A card section with nothing to show
SHALL be absent, and the order of the rest SHALL hold. Each table SHALL always show, an empty one with its line in a
card. The page SHALL show no Open Mic section, since Featured Posts lists every post, and no notice, warning, or
guideline text.

#### Scenario: A full Café reads in order

- **WHEN** a visitor opens the profile of a person with public Topics, ready films, Podcast Episodes, Topic Posts, and
  a shown Team
- **THEN** the page shows the header, the news, Featured Topics, Featured Films, Featured Podcasts, Featured Posts, the
  two tables, and the Visitors line, in that order, with no Open Mic section

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
