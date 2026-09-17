## ADDED Requirements

### Requirement: A Topic being edited in chat shows as a card the reader can read
While a Topic is being edited with Carl, the chat SHALL show that Topic above the composer as a card, in the same shape
as the new-topic chat's draft card. The card SHALL be titled "Topic draft", since the reader is iterating on a Topic
that is already saved, and the new-topic chat's card SHALL be titled "Topic preview", since nothing is saved yet. The
Topic's name on the card SHALL link to its own page. The card SHALL show the app's loading in place of its fields while
Carl owes the chat a reply. The card SHALL be read from the Topic page and SHALL be absent for a user the page says may
not edit the Topic.

#### Scenario: The card shows the Topic as it stands
- **WHEN** a reader starts editing a Topic with Carl and he has proposed nothing
- **THEN** the card is titled "Topic draft", shows the Topic's saved fields, and its name links to the Topic's page

#### Scenario: The new-topic chat's card is a preview
- **WHEN** the reader is building a topic that does not exist yet
- **THEN** the card is titled "Topic preview" and the name is plain text, since there is no page to link to

#### Scenario: A reader who may not edit gets no card
- **WHEN** the Topic page says the user may not edit it, or the read fails
- **THEN** no card shows, so it never claims a Topic the read could not confirm

### Requirement: A proposed edit shows on the card until the reader takes it off or agrees to it
When Carl calls `proposeTopicEdit`, the card SHALL show the Topic as the proposal would leave it, over the Topic as it
is saved, and SHALL offer the reader a control that takes the proposal off the card without saving anything.

A proposal SHALL stand only until Carl cancels it or a Topic Tool saves, whichever comes first. A tool that saves
applies the proposal, so the card SHALL drop it and read the Topic as it now stands. This SHALL hold both for the card
in front of the reader and for the proposal rebuilt when a conversation is reloaded from the tool calls its turns
stored, so the two never disagree.

#### Scenario: A proposal reads over the saved Topic
- **WHEN** Carl calls `proposeTopicEdit`
- **THEN** the card shows the Topic as the proposal would leave it and offers a way to take it off

#### Scenario: The reader takes a proposal off the card
- **WHEN** the reader dismisses the proposed edit
- **THEN** the card returns to the Topic as it is saved and nothing is written

#### Scenario: A save ends the proposal it applied
- **WHEN** the reader agrees and a Topic Tool saves
- **THEN** the card drops the proposal, reads the Topic again, lists each added Source once, and offers no control to take a proposal off

#### Scenario: A standing proposal survives a reload
- **WHEN** the conversation is reloaded while a proposal is standing
- **THEN** the card is rebuilt as a proposal from the tool calls the conversation stored

#### Scenario: A cancelled or saved proposal does not come back on a reload
- **WHEN** the conversation is reloaded after Carl cancelled the proposal, or after a Topic Tool saved it
- **THEN** the card shows the Topic alone, with no proposal over it
