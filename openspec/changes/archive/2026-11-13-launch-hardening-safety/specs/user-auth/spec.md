## ADDED Requirements

### Requirement: A change of email is counted by user

A request to change an account's email SHALL be counted per signed-in user over a day, beside the per-address limit,
and a request past the user's daily limit of a few requests SHALL be rejected before any email is sent, so one
account cannot mail verification links to a list of strangers' addresses.

#### Scenario: An unverified account's loop is stopped

- **WHEN** one unverified password account sends a change request for a new address every few seconds
- **THEN** the requests past its daily limit are rejected, and no email is sent for them

#### Scenario: The count follows the user

- **WHEN** one user sends change requests from many client addresses in a day
- **THEN** they count against that user's one limit

#### Scenario: A user changes their email once

- **WHEN** a signed-in user requests one change of email
- **THEN** the request is accepted and its links are sent as before

### Requirement: The Turnstile check has a time limit

The server's check of a Turnstile token against Cloudflare SHALL be abandoned after five seconds, and a check that
timed out SHALL read as a failed check, so a slow response from Cloudflare never holds a signup or a reset request
open.

#### Scenario: A check that times out fails the signup

- **WHEN** a password signup's Turnstile check gets no response from Cloudflare within five seconds
- **THEN** no `users` row is created, and the form shows the failed check as it does for an invalid token
