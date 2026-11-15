## MODIFIED Requirements

### Requirement: An admin switches someone else's profile between the user view and the visitor view

An admin on someone else's profile SHALL see a select in the news card, highlighted in the primary color, between
"User view" and "Visitor view" on the web and in the mobile app. The select SHALL change the whole page to what the
person sees or what a visitor sees, and another profile SHALL open in the user view. A read in the visitor audience
SHALL return what a visitor reads to any reader.

#### Scenario: An admin starts in the user view

- **WHEN** an admin opens someone else's profile
- **THEN** the select shows "User view", and the Café and the table show the person's private Topics, except one whose
  Personal sources text is not converted

#### Scenario: An admin switches to the visitor view

- **WHEN** the admin chooses "Visitor view"
- **THEN** the Café, the table, and the news show only what a visitor sees, and the news shows no recap

#### Scenario: Another profile starts in the user view

- **WHEN** the admin, in the visitor view, opens another person's profile
- **THEN** that profile opens in the user view

#### Scenario: No select for anyone else

- **WHEN** the person opens their own profile, or a user who is not an admin opens someone else's
- **THEN** the news card shows no view select
