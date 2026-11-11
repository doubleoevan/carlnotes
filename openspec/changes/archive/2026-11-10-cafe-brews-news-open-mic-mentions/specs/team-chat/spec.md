# Spec Delta

## ADDED Requirements

### Requirement: A private chat is named for what it is about

The row that names the open chat, the menu's private chat option, and the mobile app's conversation choice SHALL read
"Private chat about" and the Topic Post's title while the chat asks about a post, else the Topic's name, else the
team's name, and "Private chat" alone while that name is not known. The new-topic chat SHALL keep its own name. A long
label SHALL end in an ellipsis on one line and stay whole as the accessible name. One shared function SHALL build it.

#### Scenario: A post's chat is named for the post

- **WHEN** a user opens the chat launcher on the page of the Topic Post "Light roasts, ranked"
- **THEN** the row that names the open chat reads "Private chat about Light roasts, ranked"

#### Scenario: The menu's option names the page's Topic

- **WHEN** a member opens the menu in a team's chat room on the page of the Topic "Espresso"
- **THEN** the menu's first option reads "Private chat about Espresso"

#### Scenario: An unknown subject reads plainly

- **WHEN** a private chat is open and the name of its Topic or team is not known yet
- **THEN** its label reads "Private chat"
