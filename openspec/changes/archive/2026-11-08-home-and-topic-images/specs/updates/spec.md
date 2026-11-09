# Spec Delta

## ADDED Requirements

### Requirement: The Updates card leads the signed-in home

The web and mobile Updates UI parked in `logs/updates-web-mobile.patch`, the list and its button, SHALL return as the
"Updates" card under the signed-in home's headline, with no route or screen of its own. The card SHALL load a 30
minute list, and its Update button SHALL offer 5, 15, and 30 minutes with the shown length highlighted as a selected
menu option. A choice SHALL load a new list of that length in the card.

#### Scenario: A user opens home and reads their Updates

- **WHEN** a signed-in user opens home
- **THEN** the Updates card under the headline shows a 30 minute list

#### Scenario: A user updates the list

- **WHEN** a signed-in user presses Update and picks 15 minutes
- **THEN** the card loads a new 15 minute list, and the menu highlights 15 minutes

## MODIFIED Requirements

### Requirement: What does not fit collapses into one link

In the MCP view, unread Findings outside the list SHALL collapse into one "and N more" link to the Topics page, or
to the Topic's page in a scoped list. The Updates card on the home page SHALL show the list at the length its
Update button chose and no link. They SHALL stay unread.

#### Scenario: More remains

- **WHEN** the list leaves twelve unread Findings out
- **THEN** the MCP view shows one link for twelve more, which opens the Topics page on carlnotes.com, the home card
  shows none, and those Findings stay unread
