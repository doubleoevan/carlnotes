## ADDED Requirements

### Requirement: The owner's profile shows all their topics with visibility

The profile owner reading their own page SHALL see every topic they have — private and invite rows shown muted — under a Visibility column only they get, whose total reads `N/M public`. A visitor or another user SHALL see the owner's public, shown topics only, with no Visibility column, so the page reveals nothing a stranger may not know.

The topics table's totals SHALL carry their nouns like the rest of the app's tables — `N followers` and `kept / seen findings` — and the kept cell's tooltip SHALL read `Kept N out of M findings`.

#### Scenario: The owner sees their non-public topics muted

- **WHEN** the profile's owner opens their own profile
- **THEN** their private and invite topics list muted with a Visibility column, its total reading N/M public

#### Scenario: A visitor sees public topics only

- **WHEN** anyone else opens the profile
- **THEN** only public, shown topics list, and no Visibility column renders
