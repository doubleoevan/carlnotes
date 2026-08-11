# user-avatars Specification

## Purpose
TBD - created by archiving change social-profiles-and-sharing. Update Purpose after archive.
## Requirements
### Requirement: The default avatar is two initials taken from the username

A user's default avatar SHALL be a circle carrying exactly two letters: the initial of the username's adjective and the initial of its noun. `Bright-Macchiato` renders `BM`.

It SHALL NOT render one letter. A generated word list collides hard on first letters, so a single initial is close to no signal at all.

It SHALL NOT render a two-letter slice of one word. `Br` reads as a syllable, not as initials.

The letters SHALL come from the username, never from an OAuth provider's real name. Usernames are pseudonymous by design, and a provider display name can drift from the username the rest of the UI shows, so the avatar would stop matching the name beside it.

The letters SHALL be set in the display font, Architects Daughter, so the letters read in Carl's hand rather than as a system default.

#### Scenario: Both halves of the username contribute a letter

- **WHEN** the username `Bright-Macchiato` renders
- **THEN** the avatar shows `BM`

#### Scenario: A username with a collision suffix still yields two letters

- **WHEN** a username carrying a digit suffix renders
- **THEN** the avatar shows the adjective and noun initials only, and the digits contribute nothing

#### Scenario: A provider's real name is never used

- **GIVEN** a user who signed in with a provider that supplied a display name
- **WHEN** their avatar renders
- **THEN** its letters come from their username, not from that name

### Requirement: Every user has a username to draw from

Signup SHALL assign a username in the same hook that provisions the user's LiteLLM key, and the column SHALL be NOT NULL, so every avatar has initials to draw. A letter SHALL NOT be substituted from any other source, such as a provider display name or an email address.

#### Scenario: No letter is invented

- **WHEN** a user's avatar renders
- **THEN** its letters come from their username and from nowhere else

### Requirement: The tint is deterministic from the user id

The circle's background SHALL be chosen from a fixed palette of six tints, indexed by a hash of the **user id**.

It SHALL NOT be random, or the same person would change color between renders.

It SHALL NOT be hashed from the letters, which would give every user sharing initials the same color and waste the palette. It SHALL NOT be hashed from the username either, because a username change would move a person's color, and the color is the part of the avatar that carries recognition.

The palette SHALL be `#8c5a2b`, `#a3542e`, `#7a4a52`, `#6b6440`, `#4f5f5a`, `#8a4f6d`, and the letters SHALL be `#f6efe6`. That ink measures between 4.76:1 and 6.28:1 against the six tints, clearing AA for normal text and not only for large.

Every tint SHALL sit within the luminance range that keeps that contrast: relative luminance at or below **0.15**. Because a darker tint only gains contrast against light ink, this is a ceiling rather than a window, and it is what 4.5:1 against `#f6efe6` works out to. The six tints span 0.096 to 0.143, so the rule holds today with the least headroom on `#a3542e`.

The range SHALL be enforced by a test rather than left as a note, so a tint added later cannot quietly drop the ink below AA.

#### Scenario: Every tint is inside the contrast range

- **WHEN** the palette is checked
- **THEN** every tint's relative luminance is at or below 0.15, which is what keeps the ink at 4.5:1 or better

#### Scenario: A tint outside the range fails the build

- **WHEN** a tint lighter than the ceiling is added to the palette
- **THEN** the test fails rather than the ink silently dropping below AA

#### Scenario: The same user always gets the same tint

- **WHEN** a user's avatar renders twice
- **THEN** both renders carry the same tint, chosen by their user id

#### Scenario: A username change keeps the color

- **WHEN** a user changes their username
- **THEN** their letters change and their tint does not

#### Scenario: Shared initials do not share a tint

- **GIVEN** two users whose usernames yield the same two letters
- **WHEN** both avatars render
- **THEN** their tints are chosen independently from their user ids

### Requirement: One palette serves both themes, and the avatar is styled like the app's other controls

The same six tints SHALL be used in the light and dark themes. An avatar is an identity, and a color that changes when the reader flips the theme is a weaker identity than one that holds.

The letters stay legible in both themes without adjustment, because the circle supplies its own background, so the ink-to-tint contrast never depends on the page.

The circle's **edge** does depend on the page, and in the dark theme the tint does not carry it: the tints separate from the dark background by as little as 1.42:1 and from the dark card by 2.55:1, under the 3:1 a meaningful boundary needs, against 3.84:1 to 7.06:1 in light.

