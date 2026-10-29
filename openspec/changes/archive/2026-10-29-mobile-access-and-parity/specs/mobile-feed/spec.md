# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated screens share the branded header

Reading and menu pages SHALL use the compact web header's hero band, coffee mug, display wordmark, YouTube tutorial button, and secondary menu. The menu SHALL match web order, dividers, actions, and light/dark control, and SHALL offer the way back to the system appearance while a palette is saved. The menu button SHALL show the web's one summed update badge of unread chat mentions, unread note changes, and waiting topic invitations, and the Profile, Teams, and Activity items SHALL show the web's per-item counts. Native back gestures SHALL remain available. The Home/Settings bottom navigation SHALL remain hidden, with no visible Topic Back button.

#### Scenario: Appearance has a saved preference

- **WHEN** the app loads a saved light or dark preference
- **THEN** it uses that preference, and the menu offers "System appearance" to follow the device again

#### Scenario: The logo is pressed on search results

- **WHEN** a user presses the search header's logo
- **THEN** the app clears search and returns Home

#### Scenario: The logo is pressed on Home

- **WHEN** a user presses the Home header's logo
- **THEN** the shared reheat reloads the Feed once

#### Scenario: The logo is pressed on a Topic

- **WHEN** a user presses the Topic header's logo
- **THEN** the app returns to retained search results when present, or Home otherwise, without disabling native back gestures

#### Scenario: Updates wait while the menu is closed

- **WHEN** a user has one unread chat mention, two unread note changes, and one waiting topic invitation
- **THEN** the menu button shows 4, its accessible name reads the count and each waiting group, and a long press lists
  the groups under their own headings

## ADDED Requirements

### Requirement: A visitor's Home shows the web hero

A visitor's Home SHALL open with the web hero above the Featured and Popular sections: the headline, Carl's image,
the call to action, the tagline, the pitch behind its button, and the tutorial video button reporting the `hero`
opener. A signed-in Home SHALL show no hero. The headline's reveal SHALL hold still under reduced motion.

#### Scenario: A visitor opens the app

- **WHEN** the app opens with no session
- **THEN** Home shows the hero with the web's headline and call to action, and the Featured section below it

#### Scenario: The hero's video button

- **WHEN** a visitor presses the hero's video button
- **THEN** the tutorial plays in the app and reports the `hero` opener

### Requirement: Plans opens to a visitor

The Plans screen SHALL open to a visitor as the web's Plans page does, with the recommended plan highlighted and each
plan's action leading to sign-up.

#### Scenario: A visitor opens Plans

- **WHEN** a visitor opens Plans from a link
- **THEN** the plans render and no sign-in is required to read them

### Requirement: An account action prompts a visitor in Carl's words and returns them

Every visitor action that needs an account SHALL open sign-up with the web's prompt for that action, in Carl's words,
and SHALL remember the visitor's screen so sign-in or sign-up returns there. The invite-only Topic gate SHALL offer
Log in and Sign up as the web gate does. Add Note SHALL prompt a visitor instead of hiding.

#### Scenario: A visitor follows a topic

- **WHEN** a visitor presses Follow on a public Topic
- **THEN** sign-up opens reading "Sign up to follow this topic", and after sign-up the same Topic shows

#### Scenario: A visitor adds a note

- **WHEN** a visitor presses Add Note on a Topic
- **THEN** sign-up opens reading "Sign up to add a note"

#### Scenario: A visitor meets an invite-only topic

- **WHEN** a visitor opens an invite-only Topic
- **THEN** the gate offers Log in and Sign up, and either returns to the Topic

#### Scenario: A visitor opens an account screen

- **WHEN** a visitor's link opens Account, Activity, or Teams
- **THEN** sign-in opens, and after sign-in that screen shows

### Requirement: The chat launcher shows a visitor the sign-up panel

The chat launcher SHALL show for a visitor and open the web's sign-up panel, "Sign up to begin the conversation".
Chat itself SHALL stay signed-in only.

#### Scenario: A visitor opens the launcher

- **WHEN** a visitor presses the chat launcher
- **THEN** the panel offers sign-up and sends no chat request
