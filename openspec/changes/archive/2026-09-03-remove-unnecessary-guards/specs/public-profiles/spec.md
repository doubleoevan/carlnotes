## REMOVED Requirements

### Requirement: The owner's profile shows all their topics with visibility

**Reason**: Its claim that a stranger sees "the owner's public, shown topics only" is what this change reverses. The profile hid public topics with few findings, which revealed nothing a stranger could not open by URL and made a new user's profile read emptier than it was.

**Migration**: Replaced by "A visitor sees every public topic", which keeps the owner's muted rows, the Visibility column and its `N/M public` total, the table's totals and their nouns, and the kept cell's tooltip, and states that every public topic lists.

## ADDED Requirements

### Requirement: A visitor sees every public topic

The profile owner reading their own page SHALL see every topic they have — private and invite rows
shown muted — under a Visibility column only they get, whose total reads `N/M public`. A visitor or
another user SHALL see all of the owner's public topics, with no Visibility column. Every public
topic is a linkable page already, so the profile filtering out the ones with few findings hid
nothing a stranger could not open by URL while making new users' profiles read emptier than they
are. The findings-count quality bar remains where it promotes: Featured, Popular, and the sitemap.

The topics table's totals SHALL carry their nouns like the rest of the app's tables — `N followers`
and `kept / seen findings` — and the kept cell's tooltip SHALL read `Kept N out of M findings`.

The profile preview card's and team preview card's public-topic counts SHALL count the same set the
profile table shows.

#### Scenario: The owner sees their non-public topics muted

- **WHEN** the profile's owner opens their own profile
- **THEN** their private and invite topics list muted with a Visibility column, its total reading N/M public

#### Scenario: A visitor sees public topics only

- **WHEN** anyone else opens the profile
- **THEN** only public topics list, and no Visibility column renders

#### Scenario: A new public topic lists immediately

- **WHEN** a visitor opens the profile of an owner whose public topic has no findings yet
- **THEN** the topic is in the table, and the preview card counts it
