## MODIFIED Requirements

### Requirement: The user face shows the headline, Brews News, the featured cards, and your Topics

The user face SHALL show the visitor face's headline beside the New Topic button, then the Brews News card in how it
works' place, then the featured cards, then the user's owned and followed Topics as cards under "Your topics". The
Brews News card SHALL hold Carl's recap for the day, then the user's news with its window picker, and SHALL hold no
updates list and no reading length button. The home
payload SHALL hold the first six of those Topics and their total, and each later page of six SHALL be requested from
the server when the user opens it. A user with no Topic SHALL see the New Topic button in the cards' place.

#### Scenario: A new user sees where to start

- **WHEN** a user with no Topic opens `/`
- **THEN** the featured cards show and the New Topic button stands where their Topics would

#### Scenario: A user with many Topics pages through them

- **WHEN** a user who owns or follows twelve Topics opens `/` and then the second page of Your topics
- **THEN** the home payload holds six Topic cards and a total of twelve, and the second page requests the next six

#### Scenario: The card shows the opener above the news

- **WHEN** a signed-in user with unread Findings opens `/`
- **THEN** the Brews News card shows Carl's recap, then the week's news with Week selected in the picker, and no
  Finding is marked read
