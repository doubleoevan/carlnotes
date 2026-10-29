# terms-acceptance Specification

## Purpose
The Terms carry a version that every account accepts before it posts for other people to read, and both apps publish
the way to reach the operator.

## Requirements

### Requirement: The Terms carry a version and prohibit objectionable content

The published Terms SHALL state a version date and SHALL hold a section that defines and prohibits objectionable
content and abuse, says reported content is reviewed within a day and removed when it breaks the rules, says the
posting account may be suspended or closed, and prohibits sexual content involving minors as removed and reported.
The wording SHALL be published only after the owner approves it, and the date SHALL change only when what a person
agrees to changes.

#### Scenario: The Terms page shows the version and the section

- **WHEN** a visitor opens the Terms page on either app
- **THEN** the first line names the version date and the page holds the objectionable content and removals section

#### Scenario: A wording fix keeps the version

- **WHEN** the Terms change in wording without changing what a person agrees to
- **THEN** the version date stays and no account is asked to accept again

### Requirement: Every sign-up path records acceptance of the current version

Every sign-up on both apps, by email and password, Google, Apple, or GitHub, SHALL show that continuing accepts the
Terms and the Privacy policy, with both linked, and SHALL record the version accepted and the time on the account the
sign-up creates. The record SHALL be written by the server from the version it publishes, never from a version the
client sends.

#### Scenario: A provider sign-up records the version

- **WHEN** a visitor creates an account with Apple on the app
- **THEN** the account holds the current Terms version and the acceptance time

#### Scenario: A password sign-up records the version

- **WHEN** a visitor creates an account by email on the web
- **THEN** the account holds the current Terms version and the acceptance time

### Requirement: An existing account accepts the current version once

An account whose recorded version is older than the published one, or missing, SHALL be asked, in a dialog on its
next signed-in load on either app, to accept the current Terms, with the Terms and Privacy linked and the option to put
it off. Accepting SHALL record the version and time. The dialog SHALL NOT appear again on any device once accepted.
Putting it off SHALL keep reading open until the next write rejected for the Terms, which asks again. A session from an
api that reports no version SHALL see no dialog, so a client never asks for an acceptance it cannot record.

#### Scenario: The dialog shows once across devices

- **WHEN** a user accepts the current version on the web and then opens the app
- **THEN** the app shows no dialog

#### Scenario: Putting it off keeps reading open

- **WHEN** a user chooses Not now, or closes the dialog
- **THEN** nothing is recorded, the dialog closes, reading stays open, and the next write rejected for the Terms opens
  it again

#### Scenario: An api without a version asks for nothing

- **WHEN** a signed-in session comes from an api that reports no accepted version
- **THEN** no dialog shows

### Requirement: A user-content write needs the current version accepted

A write that other users read, a room message, a note or its body, a note comment, a Team, a username, or a Topic
that is invite or public, SHALL be rejected while the account's recorded version is older than the published one, with
a response the clients turn into the acceptance dialog. Reading, searching, and private writes SHALL stay open.

#### Scenario: A post before acceptance opens the dialog

- **WHEN** a user whose version is stale posts a room message
- **THEN** the post is rejected, the dialog opens, and accepting then re-sends the kept draft

#### Scenario: A private Topic is saved without acceptance

- **WHEN** a user whose version is stale saves a private Topic
- **THEN** the save succeeds

### Requirement: The operator's contact is published in both apps

Both apps SHALL publish support@carlnotes.com, the address the Terms and Privacy pages name, as the one way to reach
the operator: as a Contact entry in the footer beside Privacy, Terms, and License, and on the mobile Settings screen
beside its existing legal links. The entry SHALL open the device's mail app with the address, and no other address
SHALL be published.

#### Scenario: The footer reaches the operator

- **WHEN** a visitor chooses Contact in either app's footer
- **THEN** a mail draft to support@carlnotes.com opens

#### Scenario: The Settings screen reaches the operator

- **WHEN** a user opens the mobile Settings screen
- **THEN** a Contact row sits beside Privacy and Terms and opens the same mail draft
