## ADDED Requirements

### Requirement: A pending invitation matches its recipient by a verified address

The pending Topic invitations the Activity page lists, and the accept and decline of one from that page, SHALL match
the signed-in user the way acceptance by token does: a username invitation, which names their account in
`invited_user_id` and has no address, matches outright, and an email invitation matches by its address alone, only if
the user's address is verified, whatever account it resolved to when it was sent. An unverified address SHALL match no
email invitation, so an account signed up with someone else's address sees none of that person's invitations and can
accept none of them.

#### Scenario: A verified address lists its invitations

- **WHEN** a user whose address is verified opens the Activity page while an invitation was sent to that address
- **THEN** the invitation is listed, and accepting it from the page subscribes them to its Topic

#### Scenario: An unverified address lists none

- **WHEN** a user whose address is unverified opens the Activity page while an invitation was sent to that address
- **THEN** the invitation is absent, and accepting it by id from that page is refused

#### Scenario: A username invitation needs no verified address

- **WHEN** a user whose address is unverified holds an invitation that names their account
- **THEN** the invitation is listed and accepts from the page
