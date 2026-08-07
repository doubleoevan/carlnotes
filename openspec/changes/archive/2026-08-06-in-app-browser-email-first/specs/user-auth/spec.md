## ADDED Requirements

### Requirement: The session forms lead with the path that can succeed in the current browser

The login and signup forms SHALL detect an in-app browser from the user agent and, when one is found, present the email path first with its fields already open, rather than folded behind a link.

Google refuses OAuth inside an embedded webview and answers `403 disallowed_useragent`, so leading with a provider button there offers a path that cannot complete. Ordering by what can succeed is the whole of this requirement: the forms, their submit handlers, and the signup Turnstile check SHALL be unchanged.

In an ordinary browser the order SHALL stay as it is, with the provider buttons first and the email path revealed on request.

#### Scenario: A visitor arrives from a social app

- **GIVEN** a visitor opening the signup or login route inside an in-app browser
- **WHEN** the form renders
- **THEN** the email fields are already visible and come before the provider buttons

#### Scenario: A visitor arrives in an ordinary browser

- **GIVEN** a visitor opening the same route in a browser that is not embedded
- **WHEN** the form renders
- **THEN** the provider buttons come first and the email path stays behind its reveal, unchanged from today

#### Scenario: Both routes behave alike

- **WHEN** either the login or the signup route renders inside an in-app browser
- **THEN** both lead with email, since they share one layout and neither route decides this for itself

### Requirement: Provider buttons stay available inside an in-app browser

The provider buttons SHALL remain visible and enabled inside an in-app browser, below the email path. They SHALL NOT be hidden or disabled.

Detection reads a user agent, which is a guess rather than a fact: a webview we fail to recognize would otherwise lose a working button, and a visitor who knows their own browser keeps the choice. Not every provider fails either — the refusal is Google's, and other providers may complete in the same webview.

#### Scenario: The buttons survive the reorder

- **GIVEN** a visitor in an in-app browser
- **WHEN** the form renders with email first
- **THEN** the provider buttons are still present, still enabled, and still submit to the same handlers

### Requirement: The reorder explains itself in Carl's voice

A short notice SHALL accompany the reordered form, saying why email is being offered first, so the demotion reads as help rather than a page that is broken or arbitrary.

The notice SHALL be shown only when an in-app browser is detected.

#### Scenario: The notice appears with the reorder

- **WHEN** the form leads with email because an in-app browser was detected
- **THEN** a short notice explains why, in the product's own voice

#### Scenario: No notice in an ordinary browser

- **WHEN** the form renders in a browser that is not embedded
- **THEN** no notice is shown

### Requirement: Android offers a way back to a real browser, iOS names one

Inside an in-app browser on Android, the notice SHALL offer a link that reopens the current page in Chrome through an `intent://` url.

iOS offers no equivalent, so on iOS the notice SHALL instead tell the visitor to open the page from the in-app browser's own menu. The copy SHALL differ by platform rather than offering a link that cannot work.

#### Scenario: Android gets a link out

- **GIVEN** a visitor in an in-app browser on Android
- **WHEN** the notice renders
- **THEN** it offers a link that reopens the current page in Chrome

#### Scenario: iOS is told where to look

- **GIVEN** a visitor in an in-app browser on iOS
- **WHEN** the notice renders
- **THEN** it names the in-app browser's own menu as the way out, and offers no link that would fail

#### Scenario: The escape hatch never strands the visitor

- **WHEN** a visitor stays in the in-app browser rather than taking either route out
- **THEN** the email path in front of them still completes a signup or login on its own
