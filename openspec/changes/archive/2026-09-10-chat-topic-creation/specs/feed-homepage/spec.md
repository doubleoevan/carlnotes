## MODIFIED Requirements

### Requirement: The homepage offers topic creation beside Refresh
The homepage's control row SHALL show an Add Topic primary button beside Refresh, opening the shared topic modal in create mode. Under the button, a remaining line ("N left", the topic limit is on held topics, never per day) SHALL link to the pricing page with an "Upgrade for more" tooltip, hydrate in once the feed payload lands (with a same-height placeholder while loading), and the button SHALL be disabled while loading and at zero remaining. A successful create, from the modal or from Carl in the new-topic chat, SHALL refresh the feed and navigate to the new topic's page. A signed-in user who owns no Topic and follows none SHALL also find the chat panel open on the new-topic chat when they land.

#### Scenario: Creating a topic lands on its page
- **WHEN** the user saves the Add Topic modal within the limit, or says yes to Carl in the new-topic chat
- **THEN** the topic is created and the app navigates to its detail page

#### Scenario: A reached topic cap disables the button
- **WHEN** the user holds as many topics as their limit allows
- **THEN** the remaining line shows "0 left" and Add Topic is disabled

#### Scenario: A first visit opens Carl
- **WHEN** a signed-in user who owns no Topic and follows none lands on the homepage
- **THEN** the chat panel is open on the new-topic chat beside the empty feed

## ADDED Requirements

### Requirement: The homepage opens the section that has something in it
For a signed-in user the homepage SHALL open the "Your topics" section first, except when the user owns no Topic and follows at least one, when it SHALL open "Your subscribed topics" instead. A visitor SHALL still see the featured Topics first.

#### Scenario: A follower who owns nothing lands on what they follow
- **WHEN** a user who follows a Topic but owns none loads the homepage
- **THEN** "Your subscribed topics" is the open section

#### Scenario: An owner lands on their own topics
- **WHEN** a user who owns a Topic loads the homepage
- **THEN** "Your topics" is the open section, whatever they follow
