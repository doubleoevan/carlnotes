## MODIFIED Requirements

### Requirement: The avatar is the header's account menu, and sign out is its last item

Signed in on desktop, the user's avatar SHALL sit at the far right of the header and SHALL be the trigger for a
dropdown. The dropdown SHALL hold a row reading the user's name followed by Café, with the user's own avatar as its
icon, linking to the user's own profile page, followed by activity, then account, then the Dashboard section between
dividers holding "Topic Specials", "Podcast Specials", and "Team Specials", each with its icon left of its text, then
the admin console for an admin, and sign out SHALL be its last item.

The account items SHALL leave the primary navigation. Sign out in particular SHALL NOT remain a top-level header
control: it is the rarest action in the header and the most costly to hit by accident, so it belongs at the end of a
menu the reader has deliberately opened.

On mobile the same items SHALL form one block at the bottom of the existing drawer, below a divider and below the
primary navigation, in the same order and ending in sign out. Navigation is used every session and account items rarely
are, and the bottom of the drawer is the easiest thumb reach, so the ordering favours the frequent item without burying
the rare one.

#### Scenario: The avatar opens the account menu

- **WHEN** a signed-in user views the header on desktop
- **THEN** their avatar sits at the far right and opens a dropdown whose Café row, reading their name and Café beside
  their avatar, links to their profile page

#### Scenario: Sign out is last

- **WHEN** the dropdown opens
- **THEN** its items read Café, activity, account, the Dashboard section, admin for an admin, and sign out last

#### Scenario: Sign out leaves the primary navigation

- **WHEN** the header renders for a signed-in user
- **THEN** no top-level sign-out control remains beside the primary navigation

#### Scenario: The drawer carries the same block at the bottom

- **WHEN** a signed-in user opens the mobile drawer
- **THEN** the same items appear as one block below a divider and below the primary navigation, in the same order and
  ending in sign out

#### Scenario: The Dashboard section holds three rows

- **WHEN** the dropdown opens
- **THEN** one section between dividers holds exactly "Topic Specials", "Podcast Specials", and "Team Specials", each
  with its icon at the left
