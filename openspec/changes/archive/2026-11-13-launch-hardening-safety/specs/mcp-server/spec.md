## ADDED Requirements

### Requirement: The consent page warns about a return host CarlNotes does not know

If the redirect address a user's answer returns to is on a host CarlNotes does not know, the consent page SHALL show
that host under its question and say so. The host SHALL be read from the signed authorize query, never from the name
the client gave itself. The hosts of the AI apps CarlNotes lists, a loopback address, and an app's own scheme are
known, and for those the page SHALL show nothing more than before. The client name route SHALL return what the line
needs.

#### Scenario: A known client's consent is unchanged

- **WHEN** a user reaches the consent page for a client whose redirect address is on a host CarlNotes knows
- **THEN** the page names the client as before and shows no line about its host

#### Scenario: A client that named itself after another shows its own host

- **GIVEN** a client registered under the name of a well-known AI app, with a redirect address on a stranger's server
- **WHEN** a user reaches its consent page
- **THEN** the page shows the stranger's host and says it is not a host CarlNotes knows

#### Scenario: The host comes from the signed query

- **WHEN** a consent page loads with an authorize query whose signature holds
- **THEN** the host it checks is the host of that query's redirect address

#### Scenario: A client on the user's own device shows no line

- **WHEN** a user reaches the consent page for a client whose redirect address is a loopback address
- **THEN** the page shows no line about its host

### Requirement: set_topic_image says so if its image is unchecked

If an image that `set_topic_image` sets from a url is saved as unchecked, because its check could not run on an invite
or public Topic, the tool's result SHALL keep every field it has, SHALL return the Topic's current image, and SHALL say
in its text that only the caller can see the new image until Carl finishes checking it.

#### Scenario: An unchecked image returns the current one

- **WHEN** an editor calls `set_topic_image` with a url on a public Topic and the image moderation times out
- **THEN** the result's status is saved, its image is the Topic's current image, and its text says only the editor
  can see the new image until Carl finishes checking it