An avatar sits inside a link to its owner's profile page, so it SHALL take the same styling the app's other controls take: a border and the lift shadow, plus the standard focus-visible ring. That is what gives it an edge in the dark theme — the border token, not a bespoke ring invented for avatars — and the lift shadow gives it the same lift as every button and tile. Swapping the palette per theme SHALL NOT be used to solve this, since that would trade a stable identity color away to fix a problem that lives at the edge.

#### Scenario: A user's color survives a theme change

- **WHEN** a reader switches between light and dark
- **THEN** every avatar keeps the tint it had

#### Scenario: The circle reads as a shape on a dark page

- **WHEN** an avatar renders against the dark theme's background or card
- **THEN** its edge is readable, carried by the same border treatment the app's other controls use

#### Scenario: The avatar carries the control styling

- **WHEN** an avatar renders inside a link to a profile
- **THEN** it carries a border, the lift shadow, and the standard focus-visible ring, matching the app's buttons and tiles

#### Scenario: The avatar is reachable by keyboard

- **WHEN** a reader tabs to the link an avatar sits in
- **THEN** it takes focus visibly and activates to its owner's profile page

### Requirement: The initials render as inline SVG, and stored images are served by the avatar route

The generated avatar SHALL be rendered as SVG inline in the DOM. An SVG loaded as its own document cannot see the page's webfont, so its letters would silently fall back to a system face.

An uploaded avatar or an opted-in provider photo SHALL be served by `GET /api/avatars/:userId`: the stored upload streams from storage, and a provider photo redirects to the provider's own url. The stored image SHALL be served with `Cache-Control: no-store`, since one url per user outlives every change to the image behind it.

#### Scenario: In-app initials render inline

- **WHEN** a generated avatar renders in the app
- **THEN** its SVG is inline in the DOM and its letters use the page's display font

#### Scenario: A stored image is served by the route

- **WHEN** a user has an upload or an opted-in provider photo
- **THEN** the route streams the upload or redirects to the provider photo

### Requirement: A public avatar resolves upload, the provider photo, then initials

A user's avatar SHALL resolve in this order:

1. an uploaded avatar
2. a provider photo, opt-in only
3. the initials on their tint

The route resolves the source server-side and SHALL answer 404 when a user is on the generated avatar, which is the signal for the client to draw the initials. Carl and the app's system actors never render through the user avatar path; they carry the app's own mug branding where they appear.

#### Scenario: An upload wins

- **WHEN** a user has uploaded an avatar
- **THEN** it renders, whatever else is available

#### Scenario: A user with no published avatar falls through to initials

- **GIVEN** a user who has neither uploaded an avatar nor opted in to their provider photo
- **WHEN** their avatar resolves
- **THEN** the route answers 404 and the initials render

### Requirement: The provider photo is private until the user opts in

The provider photo SHALL NOT be published for a user who has not opted in. Resolving a provider photo sends a hash of the user's email address to a third party, and does so on behalf of whoever is viewing the page, so it SHALL NOT happen as a side effect of having signed up.

The opt-in SHALL be a single unchecked checkbox on the account page, beside the other avatar controls, so one screen holds every choice about how a user appears. It SHALL NOT be shown at signup, where the decision in front of the user is authentication, and SHALL NOT interrupt creating or editing a Topic, where it is friction inside an unrelated task.

Better Auth's `user.image`, written when a provider returns a photo at sign-in, SHALL stay private. It SHALL render only in account pages and SHALL NOT become a public avatar.

Opting out SHALL return the user to the initials and delete any stored object the previous source left behind.

#### Scenario: Signing in with a provider publishes nothing

- **WHEN** a user signs in with a provider that returns a photo
- **THEN** their public avatar is unchanged and the photo renders only in account pages

#### Scenario: The opt-in sits with the avatar controls

- **WHEN** a user opens their account page
- **THEN** a single unchecked checkbox offers to publish their provider photo

#### Scenario: A viewer never triggers an un-opted request

- **WHEN** a visitor views the profile of a user who has not opted in
- **THEN** their provider photo is not served

#### Scenario: Opting out returns the initials

- **WHEN** a user who opted in opts out
- **THEN** their avatar resolves to the initials again

### Requirement: An avatar never stands nameless

Wherever an avatar identifies another user, the username SHALL be readable beside it — the byline text, the table cell, the search row, or the profile heading. An avatar SHALL NOT be the only identification of its user, so the name reaches a screen reader and a touch device without a hover.

#### Scenario: The username stands beside the avatar

- **WHEN** an avatar renders in a byline, a table row, a search result, or a profile header
- **THEN** that user's username is visible text beside it

