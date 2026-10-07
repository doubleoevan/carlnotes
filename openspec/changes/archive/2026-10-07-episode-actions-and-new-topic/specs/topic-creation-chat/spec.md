## ADDED Requirements

### Requirement: Every page offers a way to create a topic

Every page with the search bar SHALL let a user start a Topic. The pages with their own New Topic button are the home
page, the Podcast Episode page, a user's own activity and profile pages, and a Topic page for a signed-in user who may
not scan the Topic. The team page has its Add Topic button for a leader. A page with either button SHALL keep that
button as the way in. Every other page SHALL offer New topic in the search bar's actions menu, which SHALL open the
same new topic dialog and SHALL send a visitor to sign up first.

#### Scenario: A user starts a topic from a topic page

- **WHEN** a Topic's owner opens the actions menu on the Topic's page and picks New topic
- **THEN** the new topic dialog opens with its two choices, and a saved topic opens its page

#### Scenario: A page with its own button leaves the option out

- **WHEN** a user opens the actions menu on the home page
- **THEN** the menu offers no New topic

#### Scenario: A visitor is sent to sign up

- **WHEN** a visitor opens the actions menu on the plans page and picks New topic
- **THEN** the sign-up page opens

## MODIFIED Requirements

### Requirement: The New Topic button offers the chat
The New Topic button on the home, activity, profile, and Podcast Episode pages, on a Topic page for a signed-in user who
may not scan the Topic, and the actions menu's New topic option SHALL open a dialog with two choices, making the Topic
in the form or making it with Carl, and the second SHALL open the panel on the new-topic chat. The team page's Add Topic
SHALL keep opening its picker, whose New topic option opens the same dialog.

#### Scenario: A user chooses Carl
- **WHEN** a signed-in user presses New Topic on the home page and picks making it with Carl
- **THEN** the dialog closes and the panel opens on the new-topic chat

#### Scenario: A user chooses the form
- **WHEN** a signed-in user presses New Topic and picks making it themselves
- **THEN** the create form opens in place of the dialog
