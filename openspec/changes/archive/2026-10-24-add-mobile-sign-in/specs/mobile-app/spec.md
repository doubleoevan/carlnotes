## MODIFIED Requirements

### Requirement: The api client is configured once at startup

The app SHALL configure `@carlnotes/client` once at startup with `configureApiClient`: the api base url, a `showError`
that shows the message natively, `headers` that return the session cookie the Expo client stores, `credentials: "omit"`,
and an `onUnauthorized` that signs the app out of a revoked session. It SHALL configure the auth client once at startup
too, with `configureAuthClient`: the api base url and the Expo client plugin over `expo-secure-store`, with the gate
cookie's name among the cookie prefixes it stores. Both calls SHALL run in the root layout's module scope, before any
screen runs a hook, and `configureAuthClient` SHALL throw an error if the auth client was already used. In development
the url SHALL reach the api that `bun run dev:api` serves on the machine, from the iOS simulator, the Android emulator,
and a phone on the same network; in production it SHALL be `https://carlnotes.com`. Choosing the url SHALL be pure logic
a `bun test` covers. A TanStack Query client SHALL wrap the app.

#### Scenario: A development build reaches the machine's api

- **WHEN** a phone on the same network opens the app against the dev server
- **THEN** api requests reach the machine serving `bun run dev:api`, not localhost on the phone

#### Scenario: A production build reaches the production api

- **WHEN** a production build chooses its api base url
- **THEN** the url is `https://carlnotes.com`, and the unit test covers both choices

#### Scenario: The clients are configured before the first screen

- **WHEN** the app launches
- **THEN** the api client and the auth client are configured in the root layout before any screen's hook runs, and a
  configuration after the first use throws an error

### Requirement: One screen proves the stack end to end

The app SHALL ship the home screen at the root route, behind the sign-in guard: the CarlNotes name in the display font,
body text in Karla, the user's name and avatar from the session, a swatch row of the Nightshift surfaces and
accents in the current mode, one public read through `@carlnotes/client` with its loading and error states, and a link
to the settings screen.

#### Scenario: The public read renders

- **WHEN** the screen opens with the api reachable
- **THEN** a loading state shows, then the public read's result renders through the typed client

#### Scenario: The error state shows natively

- **WHEN** the screen opens with the api unreachable
- **THEN** the screen shows its error state instead of crashing or hanging on the loading state

#### Scenario: The user's name and avatar show

- **WHEN** a user opens the home screen
- **THEN** it shows their name and their avatar at the session's version, or their initials when they have no image
