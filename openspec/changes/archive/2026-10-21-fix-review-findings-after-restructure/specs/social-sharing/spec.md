## ADDED Requirements

### Requirement: Client-facing copy says follow, never subscribe

Every string a user reads about a Subscription SHALL say follow, follower, following, or unfollow, while identifiers
keep subscribe. The Follow control's tooltip SHALL read "Sign up to follow" for a visitor, "Unfollow this topic" for a
user who follows the Topic, and "Follow this topic" otherwise, with the next-scan disclaimer added on an invite Topic.
The invitation email's note SHALL say following is the invitee's call, and the digest's footer SHALL say the recipient
follows the Topic. The one-click unsubscribe link keeps its name, the word every inbox expects.

#### Scenario: The Follow tooltips say follow

- **WHEN** a visitor, a follower, and a signed-in non-follower each hover the Follow control
- **THEN** they read "Sign up to follow", "Unfollow this topic", and "Follow this topic", and no tooltip says subscribe

#### Scenario: The emails say follow

- **WHEN** an invitation email and a digest are rendered
- **THEN** neither says subscribe outside the unsubscribe link

### Requirement: Every copy control copies through the shared clipboard helper

Every control that copies a url, the share menu's copy rows and the podcast feed dialog's Copy feed link alike, SHALL
write through the one clipboard helper in `apps/web/src/lib/utils.ts`, which returns whether the browser accepted the
write, so each control confirms only a copy that happened and shows the same toast.

#### Scenario: The podcast feed dialog copies the feed url

- **WHEN** a listener presses Copy feed link
- **THEN** the feed url is written through the shared helper, and the dialog confirms the copy only if the write
  succeeded

### Requirement: The Chrome intent url carries the page url without its fragment

The `intent://` url that reopens the current page in Chrome from an in-app browser on Android SHALL wrap the page url
with its fragment removed, so the first `#` in the url is the one that opens the intent's own `#Intent;...;end`
section. The browser fallback url SHALL stay the page url, encoded.

#### Scenario: A page url with a fragment opens in Chrome

- **GIVEN** a page at `https://carlnotes.example/topics/abc#findings`
- **WHEN** the intent url is built
- **THEN** it starts `intent://carlnotes.example/topics/abc#Intent;scheme=https;`, with no `#findings` before the
  `#Intent`
