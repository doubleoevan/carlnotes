## MODIFIED Requirements

### Requirement: Access to the page follows Topic visibility
The topic page payload SHALL be served to the owner always, to an admin for any Topic (the single platform override, so an admin can open any Topic to edit or delete it), to anyone for public Topics, and for invite Topics only to users whose account email is invited or who already subscribe. Private Topics SHALL be served only to the owner or an admin. Any other request SHALL get not-found, and the ui SHALL render a not-found message rather than an empty page. Access SHALL be decided through `isAllowed(user, "topic:view", topic)`.

#### Scenario: An uninvited user cannot open an invite topic
- **WHEN** a signed-in user who is neither invited nor subscribed requests an invite Topic
- **THEN** the api responds not-found and the page shows the not-found message

#### Scenario: An admin can open any topic
- **WHEN** an admin requests a private Topic they do not own
- **THEN** the api serves the payload so the admin can edit or delete it
