## MODIFIED Requirements

### Requirement: The composer keys read like a chat
The composer SHALL be multiline: Enter SHALL send the draft, Shift+Enter SHALL break a line, and the box SHALL grow with
the draft to a cap before scrolling internally. A non-empty draft SHALL offer a clear control that wipes it and returns
focus to the box, and the control SHALL hide while the draft is empty. Escape anywhere inside the panel SHALL collapse
it to the pill, and the composer SHALL take focus when the panel opens.

While the draft is empty and there is no attachment, voice chat is configured, and nothing is on its way, the send slot
SHALL hold the mic that starts a recording, at the send button's size, and a typed character or an attachment SHALL
bring the send button back.

#### Scenario: A draft clears from its own control
- **WHEN** a user with a non-empty draft clicks its clear control
- **THEN** the draft empties, focus returns to the composer, and the control hides

#### Scenario: Files attach from the paperclip or a paste
- **WHEN** a user picks files from the composer's attach control or pastes an image
- **THEN** each becomes a removable chip above the draft — a tiny thumbnail for an image, a named chip for text — until
  the send carries them

#### Scenario: A long paste folds into a chip
- **WHEN** a user pastes text past the chip threshold
- **THEN** the paste becomes a "Pasted text" chip with its size instead of filling the draft box

#### Scenario: Enter sends and Shift+Enter breaks a line
- **WHEN** the reader presses Enter with a non-empty draft
- **THEN** the turn sends, while Shift+Enter inserts a line break instead

#### Scenario: Escape collapses the panel
- **WHEN** the reader presses Escape with focus inside the panel
- **THEN** the panel collapses to its pill

#### Scenario: The composer takes focus on open
- **WHEN** the panel opens
- **THEN** the composer is focused and typing lands in it immediately

#### Scenario: The empty composer offers the mic
- **WHEN** the draft is empty
- **THEN** the send slot shows the mic, and a typed character replaces it with the arrow

### Requirement: A signed-out visitor's composer is a signup funnel
A signed-out visitor on a visible Topic SHALL see the panel and type freely into its composer, and sending — Enter or
the arrow button — SHALL route to the signup page instead of posting a turn. The arrow SHALL stay enabled and SHALL show
a "Sign up to chit-chat" tooltip on hover. No anonymous request SHALL be posted to the chat api.

The visitor's mic SHALL route to signup the same way and SHALL never request the microphone.

#### Scenario: A visitor's send routes to signup
- **WHEN** a signed-out visitor types into the composer and presses Enter or the arrow
- **THEN** the app navigates to the signup page and no chat request is sent

#### Scenario: The visitor's arrow carries the signup tooltip
- **WHEN** a signed-out visitor hovers the enabled arrow button
- **THEN** a tooltip reads "Sign up to chit-chat"

#### Scenario: A visitor's mic routes to signup
- **WHEN** a visitor taps the mic
- **THEN** the browser goes to signup, and no permission prompt appears
