# Spec Delta

## ADDED Requirements

### Requirement: A signed-in topic page loads Similar topics in a read of their own

A signed-in web topic page SHALL read its page with `related=separate`, which returns an empty related topics list,
and read the list from `GET /api/topics/:id/related-topics`, behind the page's own gate, adding the "Similar topics"
table and its count once it arrives. A page read with no flag, and every visitor's page, SHALL hold the list, so the
server-rendered page shows it without JavaScript.

#### Scenario: A signed-in page loads its related topics separately

- **GIVEN** a Topic with related topics the user may open
- **WHEN** a signed-in user opens the Topic's page on the web
- **THEN** the page read asks for `related=separate` and sends no related topics read, the related topics read returns
  the list, and the "Similar topics" table and the details line's count show once it arrives

#### Scenario: A visitor's page has its related topics inline

- **WHEN** a visitor or a crawler requests a public Topic's page
- **THEN** the server-rendered html holds the "Similar topics" table, and the visitor's page read returns the list with
  or without the flag

#### Scenario: A page read with no flag holds the list

- **WHEN** a client that sends no flag, such as a released mobile app, reads a Topic's page
- **THEN** the page's related topics list is the one the related topics read returns

#### Scenario: A hidden topic's related topics read responds as its page does

- **WHEN** a user who may not see a Topic asks for its related topics
- **THEN** the read responds 403 with the gate of an invite Topic, and 404 for a private or missing one
