## MODIFIED Requirements

### Requirement: One Team icon, three entry points, one create modal

A Team SHALL be represented by the Lucide Users icon everywhere one appears, which is the header menu item, the Team Up
button, the teams index, the team badge on a Topic, and the team page header, and no second team icon is introduced.

The topic page's action row SHALL hold exactly one button on each end. The right end is the page's one call to action,
picked in this order: Brew for whoever may scan, New Topic for any other signed-in user, Join Team for a visitor on a
Topic that a public Team owns, and Follow for any other visitor. The left end holds Join Team for a signed-in user who
may not scan and is on none of the Topic's holding Teams, on a Topic that a public Team owns, then Team Up where it
renders, and Share where nothing else claims the side. If Join Team holds the left, Team Up SHALL move into the search
bar's actions menu as Add topic to team, which opens the same teams and actions in a dialog. Following SHALL never be a
second button on the left. It is either the call to action or an option in the search bar's actions menu, which keeps
the action row to one control a side on a narrow screen. Share SHALL appear in that menu whether or not the Share button
renders, directly above Edit, and the follow option leads the menu. Team Up renders for any signed-in user, except a
user who does not own a private Topic, which stays its owner's alone to hand over. Toggling follow from either place
SHALL confirm with a toast naming the Topic. On an unheld Topic it opens the create modal, with two lines on what a Team
gives, shared editing and a room with Carl, then attach to a Team the user leads or create a new one with the name
prefilled from the Topic. On a held Topic its icon fills for a leader of any holding Team, whose menu lists each led
holding Team with a remove X and each other led Team as an "Add to <team>" option behind a plus, sharing the Topic in.
Every other user keeps the plain attach view.

The topic create and edit form SHALL offer a Team field to the same users Team Up serves: no team, one of the teams the
user leads, or a new team created on save with the saved topic attached. The new team's draft opens in place with a
name, its Members fields, and the Public toggle. A draft left unnamed creates nothing, and the topic saves on its own.
On a topic whose owning team the user leads it offers that team or no team, and on one owned by a team the user does not
lead it stays hidden. The picked destination applies after the topic saves, and a failed attach keeps the saved topic and says so.

A teams index SHALL live behind a Teams item in the header menu directly below Profile, listing the user's Teams with
their role in each and who invited them, or the user's own profile if nobody did, beside a New Team button and the only
leave button, governed by the last-leader rule. A pending team invitation SHALL render as an inactive row of the same
table: its role reads invited, Invited by names the sender, the member and topic counts open the same members and topics
subtables a membership row has, read-only, so an invitee can look before joining, the spend shows like a membership's,
and the Active toggle joins, with the tooltip "Join <team>", while the X declines. A membership's toggle leaves with a
"Leave <team>" tooltip, except for a team's only leader, whose toggle reads "Assign a new leader to leave" and opens the
members subtable instead of toggling. If the user belongs to no teams, the index SHALL offer a call-to-action line that
opens the create modal, in the shape the activity page's empty topics section uses. A Team created from any entry point
appears there immediately. Creating from the index offers a multiselect of the Topics the user may bring, their own at
any visibility first, then every public Topic and the invite Topics they can read, each group alphabetical, with a Topic
held elsewhere offered too because attaching shares it in. It suggests a name instead of presenting an empty field.
Every entry point SHALL share one modal, differing only in prefill and multiselect.

The team form SHALL offer a username field beside its email field, staging each entered username as a chip the save
sends. When the invitations send on save, a rejected one, an unknown username included, is reported by name and no
invite exists for it.

#### Scenario: The action row holds one button a side

- **WHEN** the topic page renders for an owner, a team member, a signed-in non-member, and a signed-out visitor
- **THEN** each of them sees exactly one button on the left and one on the right, with following in the actions menu
  wherever it is not the call to action

#### Scenario: A Topic a Team holds offers the way in

- **WHEN** a signed-in user on none of a Topic's holding Teams opens its page and the owning Team is public
- **THEN** New Topic is the right-hand call to action, Join Team holds the left, and Follow and Add topic to team are in
  the actions menu

#### Scenario: A follower who may not scan starts a new topic

- **WHEN** a signed-in user who follows a Topic they do not own, on a Topic with no public owning team, opens its page
- **THEN** New Topic is the right-hand call to action, Team Up holds the left, and Unfollow and Share are in the actions menu

#### Scenario: A visitor joins the owning team

- **WHEN** a visitor opens a Topic that a public Team owns
- **THEN** Join Team is the right-hand call to action and Share holds the left

#### Scenario: The picker leaves out only what the team holds

- **WHEN** the create modal offers Topics to attach
- **THEN** only Topics the new team already holds are absent from the multiselect, and a Topic held by other teams alone
  is offered

#### Scenario: One modal serves every entry point

- **WHEN** a Team is created from the topic page and from the index
- **THEN** the same modal ran both times, differing only in the Topic prefill and the multiselect, and the new Team
  lists on the index at once
