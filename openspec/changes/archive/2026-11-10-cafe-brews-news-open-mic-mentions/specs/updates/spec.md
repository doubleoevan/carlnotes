# Spec Delta

## ADDED Requirements

### Requirement: The home reads the day's opener without building a list

A signed-in user's home, and the news on their own profile page, SHALL read the day's opener on its own: the opener a
list would show, from the same cache, prompt, wait, and budget rule, with no Finding marked read. A user with no
unread Finding SHALL keep the opener the day already stored, and no model call SHALL run for them. A missing opener
SHALL leave the card with its news alone.

#### Scenario: The home's opener is the list's opener

- **WHEN** a user opens the home and then asks an AI app for a list on the same day
- **THEN** both show the same opener, and one model call wrote it

#### Scenario: Reading the opener marks nothing read

- **WHEN** a user with twelve unread Findings opens the home
- **THEN** the twelve stay unread

#### Scenario: The day's opener stays after the last Finding is read

- **WHEN** a user's home showed the day's opener and the user then reads every Finding
- **THEN** the home still shows that opener for the rest of the day, and no model call runs

#### Scenario: A spent budget shows the news alone

- **WHEN** the opener's reservation is rejected
- **THEN** the home's card shows the news with nothing in the opener's place

### Requirement: The updates MCP view is titled Brew Updates

The updates MCP view's heading SHALL read "Brew Updates". Only the news SHALL be titled Brews News, on the home, on a
profile page, and in its own MCP view.

#### Scenario: The two views read apart

- **WHEN** a host renders a `read_updates` result and a `read_news` result
- **THEN** the first is headed "Brew Updates" and the second "Brews News"

## MODIFIED Requirements

### Requirement: What does not fit collapses into one link

In the MCP view, unread Findings outside the list SHALL collapse into one "and N more" link to the Topics page, or
to the Topic's page in a scoped list. They SHALL stay unread.

#### Scenario: More remains

- **WHEN** the list leaves twelve unread Findings out
- **THEN** the MCP view shows one link for twelve more, which opens the Topics page on carlnotes.com, and those
  Findings stay unread

## REMOVED Requirements

### Requirement: The Updates card leads the signed-in home

**Reason**: The signed-in home's card becomes the news: Carl's opener, then the events of a window. A reading list
trimmed to minutes and a record of what happened are two jobs, and the home keeps the second.

**Migration**: The updates list, its 5, 15, and 30 minute lengths, and its read marking stay behind `read_updates` and
the updates MCP view. The home reads the opener through its own request and the Findings as rows of the news. The web
and mobile home wrappers of the updates list and its button are deleted, and the shared components stay for the MCP
view.
